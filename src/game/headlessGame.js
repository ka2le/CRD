import { createDraftGame, applyDraftPick, resolveOpponentDraftPick, commitDraftDiscard, revealNextDraftPack } from './draftMode.js'
import { createFiveHandDiscardGame, applyDiscardPhase } from './fiveHandDiscard.js'
import { simulateBattle } from './engine.js'

const DEFAULT_BATTLE_EVALUATION = {
  maxRounds: 12,
  damageToWin: 999,
}

function summarizeCard(card) {
  return {
    uid: card.uid,
    id: card.id,
    name: card.name,
    type: card.type,
    stats: card.stats ?? [],
    effect: card.effect ?? {},
    cd: card.cd ?? null,
  }
}

function getDiscardMaskActions(hand = []) {
  const actionCount = 2 ** hand.length

  return Array.from({ length: actionCount }, (_, mask) => ({
    type: 'discard',
    mask,
    selectedIds: hand
      .filter((_, index) => (mask & (1 << index)) !== 0)
      .map((card) => card.uid),
  }))
}

function advanceHeadlessGame(game, options = {}) {
  let nextGame = game
  let guard = 0

  while (nextGame.mode === 'draft' && nextGame.phase !== 'draft-player-pick' && nextGame.phase !== 'battle-ready') {
    if (guard > 50) {
      throw new Error(`Headless draft advance exceeded guard at phase ${nextGame.phase}`)
    }
    guard += 1

    if (nextGame.phase === 'draft-opponent-thinking') {
      nextGame = resolveOpponentDraftPick(nextGame, {
        includeRecentMoves: false,
        opponentStrategy: options.opponentStrategy,
      })
    } else if (nextGame.phase === 'draft-pack-clearing') {
      nextGame = commitDraftDiscard(nextGame, { includeRecentMoves: false })
    } else if (nextGame.phase === 'draft-pack-dealing') {
      nextGame = revealNextDraftPack(nextGame, {
        includeRecentMoves: false,
        draftAnimation: 'idle',
        opponentStrategy: options.opponentStrategy,
      })
    } else {
      throw new Error(`Unsupported headless draft phase ${nextGame.phase}`)
    }
  }

  return nextGame
}

function evaluateBattleIfReady(game, options = {}) {
  if (game.phase !== 'battle-ready') return null

  const battleOptions = {
    ...DEFAULT_BATTLE_EVALUATION,
    ...(options.battleEvaluation ?? {}),
  }

  return simulateBattle(game.playerHand, game.opponentHand, {
    ...battleOptions,
    deck: game.deck ?? [],
  })
}

export function createHeadlessGame(config = {}) {
  const mode = config.mode ?? 'five-hand-discard'
  const baseOptions = {
    seed: config.seed,
    rng: config.rng,
    deck: config.deck,
    wildDeck: config.wildDeck ?? true,
  }

  const game = mode === 'draft'
    ? createDraftGame({
      ...baseOptions,
      firstPicker: config.firstPicker ?? 'player',
      includeRecentMoves: false,
      openingDraftAnimation: 'idle',
      opponentStrategy: config.opponentStrategy,
    })
    : createFiveHandDiscardGame(baseOptions)

  const advancedGame = advanceHeadlessGame(game, config)
  const battleResult = evaluateBattleIfReady(advancedGame, config)

  return {
    config: { ...config },
    game: advancedGame,
    battleResult,
    terminal: advancedGame.phase === 'battle-ready',
    steps: 0,
  }
}

export function getLegalActions(state) {
  const { game } = state

  if (state.terminal || game.phase === 'battle-ready') return []

  if (game.mode === 'draft' && game.phase === 'draft-player-pick') {
    return game.draftRow.map((card, index) => ({
      type: 'draft-pick',
      uid: card.uid,
      index,
      card: summarizeCard(card),
    }))
  }

  if (game.mode === 'five-hand-discard' && game.phase.startsWith('player-discard')) {
    return getDiscardMaskActions(game.playerHand)
  }

  return []
}

export function stepHeadlessGame(state, action) {
  if (state.terminal) {
    return state
  }

  let nextGame = state.game

  if (nextGame.mode === 'draft' && action?.type === 'draft-pick') {
    nextGame = applyDraftPick(nextGame, action.uid, {
      includeRecentMoves: false,
      opponentStrategy: state.config.opponentStrategy,
    })
    nextGame = advanceHeadlessGame(nextGame, state.config)
  } else if (nextGame.mode === 'five-hand-discard' && action?.type === 'discard') {
    nextGame = applyDiscardPhase(nextGame, action.selectedIds ?? [], {
      includeRecentMoves: false,
      opponentDiscardCount: state.config.opponentDiscardCount ?? 2,
      opponentDiscardStrategy: state.config.opponentDiscardStrategy,
    })
  } else {
    throw new Error(`Illegal action ${JSON.stringify(action)} for ${nextGame.mode}:${nextGame.phase}`)
  }

  const battleResult = evaluateBattleIfReady(nextGame, state.config)

  return {
    ...state,
    game: nextGame,
    battleResult,
    terminal: nextGame.phase === 'battle-ready',
    steps: state.steps + 1,
  }
}

export function encodeObservation(state) {
  const { game, battleResult } = state

  return {
    mode: game.mode,
    phase: game.phase,
    steps: state.steps,
    deckCount: game.deck?.length ?? 0,
    playerHand: (game.playerHand ?? []).map(summarizeCard),
    opponentHandCount: game.opponentHand?.length ?? 0,
    opponentHand: state.config.revealOpponent ? (game.opponentHand ?? []).map(summarizeCard) : [],
    draftRow: (game.draftRow ?? []).map(summarizeCard),
    playerDiscardsUsed: game.playerDiscardsUsed ?? 0,
    opponentDiscardsUsed: game.opponentDiscardsUsed ?? 0,
    discardCount: game.playerDiscards?.length ?? 0,
    terminal: state.terminal,
    battle: battleResult ? {
      rounds: battleResult.rounds.length,
      playerTotalDamageDealt: battleResult.playerTotalDamageDealt,
      opponentTotalDamageDealt: battleResult.opponentTotalDamageDealt,
      winner: battleResult.winner,
      reason: battleResult.reason,
    } : null,
  }
}

export function createStepResponse(state) {
  return {
    observation: encodeObservation(state),
    legalActions: getLegalActions(state),
    terminal: state.terminal,
  }
}
