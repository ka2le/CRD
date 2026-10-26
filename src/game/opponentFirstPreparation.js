import * as search from './searchAi.js'
import * as prep from './preparationState.js'
import * as rules from './preBattle.js'
import * as tt from './tabletop.js'
import * as h from './headlessGame.js'
import { getCoreCards } from './cards.js'
import { createOpponentFirstPolicy } from './opponentFirstCore.js'

export const DAN_PREPARATION_VERSION = 'two-order-mixed-actual-preparation-v1'
export const DAN_FIFTH_VERSION = 'opponent-first-prepared-response-pick5-v1'
export const DAN_FIFTH_IMPLEMENTATION = 'opponent-first-pick5-exact-memo-v1'
const ids = new Set(getCoreCards({ tabletop: 'abilities-main' }).map(c => c.id))
const policies = new Map()
export function supportsOpponentFirst(game) {
  const cards = [...(game.playerHand ?? []), ...(game.opponentHand ?? []), ...(game.draftRow ?? []), ...(game.deck ?? []), ...(game.draftDiscard ?? [])]
  return game.mode === 'draft' && tt.normalizeTabletopRules(cards.find(c => c.tabletop)?.tabletop) === 'abilities-main'
    && cards.every(c => ids.has(c.id))
}
export function getOpponentFirstPolicy(options = {}) {
  const key = JSON.stringify(options)
  if (!policies.has(key)) {
    if (policies.size >= 8) policies.delete(policies.keys().next().value)
    policies.set(key, createOpponentFirstPolicy({ search, prep, rules, tt, h }, options))
  }
  return policies.get(key)
}
export function chooseOpponentFirstFifth(game, side) {
  return getOpponentFirstPolicy().chooseFifth({ game, actor: side, preparation: null,
    config: { mode: 'draft', tabletop: 'abilities-main', control: 'both', revealOpponent: false },
    history: [], decisions: { player: 0, opponent: 0 }, terminal: false })
}
export function chooseOpponentFirstPreparation(state, options = {}) {
  return getOpponentFirstPolicy(options).choosePreparation(state)
}
