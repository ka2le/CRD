// "Search AI (Medium)": a browser-side version of the offline rollout teacher
// (see rolloutSearch.js / docs/AI_SEARCH.md). For every legal choice it samples
// worlds consistent with what the searching seat can actually see, finishes the
// game with the Rules AI heuristics for both seats (draft/discard, preparation)
// and exact combat, and picks the choice with the best average match result.
//
// Information boundary: the searcher never reads the real deck order or the
// other seat's private hand. Hidden cards are re-dealt uniformly at random from
// everything it has not seen. Preparation stays on the Rules AI.
import { createSeededRng, shuffle } from './cards.js'
import { getLegalActions, stepHeadlessGame } from './headlessGame.js'
import { chooseDiscardIds, pickBestCardForHand } from './cardEvaluator.js'
import { pickPreparationAction } from './preBattle.js'

export const SEARCH_AI_VERSION = 'browser-root-rollout-v1'

const DEFAULT_OPTIONS = {
  minSamples: 8,
  maxSamples: 48,
  timeBudgetMs: 650,
}

const otherSide = (side) => (side === 'player' ? 'opponent' : 'player')
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

function plainCard(card) {
  // Drop UI-only fields (animation flags) so rollouts work on clean card objects.
  if (!('draftAnimation' in card)) return card
  const clean = { ...card }
  delete clean.draftAnimation
  return clean
}

const plainCards = (cards = []) => cards.map(plainCard)

// Hidden cards are put in a canonical order before shuffling, so the search result can
// never depend on the real (secret) deck order or on which unseen cards the rival holds.
const byUid = (a, b) => (a.uid < b.uid ? -1 : (a.uid > b.uid ? 1 : 0))
const shuffleHidden = (cards, rng) => shuffle(plainCards(cards).sort(byUid), { rng })

function makeState(game, side) {
  return {
    config: { mode: game.mode, wildDeck: true, control: 'both', revealOpponent: false },
    game,
    history: [],
    decisions: { player: 0, opponent: 0 },
    actor: side,
    preparation: null,
    terminal: false,
    battleResult: null,
  }
}

// Draft: both hands, the row and the discard pile are public. Only the deck order is unknown.
function sampleDraftWorld(game, side, rng) {
  return makeState({
    mode: 'draft',
    phase: side === 'opponent' ? 'draft-opponent-thinking' : 'draft-player-pick',
    deck: shuffleHidden(game.deck, rng),
    draftRow: plainCards(game.draftRow),
    draftDiscard: plainCards(game.draftDiscard),
    playerHand: plainCards(game.playerHand),
    opponentHand: plainCards(game.opponentHand),
    firstPicker: game.firstPicker,
    currentPicker: side,
    pendingOpponentPickUid: null,
    picksThisPack: game.picksThisPack,
    packNumber: game.packNumber,
    recentMoves: [],
  }, side)
}

// Discard: the other seat's hand is private. Re-deal it, together with the deck, from every
// card the searcher has not seen (its own hand and the public discard pile are known).
function sampleDiscardWorld(game, side, rng) {
  const enemy = otherSide(side)
  const enemyHand = game[`${enemy}Hand`]
  const unseen = shuffleHidden([...enemyHand, ...game.deck], rng)
  return makeState({
    mode: 'five-hand-discard',
    phase: game.phase,
    deck: unseen.slice(enemyHand.length),
    [`${side}Hand`]: plainCards(game[`${side}Hand`]),
    [`${enemy}Hand`]: unseen.slice(0, enemyHand.length),
    playerDiscardsUsed: game.playerDiscardsUsed,
    opponentDiscardsUsed: game.opponentDiscardsUsed ?? 0,
    playerDiscards: plainCards(game.playerDiscards),
    opponentDiscards: plainCards(game.opponentDiscards),
    recentMoves: [],
  }, side)
}

