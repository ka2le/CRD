import test from 'node:test'
import assert from 'node:assert/strict'
import { createHeadlessGame, stepHeadlessGame, chooseHeadlessBaselineAction } from '../src/game/headlessGame.js'
import { searchDecision } from '../src/game/searchAi.js'
import { normalizeOpponentAi, OPPONENT_AI_OPTIONS } from '../src/game/opponentAi.js'

const FIXED = { minSamples: 12, maxSamples: 12, timeBudgetMs: 1e9, seed: 4242 }

function advanceToOpponentDecision(mode, seed, firstPicker = 'player') {
  let state = createHeadlessGame({ mode, control: 'both', seed, firstPicker })
  while (state.actor !== 'opponent') state = stepHeadlessGame(state, chooseHeadlessBaselineAction(state))
  return state
}

test('opponent options list Rules and Search AI', () => {
  assert.deepEqual(OPPONENT_AI_OPTIONS.map((option) => option.label), ['Rules AI (Easy)', 'Search AI (Medium)'])
  assert.equal(normalizeOpponentAi('search'), 'search')
  assert.equal(normalizeOpponentAi('neural'), 'rules')
})

test('draft search picks a legal card and ignores the secret deck order', () => {
  const { game } = advanceToOpponentDecision('draft', 31)
  const result = searchDecision(game, 'opponent', FIXED)
  assert.ok(game.draftRow.some((card) => card.uid === result.action.uid))
  assert.equal(result.samples, 12)
  const reordered = searchDecision({ ...game, deck: [...game.deck].reverse() }, 'opponent', FIXED)
  assert.deepEqual(reordered.values, result.values)
})

test('discard search picks a subset of its own hand and ignores the rival hidden hand', () => {
  const { game } = advanceToOpponentDecision('five-hand-discard', 32)
  assert.ok(game.phase.startsWith('opponent-discard'))
  const result = searchDecision(game, 'opponent', FIXED)
  const own = new Set(game.opponentHand.map((card) => card.uid))
  assert.ok(result.action.selectedIds.every((uid) => own.has(uid)))
  // Swap the player's private hand with deck cards: the searcher cannot tell the difference.
  const swapped = { ...game, playerHand: game.deck.slice(0, 5), deck: [...game.playerHand, ...game.deck.slice(5)] }
  assert.deepEqual(searchDecision(swapped, 'opponent', FIXED).values, result.values)
})

for (const mode of ['draft', 'five-hand-discard']) {
  test(`search opponent outscores the rules AI in ${mode}`, () => {
    let points = 0
    const games = 40
    for (let index = 0; index < games; index += 1) {
      let state = createHeadlessGame({ mode, control: 'both', seed: 5000 + index, firstPicker: index % 2 ? 'opponent' : 'player' })
      while (!state.terminal) {
        const action = state.actor === 'opponent' && !state.preparation
          ? searchDecision(state.game, 'opponent', { ...FIXED, seed: 77 + index }).action
          : chooseHeadlessBaselineAction(state)
        state = stepHeadlessGame(state, action)
      }
      points += state.battleResult.winner === 'opponent' ? 1 : (state.battleResult.winner === 'tie' ? 0.5 : 0)
    }
    assert.ok(points / games > 0.55, `search scored ${points}/${games}`)
  })
}
