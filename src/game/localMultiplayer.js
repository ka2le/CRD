import { applyRoomAction, seatView, settleSession } from '../network/roomGame.js'
import { getPreparationActions } from './preparationState.js'
import { getTabletopChoice } from './tabletop.js'
import { cleanName, PLAYER_ACTIONS } from '../network/protocol.js'

export const isLocalMultiplayer = (state) => state.settings.opponentAi === 'local'
const otherSeat = (seat) => seat === 'host' ? 'guest' : 'host'

export function localPlayerName(state, seat) {
  return cleanName(state.settings.localNames?.[seat]) || (seat === 'host' ? 'Player one' : 'Player two')
}

function needsPreparation(state, seat) {
  const view = seatView(state, seat)
  const prep = view.preBattle
  return !prep.playerFinished && (Boolean(prep.playerPendingDiscard)
    || getPreparationActions(prep).some((action) => action.type === 'prepare')
    || Boolean(state.settings.tabletop && getTabletopChoice(prep).needsChoice))
}

// Reuse the two-human rules used by rooms: never call an AI, and resolve a
// discard pass only after both selections have been locked in.
export function initializeLocalMultiplayer(state, restoring = false) {
  if (!isLocalMultiplayer(state)) return state.localPlay ? { ...state, localPlay: null } : state
  if (state.localPlay && !restoring) return state
  const next = settleSession(state)
  return advanceLocalTurn({ ...next,
    otherUi: state.otherUi ?? {}, otherSelectedIds: state.otherSelectedIds ?? [],
    discardReady: state.discardReady ?? {},
    localPlay: { seat: state.localPlay?.seat ?? 'host', handoff: !state.battleStarted,
      showAll: restoring ? false : Boolean(state.localPlay?.showAll) },
  }, true, !restoring || !state.localPlay)
}

function advanceLocalTurn(state, forceHandoff = false, skipForced = false) {
  let next = state
  let seat = next.localPlay.seat
  if (!next.battleStarted && next.game.phase === 'battle-ready') {
    // No reason to pass the device or press Ready for a forced preparation.
    for (const candidate of skipForced ? ['host', 'guest'] : []) {
      if (!needsPreparation(next, candidate)) {
        const key = candidate === 'host' ? 'playerFinished' : 'opponentFinished'
        next = { ...next, preBattle: { ...next.preBattle, [key]: true } }
      }
    }
    if (next.preBattle.playerFinished && next.preBattle.opponentFinished) {
      next = { ...next, battleStarted: true, battleInstance: next.battleInstance + 1 }
    } else if (seatView(next, seat).preBattle.playerFinished) seat = otherSeat(seat)
  } else if (next.game.mode === 'draft') {
    seat = next.game.currentPicker === 'opponent' ? 'guest' : 'host'
  } else if (next.discardReady?.[seat]) {
    seat = otherSeat(seat)
  }
  const drafting = next.game.mode === 'draft' && next.game.phase !== 'battle-ready'
  return { ...next, localPlay: { ...next.localPlay, seat,
    handoff: !drafting && !next.battleStarted && !next.localPlay.showAll
      && (forceHandoff || seat !== state.localPlay.seat || state.localPlay.handoff) } }
}

export function reduceLocalMultiplayer(state, action, reduceSession) {
  const local = isLocalMultiplayer(state)
  if (local && action.type === 'LOCAL_REVEAL') {
    return { ...state, localPlay: { ...state.localPlay, handoff: false } }
  }
  if (local && action.type === 'LOCAL_SHOW_ALL') {
    return { ...state, localPlay: { ...state.localPlay, showAll: !state.localPlay.showAll, handoff: false } }
  }
  if (local && action.type === 'LOCAL_RENAME') {
    const name = cleanName(action.name)
    if (!name || !['host', 'guest'].includes(action.seat)) return state
    return { ...state, settings: { ...state.settings, localNames: { ...state.settings.localNames, [action.seat]: name } } }
  }
  if (local && PLAYER_ACTIONS.has(action.type)) {
    if (state.localPlay.handoff || state.battleStarted) return state
    const { type, uid, damageType } = action
    const command = { type, ...(uid === undefined ? {} : { uid }), ...(damageType === undefined ? {} : { damageType }) }
    const next = applyRoomAction(state, state.localPlay.seat, command)
    // A public draft enters private preparation. During Discard, keep the hand
    // visible across consecutive steps owned by the same person.
    const enteringPreparation = state.game.phase !== 'battle-ready' && next.game.phase === 'battle-ready'
    return advanceLocalTurn(next, enteringPreparation && state.game.mode === 'draft', enteringPreparation)
  }
  if (local && ['RESOLVE_OPPONENT_DRAFT_PICK', 'APPLY_OPPONENT_DISCARD'].includes(action.type)) return state
  const next = reduceSession(state, action)
  if (!isLocalMultiplayer(next)) return next.localPlay ? { ...next, localPlay: null } : next
  return next.dealId !== state.dealId || !next.localPlay
    ? initializeLocalMultiplayer({ ...next, localPlay: null, otherUi: {}, otherSelectedIds: [], discardReady: {} })
    : next
}

export function getLocalDisplaySeat(state) {
  // Public drafting has permanent table positions; private turns face the holder.
  return state.game.mode === 'draft' && state.game.phase !== 'battle-ready' ? 'host' : state.localPlay.seat
}

export function localMultiplayerView(state) {
  return isLocalMultiplayer(state) ? seatView(state, getLocalDisplaySeat(state)) : state
}