// Rules AI policy for both seats, identical to the browser/headless baseline.
function rulesAction(state) {
  if (state.preparation) return pickPreparationAction(state.preparation, state.actor)
  const hand = state.game[`${state.actor}Hand`]
  if (state.game.mode === 'draft') {
    return { type: 'draft-pick', uid: pickBestCardForHand(state.game.draftRow, hand)?.uid }
  }
  return { type: 'discard', selectedIds: chooseDiscardIds(hand, { discardCount: 2 }) }
}

function sameAction(a, b) {
  if (a.type !== b.type) return false
  if (a.type === 'draft-pick') return a.uid === b.uid
  if (a.type === 'discard') {
    return a.selectedIds.length === b.selectedIds.length && a.selectedIds.every((uid) => b.selectedIds.includes(uid))
  }
  return a.sourceUid === b.sourceUid && a.targetUid === b.targetUid
}

function playOut(state, side, maxDecisions = 400) {
  let current = state
  let guard = 0
  while (!current.terminal) {
    if (++guard > maxDecisions) throw new Error('Search rollout exceeded decision guard')
    current = stepHeadlessGame(current, rulesAction(current))
  }
  const { winner } = current.battleResult
  if (winner === 'tie') return 0
  return winner === side ? 1 : -1
}

export function isSearchDecision(game, side = 'opponent') {
  if (!game) return false
  if (game.mode === 'draft') {
    return game.currentPicker === side && game.phase === `draft-${side === 'player' ? 'player-pick' : 'opponent-thinking'}`
      && game.draftRow.length > 0 && game[`${side}Hand`].length < 5
  }
  if (game.mode === 'five-hand-discard') return game.phase.startsWith(`${side}-discard`)
  return false
}

/**
 * Evaluate every legal choice for `side` in a draft or discard decision.
 * `game` uses the browser/headless game shape. Returns the chosen action plus diagnostics.
 */
export function searchDecision(game, side = 'opponent', options = {}) {
  const { minSamples, maxSamples, timeBudgetMs, seed } = { ...DEFAULT_OPTIONS, ...options }
  if (!isSearchDecision(game, side)) throw new Error('Search AI called outside a draft/discard decision')
  const sampleWorld = game.mode === 'draft' ? sampleDraftWorld : sampleDiscardWorld
  const rng = createSeededRng(Number.isSafeInteger(seed) ? seed : Math.floor(Math.random() * 0x7fffffff))
  const started = now()

  const firstWorld = sampleWorld(game, side, rng)
  const actions = getLegalActions(firstWorld)
  const baseline = rulesAction(firstWorld)
  const baselineIndex = Math.max(0, actions.findIndex((action) => sameAction(action, baseline)))
  const totals = new Array(actions.length).fill(0)

  if (actions.length <= 1) {
    return { action: actions[0] ?? baseline, samples: 0, values: [], baselineIndex, chosenIndex: 0, elapsedMs: 0 }
  }

  let samples = 0
  let world = firstWorld
  while (samples < maxSamples) {
    // Common random numbers: every candidate is played out in the same sampled world.
    for (let index = 0; index < actions.length; index += 1) {
      totals[index] += playOut(stepHeadlessGame(world, actions[index]), side)
    }
    samples += 1
    if (samples >= minSamples && now() - started >= timeBudgetMs) break
    world = sampleWorld(game, side, rng)
  }

  // Highest mean wins; ties go to the Rules AI's own choice, then to the earlier option.
  let chosenIndex = baselineIndex
  totals.forEach((total, index) => {
    if (total > totals[chosenIndex]) chosenIndex = index
  })

  return {
    action: actions[chosenIndex],
    chosenIndex,
    baselineIndex,
    samples,
    values: totals.map((total) => total / samples),
    elapsedMs: now() - started,
    version: SEARCH_AI_VERSION,
  }
}

export function chooseSearchDraftPickUid(game, options = {}) {
  return searchDecision(game, 'opponent', options).action.uid
}

export function chooseSearchDiscardIds(game, options = {}) {
  return searchDecision(game, 'opponent', options).action.selectedIds
}
