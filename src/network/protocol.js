export const ROOM_PROTOCOL = 1
export const MAX_MESSAGE_BYTES = 192 * 1024
export const MAX_ACTION_BYTES = 4096
export const ROOM_TTL_MS = 24 * 60 * 60 * 1000
export const ROOM_ID_PATTERN = /^[a-f0-9]{20}$/
export const TOKEN_PATTERN = /^[a-f0-9]{64}$/
export const PLAYER_ACTIONS = new Set([
  'TOGGLE_SELECTED', 'SUBMIT_DISCARD', 'PLAYER_DRAFT_PICK',
  'ACTIVATE_PLAYER_PRE_BATTLE_CARD', 'RESOLVE_PLAYER_RECYCLE_PICK',
  'CANCEL_PLAYER_RECYCLE_PICK', 'CLOSE_PRE_BATTLE_INFO_OVERLAY',
  'CHOOSE_TABLETOP_TYPE', 'CANCEL_TABLETOP_TYPE', 'START_BATTLE',
])

export function validAction(action) {
  if (!action || !PLAYER_ACTIONS.has(action.type)) return false
  if (JSON.stringify(action).length > MAX_ACTION_BYTES) return false
  if (Object.keys(action).some((key) => !['type', 'uid', 'damageType'].includes(key))) return false
  if (action.uid !== undefined && (typeof action.uid !== 'string' || action.uid.length > 160)) return false
  return action.damageType === undefined || ['critter', 'robot', 'dragon'].includes(action.damageType)
}

export function randomToken(bytes = 32) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (n) => n.toString(16).padStart(2, '0')).join('')
}

export function cleanName(name) {
  return typeof name === 'string' ? [...name].filter((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127).join('').trim().slice(0, 24) : ''
}
