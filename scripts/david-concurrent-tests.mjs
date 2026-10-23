import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createFiveHandDiscardGame, applyDiscardPhase, applyOpponentDiscardPhase } from '../src/game/fiveHandDiscard.js'
import { getExpandedCoreDeck, shuffle, createSeededRng } from '../src/game/cards.js'
import * as tt from '../src/game/tabletop.js'
import { createOpponentScoreEvaluator } from '../src/game/davidOpponentScores.js'

for (const tabletop of ['abilities-main', 'threshold', 'abilities-prototype']) {
  test(`${tabletop}: grouped opponent scores equal every individual comparison including ties`, () => {
    const rng = createSeededRng(10244)
    const pool = getExpandedCoreDeck({ tabletop, wildDeck: true })
    const hands = Array.from({ length: 300 }, (_, i) => shuffle(pool, { rng }).slice(0, 5 + i % 5))
    const enemies = hands.slice(0, 50).map((hand) => ({ hand, type: tt.chooseTabletopType(hand), shields: tt.getTabletopProfile(hand).shields }))
    const evaluator = createOpponentScoreEvaluator(tt, enemies)
    for (const hand of hands) {
      const type = tt.chooseTabletopType(hand), shield = tt.getTabletopProfile(hand).shields
      const expected = enemies.reduce((sum, enemy) => {
        const a = tt.scoreTabletopHand(hand, enemy.shields, type)
        const b = tt.scoreTabletopHand(enemy.hand, shield, enemy.type)
        return sum + (a.score > b.score ? 1 : a.score < b.score ? -1 : a.winsTies === b.winsTies ? 0 : a.winsTies ? 1 : -1)
      }, 0) / enemies.length
      assert.equal(evaluator.evaluate(hand), expected)
    }
    assert.equal(evaluator.stats.queries, hands.length * evaluator.stats.groups)
  })
}

test('score lookup retains Robot shield penalty, Dragon immunity and Critter ties', () => {
  const pool = getExpandedCoreDeck({ tabletop: 'abilities-main', wildDeck: true })
  const hand = (ids) => ids.map((id, i) => ({ ...pool.find((card) => card.id === id), uid: `${id}-${i}` }))
  const robot = hand(['robot2', 'robot1', 'robot_attack', 'robot_ulti', 'shield2'])
  const dragon = hand(['dragon2', 'dragon1', 'dragons_breath', 'dragon_ulti', 'shield2'])
  const descriptors = (hands) => hands.map((h) => ({ hand: h, type: tt.chooseTabletopType(h), shields: tt.getTabletopProfile(h).shields }))
  const own = tt.scoreTabletopHand(robot, 1, 'robot'), enemy = tt.scoreTabletopHand(dragon, 1, 'dragon')
  assert.equal(own.shieldPenalty, 2)
  assert.equal(enemy.shieldPenalty, 0)
  assert.equal(createOpponentScoreEvaluator(tt, descriptors([dragon])).evaluate(robot), -1)
  const critter = hand(['critter1', 'swarm']), smallDragon = hand(['dragon1', 'dragons_breath'])
  assert.equal(createOpponentScoreEvaluator(tt, descriptors([smallDragon])).evaluate(critter), 1)
  assert.equal(createOpponentScoreEvaluator(tt, descriptors([critter])).evaluate(smallDragon), -1)
  assert.equal(createOpponentScoreEvaluator(tt, descriptors([critter])).evaluate(critter), 0)
})

