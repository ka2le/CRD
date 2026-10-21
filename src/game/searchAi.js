// "Search AI (Medium)": a browser-side version of the offline rollout teacher
// (see rolloutSearch.js / docs/AI_SEARCH.md, docs/AI_PREP_V5.md). For every legal
// choice it samples worlds consistent with what the searching seat can actually see,
// finishes the game and picks the choice with the best average match result.
// Decisions searched: draft picks, discard passes and every pre-battle preparation step
// (which special to activate next, its copy/recycle target, skip or finish).
//
// Rollouts ("prep-lookahead" completion, the strongest non-neural setup offline):
// draft/discard choices inside a rollout use the Rules AI, but each preparation step
// inside a rollout tries every option to the end of that sampled world and keeps the best.
//
// Information boundary: the searcher never reads the real deck order or the
// other seat's private hand or private preparation. Hidden cards are re-dealt
// uniformly at random from everything it has not seen.
import { createSeededRng, getCoreCards, shuffle } from './cards.js'
import { getLegalActions, stepHeadlessGame } from './headlessGame.js'
import { chooseDiscardIds, pickBestCardForHand } from './cardEvaluator.js'
import { pickPreparationAction } from './preBattle.js'
import { applyPreparationAction, getPreparationActions } from './preparationState.js'
import { resolveTabletopBattle, chooseTabletopType, toTabletopCard, normalizeTabletopRules } from './tabletop.js'

export const SEARCH_AI_VERSION = 'browser-root-rollout-v2-prep-lookahead'

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

function outcomeFor(terminal, side) {
  const tabletop = terminal.battleResult.playerHand.some((card) => card.tabletop)
    || terminal.battleResult.opponentHand.some((card) => card.tabletop)
  const { winner } = tabletop
    ? resolveTabletopBattle(terminal.battleResult.playerHand, terminal.battleResult.opponentHand, {
      playerType: chooseTabletopType(terminal.battleResult.playerHand),
    }) : terminal.battleResult
  if (winner === 'tie') return 0
  return winner === side ? 1 : -1
}

function finishWithRules(state, maxDecisions = 400) {
  let current = state
  let guard = 0
  while (!current.terminal) {
    if (++guard > maxDecisions) throw new Error('Search rollout exceeded decision guard')
    current = stepHeadlessGame(current, rulesAction(current))
  }
  return current
}

// Rollout policy. Preparation steps look one step ahead inside the sampled world (every legal
// option, Rules AI afterwards) and keep the best for the acting seat; everything else is the
// Rules AI. Perfect information WITHIN a sample only - never applied to the real game.
function rolloutAction(state) {
  if (!state.preparation) return rulesAction(state)
  const legal = getLegalActions(state)
  if (legal.length <= 1) return legal[0]
  const side = state.actor
  const baseline = rulesAction(state)
  const ordered = [legal.find((action) => sameAction(action, baseline)) ?? legal[0],
    ...legal.filter((action) => !sameAction(action, baseline))]
  let best = ordered[0]
  let bestValue = -Infinity
  for (const action of ordered) {
    const value = outcomeFor(finishWithRules(stepHeadlessGame(state, action)), side)
    if (value > bestValue) {
      best = action
      bestValue = value
    }
    if (bestValue === 1) break
  }
  return best
}

