import { sessionReducer } from '../hooks/useGameSession.js'
import { applyOpponentDiscardPhase } from '../game/fiveHandDiscard.js'
import { resolveOpponentDraftPick, commitDraftDiscard, revealNextDraftPack } from '../game/draftMode.js'
import { createPreparationState } from '../game/preparationState.js'
import { getTabletopChoice } from '../game/tabletop.js'
import { validAction } from './protocol.js'

export const GAME_VERSION = import.meta.env.CRD_GAME_VERSION

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
  if (seat === 'host') return state
  const game = swapSides(state.game)
  game.currentPicker = game.currentPicker === 'player' ? 'opponent' : game.currentPicker === 'opponent' ? 'player' : null
  game.firstPicker = game.firstPicker === 'player' ? 'opponent' : 'player'
  game.phase = game.phase.replace(/^player-discard/, 'TEMP-discard').replace(/^opponent-discard/, 'player-discard')
    .replace(/^TEMP-discard/, 'opponent-discard')
    .replace('draft-player-pick', 'TEMP-pick').replace('draft-opponent-thinking', 'draft-player-pick')
    .replace('TEMP-pick', 'draft-opponent-thinking')
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
  const next = sessionReducer({ ...session, settings: { ...session.settings, opponentAi: 'rules', testing: false } }, action)
  return settleSession({ ...next, onlineHuman: true, gameVersion: GAME_VERSION, otherUi: {}, otherSelectedIds: [] })
}

export function applyRoomAction(state, seat, action) {
  if (!validAction(action)) throw new Error('Invalid game action')
  let view = seatView(state, seat)
  const phase = view.game.phase
  if (action.type === 'TOGGLE_SELECTED') {
    if (!phase.startsWith('player-discard') || !view.game.playerHand.some((c) => c.uid === action.uid)) throw new Error('Not your discard turn')
  } else if (action.type === 'SUBMIT_DISCARD') {
    if (!phase.startsWith('player-discard')) throw new Error('Not your discard turn')
  } else if (action.type === 'PLAYER_DRAFT_PICK') {
    if (phase !== 'draft-player-pick' || !view.game.draftRow.some((c) => c.uid === action.uid)) throw new Error('Not your draft turn')
  } else if (phase !== 'battle-ready' || view.battleStarted || view.preBattle.playerFinished) {
    throw new Error('Preparation is not available')
  }
  if (action.type === 'SUBMIT_DISCARD') {
    // Discard's shared-deck order stays host first, then guest, each pass.
    if (seat === 'guest') {
      const game = applyOpponentDiscardPhase(state.game, view.selectedIds, { includeRecentMoves: false })
      return settleSession({ ...state, game, preBattle: createPreparationState(game), otherSelectedIds: [] })
    }
    // Existing browser reducer defers the second seat for Search AI.
    view = sessionReducer({ ...view, settings: { ...view.settings, opponentAi: 'search' } }, action)
    view.settings = state.settings
  } else if (action.type === 'PLAYER_DRAFT_PICK' && seat === 'guest') {
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
