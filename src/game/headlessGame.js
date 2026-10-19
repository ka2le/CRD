import {
  createDraftGame, applyDraftPick, resolveOpponentDraftPick, commitDraftDiscard, revealNextDraftPack,
} from './draftMode.js'
import { createFiveHandDiscardGame, applyDiscardPhase, applyOpponentDiscardPhase } from './fiveHandDiscard.js'
import { getCoreCards, getExpandedCoreDeck } from './cards.js'
import { getHandStats, simulateBattle } from './engine.js'
import { chooseDiscardIds, pickBestCardForHand } from './cardEvaluator.js'
import { pickPreparationAction } from './preBattle.js'
import { applyPreparationAction, createPreparationState, getPreparationActions } from './preparationState.js'

export const HEADLESS_PROTOCOL_VERSION = 2
export const HEADLESS_RULES_VERSION = 'digital-21-50-preparation-v1'
const SIDES = ['player', 'opponent']
const otherSide = (side) => side === 'player' ? 'opponent' : 'player'

function summarizeCard(card) {
  return {
    uid: card.uid, id: card.id, name: card.name, type: card.type,
    stats: [...(card.stats ?? [])], effect: { ...(card.effect ?? {}) }, cd: card.cd ?? null,
  }
}

function configuredDeck(config) {
  if (config.deck === undefined) return null
  if (!Array.isArray(config.deck)) throw new Error('deck must be an array')
  const definitions = new Map(getCoreCards().map((card) => [card.id, card]))
  const seen = new Set()
  return config.deck.map((entry) => {
    if (!entry || typeof entry.uid !== 'string' || !entry.uid || seen.has(entry.uid)) {
      throw new Error('Injected deck cards need unique nonempty string UIDs')
    }
    const definition = definitions.get(entry.id)
    if (!definition) throw new Error(`Unsupported injected card ${entry.id}`)
    seen.add(entry.uid)
    return { ...definition, uid: entry.uid, imageIndex: 0 }
  })
}

export function getHeadlessSpec(config = {}) {
  const pool = configuredDeck(config) ?? getExpandedCoreDeck({ wildDeck: config.wildDeck ?? true })
  // A recycle adds one card; at most every original recycle and copy source can do so.
  const maxHandCards = pool.length + pool.filter((card) => (
    card.id === 'recycle_card' || card.id === 'copy_card_in_hand'
  )).length
  return {
    protocolVersion: HEADLESS_PROTOCOL_VERSION,
    rulesVersion: HEADLESS_RULES_VERSION,
    cardTypes: getCoreCards().map((card) => ({
      id: card.id, type: card.type, stats: [...(card.stats ?? [])], effect: { ...(card.effect ?? {}) },
      cd: card.cd ?? null, copies: card.copies,
    })),
    poolCounts: getCoreCards().map((definition) => pool.filter((card) => card.id === definition.id).length),
    // Public physical-card catalog, deliberately sorted rather than in deal/shuffle order.
    poolCards: pool.map((card) => ({ id: card.id, uid: card.uid }))
      .sort((a, b) => a.uid < b.uid ? -1 : (a.uid > b.uid ? 1 : 0)),
    maxHandCards,
    maxLegalActions: Math.max(32, 1 + maxHandCards * (maxHandCards + 1)),
    actionTypes: ['draft-pick', 'discard', 'prepare', 'skip-preparation', 'finish-preparation'],
  }
}

function discardActions(hand) {
  return Array.from({ length: 2 ** hand.length }, (_, mask) => ({
    type: 'discard', mask,
    selectedIds: hand.filter((_, index) => (mask & (1 << index)) !== 0).map((card) => card.uid),
  }))
}

export function getLegalActions(state) {
  if (state.terminal) return []
  if (state.preparation) return getPreparationActions(state.preparation, state.actor)
  if (state.game.mode === 'draft') {
    return state.game.draftRow.map((card, index) => ({
      type: 'draft-pick', uid: card.uid, index, card: summarizeCard(card),
    }))
  }
  return discardActions(state.game[`${state.actor}Hand`])
}

