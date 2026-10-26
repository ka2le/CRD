import test from 'node:test'
import assert from 'node:assert/strict'
import { configureBalanceVariant } from './balance-variants.mjs'
import { getCoreCards, getExpandedCoreDeck } from '../src/game/cards.js'
import { scoreTabletopHand, toTabletopCard, MAIN_ABILITY_RULES, MAIN_ABILITY_SHIELD_COST } from '../src/game/tabletop.js'

configureBalanceVariant('abilitiesv2-dragon7-immune')
const defs = new Map(getCoreCards({ tabletop: 'abilities-main' }).map((c) => [c.id, c]))
const hand = (...ids) => ids.map((id, i) => toTabletopCard({ ...defs.get(id), uid: `${id}-${i}` }, 'abilities-main'))

test('Dragon threshold uses pre-shield contribution at 7, adds one stat once, and ignores shields', () => {
  const below = scoreTabletopHand(hand('dragon2', 'dragon1', 'dragon_ulti'), 5, 'dragon')
  assert.deepEqual([below.dragonBase, below.overwhelming, below.stats.dragon, below.score, below.shieldPenalty], [6, false, 3, 6, 0])
  const above = scoreTabletopHand(hand('dragon2', 'dragon1', 'dragon_ulti', 'dragons_breath'), 5, 'dragon')
  assert.deepEqual([above.dragonBase, above.overwhelming, above.stats.dragon, above.score, above.shieldPenalty], [9, true, 4, 12, 0])
  const exact = scoreTabletopHand(hand('dragon2', 'dragon2', 'dragon2', 'dragon1', 'dragons_breath'), 10, 'dragon')
  assert.deepEqual([exact.dragonBase, exact.stats.dragon, exact.score], [7, 8, 8])
})

test('Perfect Balance, Critter ties, and other shield costs stay unchanged', () => {
  const robot = scoreTabletopHand(hand('robot2', 'robot_ulti'), 1, 'robot')
  assert.deepEqual([robot.bonus, robot.shieldPenalty, robot.score, robot.reconfigured], [3, 2, 5, null])
  const critter = scoreTabletopHand(hand('rabbit2', 'swarm'), 1, 'critter')
  assert.equal(critter.shieldPenalty, 2)
  assert.equal(critter.winsTies, true)
  assert.equal(MAIN_ABILITY_RULES.perfectBalance, true)
  assert.deepEqual(MAIN_ABILITY_SHIELD_COST, { critter: 2, robot: 2, dragon: 0 })
})

test('Trial retains current regular v2 pool and zero-damage product fix', () => {
  assert.equal(defs.has('chameleon'), false)
  assert.equal(defs.has('any_off_each'), false)
  assert.equal(getExpandedCoreDeck({ tabletop: 'abilities-main', wildDeck: false }).length, 69)
  const dud = scoreTabletopHand(hand('robot1', 'robot_attack', 'one_off_each'), 0, 'robot')
  assert.equal(dud.robotAttacks, 1)
  assert.equal(dud.bonus, 3)
})

