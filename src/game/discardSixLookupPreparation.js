import * as search from './searchAi.js'
import * as prep from './preparationState.js'
import * as rules from './preBattle.js'
import * as tt from './tabletop.js'
import * as h from './headlessGame.js'
import prior from '../../data/dan-discard-six-combat-prior.json' with { type: 'json' }
import { createDiscardLookupAdapter } from './discardSixLookupCore.js'
import { createOpponentFirstPolicy } from './opponentFirstCore.js'

export const DAN_DISCARD_SIX_LOOKUP_VERSION = prior.version
export const DAN_LOOKUP_FIFTH_IMPLEMENTATION = 'opponent-first-discard-six-combat-table-v1'
export const DAN_LOOKUP_PREPARATION_VERSION = 'two-order-discard-six-lookup-actual-preparation-v2'

let games = new WeakMap()
function entry(game) {
  if (!games.has(game)) games.set(game, { adapters: new Map(), fifth: new Map() })
  return games.get(game)
}
export function getDiscardSixLookupAdapter(game, side) {
  const value = entry(game)
  if (!value.adapters.has(side)) value.adapters.set(side, createDiscardLookupAdapter(tt, prior.histogram))
  return value.adapters.get(side)
}
export function getDiscardSixFifthPolicy(game, side) {
  const value = entry(game)
  if (!value.fifth.has(side)) {
    const adapter = getDiscardSixLookupAdapter(game, side)
    value.fifth.set(side, createOpponentFirstPolicy({ search, prep, rules, tt: adapter.tt, h }, { discardAllLookup: adapter.lookup }))
  }
  return value.fifth.get(side)
}
export function chooseDiscardSixFifth(game, side) {
  return { ...getDiscardSixFifthPolicy(game, side).chooseFifth({ game, actor: side, preparation: null,
    config: { mode: 'draft', tabletop: 'abilities-main', control: 'both', revealOpponent: false },
    history: [], decisions: { player: 0, opponent: 0 }, terminal: false }),
    discardSixLookupVersion: DAN_DISCARD_SIX_LOOKUP_VERSION, implementation: DAN_LOOKUP_FIFTH_IMPLEMENTATION }
}
export function clearDiscardSixLookupCaches() { games = new WeakMap() }
