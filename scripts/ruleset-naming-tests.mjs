import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeTabletopRules, normalizePlayableTabletopRules, toTabletopCard, getTabletopProfile } from '../src/game/tabletop.js'
import { getCoreCards, getExpandedCoreDeck } from '../src/game/cards.js'
import { BALANCE_VARIANTS } from './balance-variants.mjs'
import { createDevScenario } from '../src/game/devScenarios.js'

test('Abilities and generic tabletop aliases select main, including legacy v2 settings', () => {
  for (const alias of [true, 'tabletop', 'abilities', 'abilitiesv2', 'abilities-main']) {
    assert.equal(normalizeTabletopRules(alias), 'abilities-main')
    const pool = getExpandedCoreDeck({ tabletop: alias, wildDeck: false })
    assert.equal(pool.length, 68)
    assert(pool.every(c => c.tabletop === 'abilities-main'))
    assert(!pool.some(c => ['chameleon', 'any_off_each'].includes(c.id)))
  }
  assert.equal(normalizeTabletopRules(false), false)
  assert.equal(normalizeTabletopRules('threshold'), 'threshold')
  assert.equal(createDevScenario().game.playerHand[0].tabletop, 'abilities-main')
  for (const alias of ['abilities', 'tabletop', 'abilitiesv2', 'abilities-main']) {
    assert.equal(BALANCE_VARIANTS[alias].rules, 'abilities-main')
    assert.deepEqual(BALANCE_VARIANTS[alias].shieldCosts, { critter: 1, robot: 2, dragon: 0 })
  }
})

test('Prototype is preserved only by explicit name and cannot reopen from ordinary UI settings', () => {
  for (const alias of ['abilities-prototype', 'abilities-v1', 'old-abilities']) {
    assert.equal(normalizeTabletopRules(alias), 'abilities-prototype')
    assert.equal(normalizePlayableTabletopRules(alias), 'abilities-main')
    const defs = getCoreCards({ tabletop: alias })
    assert(defs.some(c => c.id === 'chameleon'))
    const cards = ['rabbit2', 'critter1'].map((id, i) => toTabletopCard({ ...defs.find(c => c.id === id), uid: `${id}-${i}` }, alias))
    const p = getTabletopProfile(cards)
    assert.equal(p.rules, 'abilities-prototype')
    assert(p.adaptedUid)
    assert.equal(p.base, 2)
  }
})
