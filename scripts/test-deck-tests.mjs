import test from 'node:test'
import assert from 'node:assert/strict'
import { GAME_ZONE_KEYS, PREPARATION_ZONE_KEYS, moveTestCardToTop, swapTestCards } from '../src/game/testDeck.js'

const card = (uid) => ({ uid, id: uid })
const game = () => ({
  playerHand: [card('p1'), card('p2')], opponentHand: [card('o1')], draftRow: [card('r1')],
  deck: [card('d1'), card('d2'), card('d3')], draftDiscard: [], playerDiscards: [], opponentDiscards: [],
})
const uids = (cards) => cards.map((c) => c.uid)

test('swap exchanges positions across zones and keeps sizes', () => {
  const next = swapTestCards(game(), GAME_ZONE_KEYS, 'd3', 'p1')
  assert.deepEqual(uids(next.playerHand), ['d3', 'p2'])
  assert.deepEqual(uids(next.deck), ['d1', 'd2', 'p1'])
})

test('swap into the pack marks it idle', () => {
  const next = swapTestCards(game(), GAME_ZONE_KEYS, 'r1', 'd2')
  assert.equal(next.draftRow[0].uid, 'd2')
  assert.equal(next.draftRow[0].draftAnimation, 'idle')
})

test('draw next moves deck cards to the top and swaps others with the top card', () => {
  assert.deepEqual(uids(moveTestCardToTop(game(), GAME_ZONE_KEYS, 'd3').deck), ['d3', 'd1', 'd2'])
  const fromHand = moveTestCardToTop(game(), GAME_ZONE_KEYS, 'o1')
  assert.deepEqual(uids(fromHand.deck), ['o1', 'd2', 'd3'])
  assert.deepEqual(uids(fromHand.opponentHand), ['d1'])
})

test('shared discard copies swap everywhere in preparation', () => {
  const prep = { playerHand: [card('p1')], opponentHand: [], deck: [], playerDiscard: [card('x')], opponentDiscard: [card('x')] }
  const next = swapTestCards(prep, PREPARATION_ZONE_KEYS, 'x', 'p1')
  assert.deepEqual(uids(next.playerDiscard), ['p1'])
  assert.deepEqual(uids(next.opponentDiscard), ['p1'])
  assert.deepEqual(uids(next.playerHand), ['x'])
})
