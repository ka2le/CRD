import test from 'node:test'
import assert from 'node:assert/strict'
import { configureBalanceVariant } from './balance-variants.mjs'
import { getCoreCards } from '../src/game/cards.js'
import { getTabletopProfile, scoreTabletopHand, toTabletopCard, chooseTabletopType } from '../src/game/tabletop.js'

configureBalanceVariant('abilitiesv2-perfect-balance')
const defs = new Map(getCoreCards({ tabletop: 'threshold' }).map((c) => [c.id, c]))
const hand = (...ids) => ids.map((id, i) => {
  assert(defs.has(id), `Unknown card ${id}`)
  return toTabletopCard({ ...defs.get(id), uid: `${id}-${i}` }, 'abilities-main')
})
const score = (cards, shields = 0, type = chooseTabletopType(cards)) => scoreTabletopHand(cards, shields, type)

test('Exact positive balance earns the shared +3, with Ultimate counting as two attacks', () => {
  const exact = score(hand('robot2', 'robot_ulti'))
  assert.deepEqual([exact.robotAttacks, exact.stats.robot, exact.base, exact.bonus, exact.score], [2, 2, 4, 3, 7])
  assert.equal(score(hand('robot1', 'robot_ulti')).bonus, 0)
  assert.equal(score(hand('robot2', 'robot_attack', 'robot_attack')).score, 7)
  assert.equal(getTabletopProfile(hand('robot_ulti')).balanced, false)
})

test('Hybrid product counts as one Robot attack; sum counts as none; mixed stats count', () => {
  const product = score(hand('joker', 'one_off_each'))
  assert.deepEqual([product.robotAttacks, product.base, product.bonus, product.score], [1, 1, 3, 4])
  const sum = score(hand('joker', 'any_off_each'))
  assert.deepEqual([sum.robotAttacks, sum.balanced, sum.base, sum.bonus], [0, false, 3, 0])
})

test('Bonus requires chosen Robot main and survives shields, while Critter keeps winning ties', () => {
  const cards = hand('robot1', 'robot_attack', 'chameleon')
  assert.equal(score(cards, 5, 'robot').score, 3)
  for (const type of ['critter', 'dragon']) assert.equal(score(cards, 0, type).bonus, 0)
  assert.equal(score(cards, 0, 'critter').winsTies, true)
  assert.equal(score(cards, 0, 'robot').winsTies, false)
  const dominated = hand('rabbit2', 'swarm', 'robot1', 'robot_attack')
  assert.equal(chooseTabletopType(dominated), 'critter')
  assert.equal(score(dominated).bonus, 0)
})

test('No Reconfigure or Adapt; printed stats and physical cards remain unchanged', () => {
  const cards = hand('robot2', 'robot1', 'robot_ulti', 'rabbit2')
  const before = structuredClone(cards)
  const p = score(cards)
  assert.equal(p.reconfigured, null)
  assert.deepEqual([p.stats.critter, p.stats.robot, p.base, p.bonus], [2, 3, 6, 0])
  assert.deepEqual(cards, before)
  assert.equal(getTabletopProfile(hand('rabbit2')).base, 0)
  assert.equal(getTabletopProfile(hand('robot2')).base, 0)
})

test('Dragon 6+ extra stat and published faction shield costs remain intact', () => {
  const p = score(hand('dragon2', 'dragon1', 'dragon_ulti'), 5)
  assert.deepEqual([p.dragonBase, p.overwhelming, p.stats.dragon, p.base, p.bonus, p.shieldPenalty], [6, true, 4, 8, 0, 0])
  const cards = hand('robot1', 'robot_attack', 'chameleon')
  assert.equal(score(cards, 1, 'robot').shieldPenalty, 1)
  assert.equal(score(cards, 1, 'critter').shieldPenalty, 2)
})
