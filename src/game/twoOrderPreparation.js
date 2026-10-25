import * as search from './searchAi.js'
import * as prep from './preparationState.js'
import * as rules from './preBattle.js'
import * as tt from './tabletop.js'
import { createTwoOrderPreparation } from './twoOrderPreparationCore.js'

// A fresh game gets a fresh private commitment. Continuation actions within
// one game keep the same plan, including after private card reveals.
let games = new WeakMap()
export function getTwoOrderPreparation(game, options = {}) {
  const settings = { ...options }
  delete settings.discardAllAlreadyUsed
  const key = JSON.stringify(settings)
  if (!games.has(game)) games.set(game, new Map())
  const policies = games.get(game)
  if (!policies.has(key)) policies.set(key, createTwoOrderPreparation({ search, prep, rules, tt }, settings))
  return policies.get(key)
}
export function chooseTwoOrderPreparation(state, options = {}) {
  return getTwoOrderPreparation(state.game, options).choose(state)
}
export function clearTwoOrderPreparationCache() { games = new WeakMap() }