function resolveAction(state, action) {
  const legal = getLegalActions(state)
  if (Number.isInteger(action)) {
    if (action >= 0 && action < legal.length) return legal[action]
    throw new Error(`Illegal action index ${action}`)
  }
  if (!action || typeof action !== 'object' || Array.isArray(action)) throw new Error('Action must be an object or legal-action index')
  if (action.actor !== undefined && action.actor !== state.actor) throw new Error('Wrong actor')
  if (action.type === 'discard') {
    let mask = action.mask
    if (action.selectedIds !== undefined) {
      const ids = action.selectedIds
      const hand = state.game[`${state.actor}Hand`]
      if (!Array.isArray(ids) || new Set(ids).size !== ids.length || ids.some((uid) => !hand.some((card) => card.uid === uid))) {
        throw new Error('Discard IDs must be a unique subset of the acting hand')
      }
      const selectedMask = hand.reduce((value, card, index) => value + (ids.includes(card.uid) ? 2 ** index : 0), 0)
      if (mask !== undefined && mask !== selectedMask) throw new Error('Discard mask and IDs disagree')
      mask = selectedMask
    }
    if (!Number.isInteger(mask)) throw new Error('Discard requires a mask or selectedIds')
    const match = legal.find((candidate) => candidate.type === 'discard' && candidate.mask === mask)
    if (match) return match
  } else {
    const match = legal.find((candidate) => candidate.type === action.type
      && candidate.uid === action.uid && candidate.sourceUid === action.sourceUid
      && candidate.targetUid === action.targetUid
      && (action.index === undefined || candidate.index === action.index)
      && (action.cardId === undefined || candidate.cardId === action.cardId))
    if (match) return match
  }
  throw new Error(`Illegal action for ${state.actor}:${state.preparation ? 'preparation' : state.game.phase}`)
}

function actorForGame(game) {
  if (game.mode === 'draft') return game.currentPicker
  return game.phase.startsWith('opponent-discard') ? 'opponent' : 'player'
}

function revealEvent(game) {
  return { scope: 'public', type: 'draft-pack', packNumber: game.packNumber, cards: game.draftRow.map(summarizeCard) }
}

// Only automatic bookkeeping is advanced here. Decisions always pass through legal actions.
function settle(state) {
  let { game, history, preparation } = state
  if (!preparation && game.mode === 'draft') {
    if (game.phase === 'draft-pack-clearing') {
      history = [...history, { scope: 'public', type: 'draft-discard', cards: game.draftRow.map(summarizeCard) }]
      game = commitDraftDiscard(game, { includeRecentMoves: false })
    }
    if (game.phase === 'draft-pack-dealing') {
      game = revealNextDraftPack(game, { includeRecentMoves: false, draftAnimation: 'idle' })
      history = [...history, revealEvent(game)]
    }
  }
  if (!preparation && game.phase === 'battle-ready') preparation = createPreparationState(game)
  if (preparation) {
    if (preparation.playerFinished && preparation.opponentFinished) {
      const battleResult = simulateBattle(preparation.playerHand, preparation.opponentHand, {
        ...(state.config.battleEvaluation ?? {}), deck: preparation.deck,
      })
      return { ...state, game, history, preparation, actor: null, terminal: true, battleResult }
    }
    // Internal serialization matches the browser: player preparation, then opponent at Battle.
    // Opponent observations still see only pre-preparation public information.
    return { ...state, game, history, preparation, actor: preparation.playerFinished ? 'opponent' : 'player' }
  }
  return { ...state, game, history, actor: actorForGame(game) }
}

function applyDecision(state, action) {
  const side = state.actor
  const scope = side
  let next = { ...state, decisions: { ...state.decisions, [side]: state.decisions[side] + 1 } }
  const event = { scope, type: action.type, side }
  if (state.preparation) {
    const before = state.preparation
    const after = applyPreparationAction(before, side, action)
    const drawn = before.deck.slice(0, before.deck.length - after.deck.length)
    next.preparation = after
    event.action = { ...action }
    event.drawn = drawn.map(summarizeCard)
    const target = (action.cardId === 'recycle_card' ? before[`${side}Discard`] : before[`${side}Hand`])
      .find((card) => card.uid === action.targetUid)
    if (target) event.target = summarizeCard(target)
  } else if (state.game.mode === 'draft') {
    const card = state.game.draftRow.find((entry) => entry.uid === action.uid)
    event.scope = 'public'
    event.card = summarizeCard(card)
    next.game = side === 'player'
      ? applyDraftPick(state.game, action.uid, { includeRecentMoves: false })
      : resolveOpponentDraftPick({ ...state.game, pendingOpponentPickUid: action.uid }, { includeRecentMoves: false })
  } else {
    const hand = state.game[`${side}Hand`]
    next.game = side === 'player'
      ? applyDiscardPhase(state.game, action.selectedIds, { includeRecentMoves: false, deferOpponent: true })
      : applyOpponentDiscardPhase(state.game, action.selectedIds, { includeRecentMoves: false })
    event.scope = 'public'
    event.cards = hand.filter((card) => action.selectedIds.includes(card.uid)).map(summarizeCard)
    next.history = [...state.history, {
      scope: state.config.revealOpponent ? 'public' : scope, side, type: 'refill',
      cards: state.game.deck.slice(0, state.game.deck.length - next.game.deck.length).map(summarizeCard),
    }]
  }
  next.history = [...next.history, event]
  return settle(next)
}