for (const order of ['HHOO', 'HOHO', 'HOOH', 'OHHO', 'OHOH', 'OOHH']) {
  test(`concurrent local discard ${order}: two independent passes, shared deck remains physical`, () => {
    let game = createFiveHandDiscardGame({ seed: 1067, wildDeck: false, tabletop: 'abilities-main', concurrentOpponent: true })
    for (const actor of order) {
      const hand = actor === 'H' ? game.playerHand : game.opponentHand
      const oldDeck = game.deck.length
      game = actor === 'H' ? applyDiscardPhase(game, [hand[0].uid]) : applyOpponentDiscardPhase(game, [hand[0].uid])
      assert.equal(game.deck.length, oldDeck - 1)
      const physical = [...game.deck, ...game.playerHand, ...game.opponentHand, ...game.playerDiscards]
      assert.equal(physical.length, 68)
      assert.equal(new Set(physical.map((card) => card.uid)).size, 68)
      if (game.playerDiscardsUsed < 2) assert.equal(game.phase, `player-discard-${game.playerDiscardsUsed + 1}`)
      else if (game.opponentDiscardsUsed < 2) assert.equal(game.phase, `opponent-discard-${game.opponentDiscardsUsed + 1}`)
      else assert.equal(game.phase, 'battle-ready')
    }
    assert.equal(game.playerDiscardsUsed, 2)
    assert.equal(game.opponentDiscardsUsed, 2)
    assert.equal(applyDiscardPhase(game, []), game)
    assert.equal(applyOpponentDiscardPhase(game, []), game)
  })
}

test('David reducer preserves human selections and in-flight decision across human passes', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  try {
    const { sessionReducer, getOpponentDecisionKey } = await server.ssrLoadModule('/src/hooks/useGameSession.js')
    const game = createFiveHandDiscardGame({ seed: 10, concurrentOpponent: true })
    let s = { settings: { gameMode: 'five-hand-discard', opponentAi: 'david' }, gameMode: 'five-hand-discard',
      game, nextDraftStartingPicker: 'player', battleInstance: 0, gameSessionKey: 0, dealId: 1, selectedIds: [game.playerHand[0].uid] }
    const key = getOpponentDecisionKey(1, game)
    const old = s
    s = sessionReducer(s, { type: 'APPLY_OPPONENT_DISCARD', decisionKey: key, selectedIds: [game.opponentHand[0].uid] })
    assert.deepEqual(s.selectedIds, old.selectedIds)
    assert.equal(s.game.phase, 'player-discard-1')
    assert.equal(s.game.opponentDiscardsUsed, 1)
    assert.equal(sessionReducer(s, { type: 'APPLY_OPPONENT_DISCARD', decisionKey: key, selectedIds: [] }), s)
    const secondKey = getOpponentDecisionKey(1, s.game)
    s = sessionReducer(s, { type: 'SUBMIT_DISCARD' })
    assert.equal(s.game.phase, 'player-discard-2')
    assert.equal(getOpponentDecisionKey(1, s.game), secondKey)
    s = sessionReducer(s, { type: 'APPLY_OPPONENT_DISCARD', decisionKey: secondKey, selectedIds: [] })
    assert.equal(s.game.opponentDiscardsUsed, 2)
    assert.equal(s.game.phase, 'player-discard-2')
    s = sessionReducer(s, { type: 'SUBMIT_DISCARD' })
    assert.equal(s.game.phase, 'battle-ready')
    assert.equal(sessionReducer(s, { type: 'SUBMIT_DISCARD' }), s)
  } finally { await server.close() }
})

test('starting a human room from a remembered David game keeps the room simultaneous flow', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  try {
    const { startRoomGame } = await server.ssrLoadModule('/src/network/roomGame.js')
    const room = startRoomGame({ settings: { gameMode: 'five-hand-discard', opponentAi: 'david', discardOpponentAi: 'david' },
      gameMode: 'five-hand-discard', game: createFiveHandDiscardGame({ concurrentOpponent: true }), nextDraftStartingPicker: 'player',
      battleInstance: 0, gameSessionKey: 0, dealId: 1 })
    assert.equal(room.settings.opponentAi, 'rules')
    assert.equal(room.game.concurrentOpponent, undefined)
    assert.deepEqual(room.discardReady, {})
  } finally { await server.close() }
})
