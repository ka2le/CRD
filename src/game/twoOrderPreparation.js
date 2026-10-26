import * as search from './searchAi.js'
import * as prep from './preparationState.js'
import * as rules from './preBattle.js'
import * as tt from './tabletop.js'
import { createTwoOrderPreparation } from './twoOrderPreparationCore.js'
import { getDiscardSixLookupAdapter, DAN_LOOKUP_PREPARATION_VERSION, DAN_DISCARD_SIX_LOOKUP_VERSION } from './discardSixLookupPreparation.js'

// A fresh game gets a fresh private commitment. Continuation actions within
// one game keep the same plan, including after private card reveals.
let games = new WeakMap()
export function getTwoOrderPreparation(game, options = {}) {
  const settings = { ...options }
  delete settings.discardAllAlreadyUsed
  const actor = settings.actor ?? 'opponent'
  const lookup = settings.discardSixLookup !== false
  delete settings.actor
  delete settings.discardSixLookup
  const key = JSON.stringify({ actor, lookup, ...settings })
  if (!games.has(game)) games.set(game, new Map())
  const policies = games.get(game)
  if (!policies.has(key)) {
    const adapter = lookup ? getDiscardSixLookupAdapter(game, actor) : null
    policies.set(key, createTwoOrderPreparation({ search, prep, rules, tt: adapter?.tt ?? tt },
      { ...settings, ...(adapter ? { discardAllLookup: adapter.lookup } : {}) }))
  }
  return policies.get(key)
}
export function chooseTwoOrderPreparation(state, options = {}) {
  const result = getTwoOrderPreparation(state.game, { ...options, actor: state.actor }).choose(state)
  return options.discardSixLookup === false ? result : { ...result, version: DAN_LOOKUP_PREPARATION_VERSION,
    discardSixLookupVersion: DAN_DISCARD_SIX_LOOKUP_VERSION }
}
export function clearTwoOrderPreparationCache() { games = new WeakMap() }
