import test from 'node:test'
import assert from 'node:assert/strict'
import { configureBalanceVariant } from './balance-variants.mjs'
import { getCoreCards } from '../src/game/cards.js'
import { getTabletopProfile, scoreTabletopHand, toTabletopCard, chooseTabletopType } from '../src/game/tabletop.js'
import { applyCopySelection } from '../src/game/copyCard.js'

configureBalanceVariant('abilitiesv2-robot-pips')
const defs = new Map(getCoreCards({ tabletop: 'threshold' }).map((c) => [c.id, c]))
const hand = (...ids) => ids.map((id, i) => toTabletopCard({ ...defs.get(id), uid: `${id}-${i}` }, 'abilitiesv2'))
const score = (cards, type = chooseTabletopType(cards)) => scoreTabletopHand(cards, 0, type)

test('Robot pips on mixed/double stats convert independently without touching other faction pips', () => {
  const cards = hand('joker', 'robot2', 'robot1')
  const before = structuredClone(cards)
  const p = score(cards)
  assert.equal(p.stats.critter, 1)
  assert.equal(p.stats.dragon, 1)
  assert.equal(p.stats.robot, 2)
  assert.equal(p.base, 4)
  assert.equal(p.reconfigured.count, 2)
  assert.deepEqual(cards, before)
  const double = score(hand('robot2'))
  assert.deepEqual([double.stats.robot, double.base, double.reconfigured.count], [1, 1, 1])
})

test('A Robot Ultimate can exchange one attack unit and retain its other unit', () => {
  const p = score(hand('robot_ulti'))
  assert.deepEqual([p.stats.robot, p.contributions.robot, p.base, p.reconfigured.count], [1, 1, 1, 1])
})

test('A Robot Ultimate can exchange both units to boost an unconverted hybrid attack', () => {
  const p = score(hand('robot_ulti', 'rabbit2', 'dragon2', 'one_off_each'))
  assert.deepEqual([p.stats.robot, p.stats.critter, p.stats.dragon, p.base], [2, 2, 2, 8])
  assert.deepEqual(p.reconfigured.changes, [{ uid: 'robot_ulti-0', units: 2 }])
  assert(!p.attacks.some((a) => a.uid === 'robot_ulti-0'))
})

test('Sum and product hybrid attacks cannot transform, including lookalike typed specials', () => {
  const p = score(hand('rabbit2', 'dragon2', 'any_off_each', 'one_off_each'))
  assert.equal(p.reconfigured, null)
  assert.equal(p.base, 4)
  const custom = [{ ...hand('robot_attack')[0], id: 'hybrid-robot-attack' }]
  assert.equal(getTabletopProfile(custom).reconfigured, null)
})

test('Conversion may create Robot main; a dominating non-Robot faction blocks conversion', () => {
  const becomingRobot = hand('critter1', 'swarm', 'robot2', 'robot1')
  assert.equal(chooseTabletopType(becomingRobot), 'robot')
  assert.equal(score(becomingRobot).base, 3)
  const blocked = hand('rabbit2', 'swarm', 'swarm', 'robot2', 'robot1')
  assert.equal(chooseTabletopType(blocked), 'critter')
  assert.equal(score(blocked).reconfigured, null)
  assert.equal(score(blocked).base, 4)
})

test('Choosing a non-Robot main cannot retain converted power, including Chameleon', () => {
  const cards = hand('rabbit2', 'swarm', 'robot2', 'robot1', 'chameleon')
  assert.equal(score(cards, 'robot').base, 4)
  for (const type of ['critter', 'dragon']) {
    assert.equal(score(cards, type).base, 2)
    assert.equal(score(cards, type).reconfigured, null)
  }
  assert.equal(score(cards, 'critter').winsTies, true)
  assert.equal(score(cards, 'robot').winsTies, false)
})

test('Any of Each uses converted stats; copied Ultimates retain their unit options', () => {
  const p = score(hand('robot_attack', 'robot_attack', 'robot_attack', 'any_off_each'))
  assert.deepEqual([p.stats.robot, p.neutral, p.base], [2, 2, 4])
  const cards = hand('robot_ulti', 'copy_card_in_hand', 'rabbit2', 'dragon2', 'one_off_each')
  const copied = applyCopySelection(cards, cards[1].uid, cards[0].uid)
  const c = score(copied)
  assert.equal(c.stats.robot, 4)
  assert.equal(c.base, 16)
  assert.equal(c.reconfigured.count, 4)
})

test('Robot-main unit optimizer matches exhaustive per-card assignments and an independent split-card scorer', () => {
  const fixtures = [
    ['robot2', 'joker', 'robot_attack'],
    ['robot_ulti', 'robot_attack', 'robot_dragon'],
    ['robot_ulti', 'robot_ulti', 'rabbit2', 'dragon2', 'one_off_each'],
    ['robot2', 'robot1', 'rabbit2', 'swarm', 'swarm'],
    ['robot2', 'joker', 'any_off_each', 'dragon_ulti', 'dragon2'],
    ['robot_ulti', 'joker', 'swarm', 'chameleon', 'one_off_each'],
  ]
  for (const ids of fixtures) {
    const cards = hand(...ids)
    const power = (assigned) => {
      let p = getTabletopProfile(assigned)
      if (p.contributions.dragon >= 6) p = getTabletopProfile([...assigned, {
        id: 'test-dragon', uid: 'test-dragon', type: 'stat', stats: ['dragon'], effect: {}, tabletop: 'threshold',
      }])
      return p
    }
    let expected = power(cards.map((c) => ({ ...c, tabletop: 'threshold' }))).base
    function visit(index, assigned, changed) {
      if (index === cards.length) {
        const p = power(assigned)
        if (!changed || p.types.includes('robot')) expected = Math.max(expected, p.base)
        return
      }
      const card = cards[index]
      const robotStats = card.type === 'stat' ? card.stats.filter((s) => s === 'robot').length : 0
      const robotAttacks = card.id === 'robot_ulti' ? 2 : card.id === 'robot_attack' ? 1 : 0
      if (!robotStats && !robotAttacks) {
        visit(index + 1, [...assigned, { ...card, tabletop: 'threshold' }], changed)
        return
      }
      for (let traded = 0; traded <= robotStats + robotAttacks; traded++) {
        const stats = robotStats
          ? [...card.stats.filter((s) => s !== 'robot'), ...Array(robotStats-traded).fill('robot')]
          : Array(traded).fill('robot')
        const attacks = robotStats ? traded : robotAttacks - traded
        const components = [{ id: 'test-stat', uid: `stat-${index}`, type: 'stat', stats, effect: {}, tabletop: 'threshold' },
          ...Array.from({ length: attacks }, (_, n) => ({ id: 'test-attack', uid: `atk-${index}-${n}`, type: 'action', stats: [], effect: { dmg: 1, dmgType: 'robot' }, tabletop: 'threshold' }))]
        visit(index + 1, [...assigned, ...components], changed || traded > 0)
      }
    }
    visit(0, [], false)
    assert.equal(score(cards).base, expected, JSON.stringify(ids))
  }
})