export function chooseHeadlessBaselineAction(state) {
  if (state.preparation) return pickPreparationAction(state.preparation, state.actor)
  const hand = state.game[`${state.actor}Hand`]
  if (state.game.mode === 'draft') {
    const index = typeof state.config.opponentStrategy === 'function'
      ? state.config.opponentStrategy(state.game.draftRow, { hand, observation: encodeObservation(state, state.actor) })
      : null
    const card = index === null ? pickBestCardForHand(state.game.draftRow, hand) : state.game.draftRow[index]
    return { type: 'draft-pick', uid: card?.uid }
  }
  const strategy = state.config.opponentDiscardStrategy ?? chooseDiscardIds
  return {
    type: 'discard',
    selectedIds: strategy(hand, {
      discardCount: state.config.opponentDiscardCount ?? 2, observation: encodeObservation(state, state.actor),
    }),
  }
}

function advanceToControlledDecision(state) {
  let next = state
  let guard = 0
  while (!next.terminal && next.config.control !== 'both' && next.actor !== next.config.control) {
    if (++guard > 10000) throw new Error('Automatic opponent exceeded decision guard')
    next = applyDecision(next, resolveAction(next, chooseHeadlessBaselineAction(next)))
  }
  return next
}

export function createHeadlessGame(config = {}) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('config must be an object')
  const mode = config.mode ?? 'five-hand-discard'
  const control = config.control ?? 'player'
  if (!['five-hand-discard', 'draft'].includes(mode)) throw new Error(`Unknown mode ${mode}`)
  if (![...SIDES, 'both'].includes(control)) throw new Error(`Unknown control ${control}`)
  if (config.firstPicker !== undefined && !SIDES.includes(config.firstPicker)) throw new Error('Invalid firstPicker')
  if (config.seed !== undefined && (!Number.isSafeInteger(config.seed) || config.seed < 0)) throw new Error('seed must be a nonnegative integer')
  for (const key of ['wildDeck', 'revealOpponent']) {
    if (config[key] !== undefined && typeof config[key] !== 'boolean') throw new Error(`${key} must be boolean`)
  }
  if (config.battleEvaluation !== undefined) {
    const { maxRounds = 50, damageToWin = 21 } = config.battleEvaluation
    if (!Number.isInteger(maxRounds) || maxRounds < 1 || !Number.isFinite(damageToWin) || damageToWin <= 0) {
      throw new Error('Invalid battle evaluation options')
    }
  }
  const deck = configuredDeck(config)
  if (deck && deck.length < (mode === 'draft' ? 25 : 10)) throw new Error('Injected deck too small for initial hand building')
  const options = { ...config, wildDeck: config.wildDeck ?? true, deck: deck ?? undefined }
  const game = mode === 'draft'
    ? createDraftGame({ ...options, includeRecentMoves: false, openingDraftAnimation: 'idle' })
    : createFiveHandDiscardGame(options)
  const history = mode === 'draft' ? [revealEvent(game)] : SIDES.map((side) => ({
    scope: config.revealOpponent ? 'public' : side, side,
    type: 'opening-hand', cards: game[`${side}Hand`].map(summarizeCard),
  }))
  return advanceToControlledDecision(settle({
    config: { ...config, mode, control }, game, history, preparation: null,
    decisions: { player: 0, opponent: 0 }, actor: null, terminal: false, battleResult: null,
  }))
}