// rollout: 'prep-lookahead' (SvenBot) or 'rules' (shallow: Rules AI plays every rollout step).
function playOut(state, side, rollout = 'prep-lookahead', maxDecisions = 400) {
  if (rollout === 'rules') return outcomeFor(finishWithRules(state, maxDecisions), side)
  let current = state
  let guard = 0
  while (!current.terminal) {
    if (++guard > maxDecisions) throw new Error('Search rollout exceeded decision guard')
    current = stepHeadlessGame(current, rolloutAction(current))
  }
  return outcomeFor(current, side)
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
  const { minSamples, maxSamples, timeBudgetMs, seed, rollout, margin } = { ...DEFAULT_OPTIONS, ...options }
  if (!isSearchDecision(game, side)) throw new Error('Search AI called outside a draft/discard decision')
  const sampleWorld = game.mode === 'draft' ? sampleDraftWorld : sampleDiscardWorld
  const rng = createSeededRng(Number.isSafeInteger(seed) ? seed : Math.floor(Math.random() * 0x7fffffff))
  const started = now()

  const firstWorld = sampleWorld(game, side, rng)
  const actions = getLegalActions(firstWorld)
  const baseline = rulesAction(firstWorld)
  const baselineIndex = Math.max(0, actions.findIndex((action) => sameAction(action, baseline)))

  if (actions.length <= 1) {
    return { action: actions[0] ?? baseline, samples: 0, values: [], baselineIndex, chosenIndex: 0, elapsedMs: 0 }
  }

  return runSearch({ firstWorld, sampleWorld: () => sampleWorld(game, side, rng), actions, baselineIndex, side,
    minSamples, maxSamples, timeBudgetMs, started, rollout, margin })
}

