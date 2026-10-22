import test from 'node:test'
import assert from 'node:assert/strict'
import { BALANCE_VARIANTS, configureBalanceVariant } from './balance-variants.mjs'
import { getCoreCards } from '../src/game/cards.js'
import { scoreTabletopHand, toTabletopCard } from '../src/game/tabletop.js'

const prior = BALANCE_VARIANTS['abilitiesv2-dragon7-immune']
const variant = configureBalanceVariant('abilitiesv2-dragon7-immune-critter1')
const defs = new Map(getCoreCards({ tabletop: 'abilities-main' }).map(c => [c.id, c]))
const hand = (...ids) => ids.map((id, i) => toTabletopCard({ ...defs.get(id), uid: `${id}-${i}` }, 'abilities-main'))

test('Follow-up changes only Critter shield cost from 2 to 1', () => {
  assert.deepEqual(variant.flexible, prior.flexible)
  assert.deepEqual(variant.shieldCosts, { ...prior.shieldCosts, critter: 1 })
  const c = scoreTabletopHand(hand('rabbit2', 'swarm'), 1, 'critter')
  assert.deepEqual([c.base, c.shieldPenalty, c.score, c.winsTies], [2, 1, 1, true])
  const blocked = scoreTabletopHand(hand('rabbit2', 'swarm'), 3, 'critter')
  assert.deepEqual([blocked.shieldPenalty, blocked.score], [3, 0])
})

test('Dragon cutoff/immunity and Robot Perfect Balance/shields stay intact', () => {
  const d = scoreTabletopHand(hand('dragon2', 'dragon1', 'dragon_ulti'), 8, 'dragon')
  assert.deepEqual([d.dragonBase, d.overwhelming, d.score, d.shieldPenalty], [6, false, 6, 0])
  const r = scoreTabletopHand(hand('robot2', 'robot_ulti'), 1, 'robot')
  assert.deepEqual([r.bonus, r.shieldPenalty, r.score], [3, 2, 5])
})
