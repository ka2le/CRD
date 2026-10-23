import { sessionReducer } from '../hooks/useGameSession.js'
import { applyDiscardPhase, applyOpponentDiscardPhase } from '../game/fiveHandDiscard.js'
import { resolveOpponentDraftPick, commitDraftDiscard, revealNextDraftPack } from '../game/draftMode.js'
import { createPreparationState } from '../game/preparationState.js'
import { getTabletopChoice, resolveTabletopBattle } from '../game/tabletop.js'
import { simulateBattle } from '../game/engine.js'
import { validAction } from './protocol.js'

// Room decision flow changes independently of the shared solo combat rules.
export const GAME_VERSION = `${import.meta.env.CRD_GAME_VERSION}:rooms-2`

// Only the host executes these transitions. The guest receives a mirrored view.
const UI_KEYS = ['armedPlayerCopyUid', 'recycleSelection', 'infoOverlay', 'tabletopChoice', 'tabletopTypeCardUid']
function swapSides(value) {
  const result = { ...value }
  for (const key of Object.keys(value)) {
    if (key.startsWith('player')) {
      const other = `opponent${key.slice(6)}`
      if (other in value) { result[key] = value[other]; result[other] = value[key] }
    }
  }
  return result
}

export function seatView(state, seat) {
  if (seat !== 'guest') return state
  const game = swapSides(state.game)
  game.currentPicker = game.currentPicker === 'player' ? 'opponent' : game.currentPicker === 'opponent' ? 'player' : null
  game.firstPicker = game.firstPicker === 'player' ? 'opponent' : 'player'
  game.phase = game.phase.replace(/^player-discard/, 'TEMP-discard').replace(/^opponent-discard/, 'player-discard')
    .replace(/^TEMP-discard/, 'opponent-discard')
    .replace('draft-player-pick', 'TEMP-pick').replace('draft-opponent-thinking', 'draft-player-pick')
    .replace('TEMP-pick', 'draft-opponent-thinking')
  if (game.mode === 'five-hand-discard' && /^(player|opponent)-discard/.test(game.phase)) {
    game.phase = `player-discard-${Math.min(game.playerDiscardsUsed, game.opponentDiscardsUsed) + 1}`
  }
  const preBattle = swapSides(state.preBattle)
  const ownUi = Object.fromEntries(UI_KEYS.map((key) => [key, state.preBattle[key] ?? null]))
  for (const key of UI_KEYS) preBattle[key] = state.otherUi?.[key] ?? null
  if (preBattle.recycleSelection) preBattle.recycleSelection = { ...preBattle.recycleSelection, side: 'player' }
  return { ...state, game, preBattle, otherUi: ownUi, selectedIds: state.otherSelectedIds ?? [], otherSelectedIds: state.selectedIds }
}

export function settleSession(state) {
  let next = state
  // Animation is presentation only; persist completed logical actions atomically.
  if (next.preBattle.pendingResolution) next = sessionReducer(next, { type: 'RESOLVE_PRE_BATTLE_PENDING_DRAW_ALL_NEW_1' })
  let game = next.game
  if (game.phase === 'draft-pack-clearing') game = commitDraftDiscard(game, { includeRecentMoves: false })
  if (game.phase === 'draft-pack-dealing') game = revealNextDraftPack(game, { includeRecentMoves: false, draftAnimation: 'idle' })
  const changedGame = game !== next.game
  return { ...next, game: { ...game, pendingOpponentPickUid: null, recentMoves: [] },
    preBattle: { ...(changedGame ? createPreparationState(game) : next.preBattle),
      pendingAnimation: null, pendingResolution: null, opponentSearchKey: null },
    lastTransition: null, pendingPlayerDraftPickAnimation: null, suppressedHandCardIds: { player: [], opponent: [] } }
}

export function startRoomGame(session, action = { type: 'RESET_GAME' }) {
  const next = sessionReducer({ ...session, settings: { ...session.settings, opponentAi: 'rules',
    discardOpponentAi: 'rules', draftOpponentAi: 'rules', testing: false } }, action)
  return settleSession({ ...next, onlineHuman: true, gameVersion: GAME_VERSION, otherUi: {}, otherSelectedIds: [], discardReady: {}, roomResult: null })
}