export function stepHeadlessGame(state, action) {
  if (state.terminal) throw new Error('Episode is terminal; reset before stepping')
  return advanceToControlledDecision(applyDecision(state, resolveAction(state, action)))
}

function combatFeatures(hand) {
  const result = simulateBattle(hand, [], { maxRounds: 12, damageToWin: Number.MAX_VALUE })
  return {
    stats: getHandStats(hand),
    // Mechanics only: no enemy guess and no claim this partial hand is final.
    cycle: result.rounds.map((round) => [round.playerOutgoingDamage, round.playerShield]),
  }
}

export function encodeObservation(state, side = state.config.control === 'both' ? (state.actor ?? 'player') : state.config.control) {
  if (!SIDES.includes(side)) throw new Error(`Unknown observation side ${side}`)
  const { game, preparation, battleResult } = state
  const enemy = otherSide(side)
  const hand = preparation ? preparation[`${side}Hand`] : game[`${side}Hand`]
  // Private enemy preparation is never exposed to the other seat before the result.
  const knownEnemy = preparation && state.terminal ? preparation[`${enemy}Hand`] : game[`${enemy}Hand`]
  const visible = state.terminal || game.mode === 'draft' || Boolean(state.config.revealOpponent)
  const opponentHand = visible ? knownEnemy : []
  const publicDiscard = game.mode === 'draft' ? game.draftDiscard : game.playerDiscards
  const discard = preparation ? preparation[`${side}Discard`] : (game[`${side}Discards`] ?? publicDiscard ?? [])
  return {
    mode: game.mode,
    phase: state.terminal ? 'finished' : (preparation ? 'preparation' : game.phase),
    side, actor: state.actor,
    steps: state.decisions[side],
    wildDeck: state.config.wildDeck ?? true,
    // Before terminal, count only this seat's private consumption of the shared deck.
    deckCount: preparation && !state.terminal
      ? game.deck.length - preparation[`${side}DrawnCount`] : (preparation?.deck ?? game.deck).length,
    deckCountIsExact: !preparation || state.terminal,
    playerHand: hand.map(summarizeCard),
    activatedUids: [...(preparation?.[`${side}Activated`] ?? [])],
    opponentHandCount: knownEnemy.length,
    opponentHand: opponentHand.map(summarizeCard),
    opponentHandIsCurrent: !preparation || state.terminal,
    draftRow: (game.draftRow ?? []).map(summarizeCard),
    packNumber: game.packNumber ?? 0,
    picksThisPack: game.picksThisPack ?? 0,
    firstPicker: game.firstPicker ?? null,
    playerDiscardsUsed: game[`${side}DiscardsUsed`] ?? 0,
    opponentDiscardsUsed: game[`${enemy}DiscardsUsed`] ?? 0,
    discardCount: discard.length,
    discardPile: (publicDiscard ?? []).map(summarizeCard),
    recycleCards: discard.map(summarizeCard),
    history: structuredClone(state.history.filter((event) => event.scope === 'public' || event.scope === side)),
    ownCombat: combatFeatures(hand),
    knownOpponentCombat: combatFeatures(opponentHand),
    terminal: state.terminal,
    battle: battleResult ? {
      rounds: battleResult.rounds.length,
      playerTotalDamageDealt: battleResult[`${side}TotalDamageDealt`],
      opponentTotalDamageDealt: battleResult[`${enemy}TotalDamageDealt`],
      winner: battleResult.winner === 'tie' ? 'tie' : (battleResult.winner === side ? 'player' : 'opponent'),
      reason: battleResult.reason,
    } : null,
  }
}

export function createStepResponse(state, side) {
  const observation = encodeObservation(state, side)
  const playerReward = !state.terminal || state.battleResult.winner === 'tie' ? 0
    : (state.battleResult.winner === 'player' ? 1 : -1)
  return {
    protocolVersion: HEADLESS_PROTOCOL_VERSION, rulesVersion: HEADLESS_RULES_VERSION,
    observation,
    legalActions: state.actor === observation.side ? getLegalActions(state) : [],
    actor: state.actor, terminal: state.terminal,
    reward: observation.side === 'player' ? playerReward : (playerReward === 0 ? 0 : -playerReward),
    rewards: { player: playerReward, opponent: playerReward === 0 ? 0 : -playerReward },
  }
}