// Common random numbers: every candidate is played out in the same sampled world.
function runSearch({ firstWorld, sampleWorld, actions, baselineIndex, side, minSamples, maxSamples, timeBudgetMs, started, rollout, margin = 0 }) {
  const totals = new Array(actions.length).fill(0)
  let samples = 0
  let world = firstWorld
  while (samples < maxSamples) {
    for (let index = 0; index < actions.length; index += 1) {
      totals[index] += playOut(stepHeadlessGame(world, actions[index]), side, rollout)
    }
    samples += 1
    if (samples >= minSamples && now() - started >= timeBudgetMs) break
    world = sampleWorld()
  }

  // Highest mean wins; ties go to the Rules AI's own choice, then to the earlier option.
  let chosenIndex = baselineIndex
  totals.forEach((total, index) => {
    if (total > totals[chosenIndex]) chosenIndex = index
  })
  // `margin` (mean result, -1..1): a shallow search only leaves the Rules AI's choice
  // when the alternative is clearly better in its few samples.
  if (margin > 0 && (totals[chosenIndex] - totals[baselineIndex]) / samples < margin) chosenIndex = baselineIndex

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

const PREPARATION_OPTIONS = { minSamples: 16, maxSamples: 96, timeBudgetMs: 250 }
const isCopiedCard = (card) => Boolean(card.isCopiedCard) || card.uid.includes('__copy__')

// Everything one seat may use for a preparation decision. Own preparation is fully known.
// The rival's pre-preparation hand is public in draft (both drafts are open) and private in
// the discard mode. The rival's private preparation (its draws, recycles, copies) is unknown:
// its resulting cards rejoin the unseen pool and it re-prepares from its pre-preparation hand
// inside each rollout. Unseen cards are sorted by UID, so no real deck order can leak.
export function preparationView(preparation, game, side = 'opponent') {
  const enemy = otherSide(side)
  const enemyPublicHand = game.mode === 'draft' ? plainCards(game[`${enemy}Hand`]) : null
  const enemyPublicPile = plainCards(game.mode === 'draft' ? (game.draftDiscard ?? [])
    : (game[`${enemy}Discards`] ?? game.draftDiscard ?? []))
  const known = new Set([
    ...preparation[`${side}Hand`], ...preparation[`${side}Discard`],
    ...(enemyPublicHand ?? []), ...enemyPublicPile,
  ].map((card) => card.uid))
  const tabletop = normalizeTabletopRules([...preparation.playerHand, ...preparation.opponentHand, ...preparation.deck]
    .find((card) => card.tabletop)?.tabletop)
  const definitions = new Map(getCoreCards({ tabletop }).map((card) => [card.id, tabletop ? toTabletopCard(card, tabletop) : card]))
  const unseen = new Map()
  for (const card of [...preparation.deck, ...preparation[`${enemy}Hand`], ...preparation[`${enemy}Discard`]]) {
    // A private copy turned a physical Copy card into another card: restore the physical card.
    const physical = isCopiedCard(card)
      ? (card.sourceCopyUid && definitions.has(card.copySourceCardId)
        ? { ...definitions.get(card.copySourceCardId), uid: card.sourceCopyUid, imageIndex: 0 } : null)
      : plainCard(card)
    if (physical && !known.has(physical.uid)) unseen.set(physical.uid, physical)
  }
  return {
    mode: game.mode,
    side,
    ownHand: plainCards(preparation[`${side}Hand`]),
    ownDiscard: plainCards(preparation[`${side}Discard`]),
    ownActivated: [...(preparation[`${side}Activated`] ?? [])],
    enemyPublicHand,
    enemyHandCount: game[`${enemy}Hand`].length,
    enemyPublicPile,
    unseen: [...unseen.values()].sort(byUid),
  }
}

function samplePreparationWorld(view, rng) {
  const { side } = view
  const enemy = otherSide(side)
  const unseen = shuffle([...view.unseen], { rng })
  const enemyHand = view.enemyPublicHand ?? unseen.splice(0, view.enemyHandCount)
  const game = {
    mode: view.mode, phase: 'battle-ready', deck: unseen, recentMoves: [],
    [`${side}Hand`]: view.ownHand, [`${enemy}Hand`]: enemyHand,
  }
  // The rival's preparation is replayed inside the rollout (serialization order is irrelevant:
  // both preparations are private and draw from the same uniformly shuffled unseen pool).
  return {
    ...makeState(game, side),
    preparation: {
      deck: unseen,
      [`${side}Hand`]: view.ownHand, [`${side}Discard`]: view.ownDiscard,
      [`${side}Activated`]: view.ownActivated, [`${side}Finished`]: false, [`${side}DrawnCount`]: 0,
      [`${enemy}Hand`]: enemyHand, [`${enemy}Discard`]: view.enemyPublicPile,
      [`${enemy}Activated`]: [], [`${enemy}Finished`]: false, [`${enemy}DrawnCount`]: 0,
    },
  }
}

/** One searched preparation step for `side` (activate which special / target, skip, or finish). */
export function searchPreparationDecision(preparation, game, side = 'opponent', options = {}) {
  const { minSamples, maxSamples, timeBudgetMs, seed, rollout } = { ...PREPARATION_OPTIONS, ...options }
  const actions = getPreparationActions(preparation, side)
  const baseline = pickPreparationAction(preparation, side)
  const baselineIndex = Math.max(0, actions.findIndex((action) => sameAction(action, baseline)))
  if (actions.length <= 1) {
    return { action: actions[0] ?? baseline, samples: 0, values: [], baselineIndex, chosenIndex: 0, elapsedMs: 0 }
  }
  const view = preparationView(preparation, game, side)
  const rng = createSeededRng(Number.isSafeInteger(seed) ? seed : Math.floor(Math.random() * 0x7fffffff))
  const started = now()
  return runSearch({ firstWorld: samplePreparationWorld(view, rng), sampleWorld: () => samplePreparationWorld(view, rng),
    actions, baselineIndex, side, minSamples, maxSamples, timeBudgetMs, started, rollout })
}

/**
 * Plays the whole preparation for `side` on the REAL preparation state: each step is chosen by
 * searchPreparationDecision (which only sees preparationView), then applied with the real deck.
 * Stops after finish or once no unused special remains, like completeOpponentPreBattle.
 */
export function searchSidePreparation(preparation, game, side = 'opponent', options = {}) {
  let current = preparation
  const steps = []
  for (let guard = 0; guard < 64 && !current[`${side}Finished`]; guard += 1) {
    const actions = getPreparationActions(current, side)
    if (actions.length <= 1) break
    const seed = Number.isSafeInteger(options.seed) ? options.seed + guard * 7919 : undefined
    const result = searchPreparationDecision(current, game, side, { ...options, seed })
    steps.push({ action: result.action, samples: result.samples, elapsedMs: result.elapsedMs })
    current = applyPreparationAction(current, side, result.action)
  }
  return { preparation: current, steps }
}

export function chooseSearchDraftPickUid(game, options = {}) {
  return searchDecision(game, 'opponent', options).action.uid
}

export function chooseSearchDiscardIds(game, options = {}) {
  return searchDecision(game, 'opponent', options).action.selectedIds
}