export function scoreRoomGame(state) {
  if (!state.battleStarted || state.roomResult || !state.roomPlayers) return state
  const prep = state.preBattle
  const result = state.settings.tabletop
    ? resolveTabletopBattle(prep.playerHand, prep.opponentHand, { playerType: getTabletopChoice(prep).selectedType, opponentType: opponentRoomType(state) })
    : simulateBattle(prep.playerHand, prep.opponentHand, { deck: prep.deck })
  const winnerId = result.winner === 'tie' ? null : state.roomPlayers[result.winner === 'player' ? 'host' : 'guest']
  const scores = { ...state.scores }
  if (winnerId) scores[winnerId] = (scores[winnerId] ?? 0) + 1
  const bounded = Object.fromEntries(Object.entries(scores).slice(-62))
  for (const id of Object.values(state.roomPlayers)) bounded[id] = scores[id] ?? 0
  return { ...state, scores: bounded, roomResult: { winnerId, tie: result.winner === 'tie' } }
}

export function applyRoomAction(state, seat, action) {
  if (!['host', 'guest'].includes(seat)) throw new Error('Viewers cannot play')
  if (!validAction(action)) throw new Error('Invalid game action')
  if (['TOGGLE_SELECTED', 'SUBMIT_DISCARD'].includes(action.type)) {
    if (state.game.mode !== 'five-hand-discard' || !/^(player|opponent)-discard/.test(state.game.phase)) throw new Error('Discard is not available')
    // Older saved games may already have refilled the host's half of this pass.
    const ready = { host: state.game.phase.startsWith('opponent-discard'), ...state.discardReady }
    if (ready[seat]) throw new Error('Your discard is already submitted')
    const key = seat === 'host' ? 'selectedIds' : 'otherSelectedIds'
    const hand = seat === 'host' ? state.game.playerHand : state.game.opponentHand
    const selected = state[key] ?? []
    if (action.type === 'TOGGLE_SELECTED') {
      if (!hand.some((card) => card.uid === action.uid)) throw new Error('Choose a card from your hand')
      return { ...state, [key]: selected.includes(action.uid) ? selected.filter((id) => id !== action.uid) : [...selected, action.uid] }
    }
    ready[seat] = true
    if (!ready.host || !ready.guest) return { ...state, discardReady: ready }
    // Resolve both locked choices in one persisted transition. Allocation from
    // the shared deck stays deterministic regardless of submission order.
    const afterHost = state.game.playerDiscardsUsed > state.game.opponentDiscardsUsed ? state.game
      : applyDiscardPhase(state.game, state.selectedIds, { deferOpponent: true, includeRecentMoves: false })
    const game = applyOpponentDiscardPhase(afterHost, state.otherSelectedIds ?? [], { includeRecentMoves: false })
    return settleSession({ ...state, game, preBattle: createPreparationState(game), selectedIds: [], otherSelectedIds: [], discardReady: {} })
  }
  let view = seatView(state, seat)
  const phase = view.game.phase
  if (action.type === 'PLAYER_DRAFT_PICK') {
    if (phase !== 'draft-player-pick' || !view.game.draftRow.some((c) => c.uid === action.uid)) throw new Error('Not your draft turn')
  } else if (phase !== 'battle-ready' || view.battleStarted || view.preBattle.playerFinished) {
    throw new Error('Preparation is not available')
  }
  if (action.type === 'PLAYER_DRAFT_PICK' && seat === 'guest') {
    const game = resolveOpponentDraftPick({ ...state.game, pendingOpponentPickUid: action.uid }, { includeRecentMoves: false })
    return settleSession({ ...state, game, preBattle: createPreparationState(game) })
  } else if (action.type === 'START_BATTLE') {
    if (view.settings.tabletop && getTabletopChoice(view.preBattle).needsChoice) {
      // Battle skips unused specials and exposes the normal faction picker.
      view = { ...view, preBattle: { ...view.preBattle, playerActivated: view.preBattle.playerHand.map((card) => card.uid),
        armedPlayerCopyUid: null, recycleSelection: null } }
    } else {
      view = { ...view, preBattle: { ...view.preBattle, playerFinished: true, armedPlayerCopyUid: null, recycleSelection: null } }
      if (view.preBattle.opponentFinished) view = { ...view, battleStarted: true, battleInstance: view.battleInstance + 1 }
    }
  } else {
    view = sessionReducer(view, action)
  }
  view = settleSession(view)
  return seat === 'host' ? view : seatView(view, 'guest')
}

export function opponentRoomType(state) {
  return getTabletopChoice({ ...state.preBattle, playerHand: state.preBattle.opponentHand,
    tabletopChoice: state.otherUi?.tabletopChoice }).selectedType
}
