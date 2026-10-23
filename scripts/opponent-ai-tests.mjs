import test from 'node:test'
import assert from 'node:assert/strict'
import { createHeadlessGame, stepHeadlessGame, chooseHeadlessBaselineAction } from '../src/game/headlessGame.js'
import { searchDecision, searchPreparationDecision, searchSidePreparation, preparationView } from '../src/game/searchAi.js'
import { getPreparationActions } from '../src/game/preparationState.js'
import { getActivatablePreBattleCards } from '../src/game/preBattleEffects.js'
import { normalizeOpponentAi, OPPONENT_AI_OPTIONS, BOT_SEARCH_PROFILES, getDecisionOptions, getOpponentAiName, isSearchOpponentAi } from '../src/game/opponentAi.js'

const FIXED = { minSamples: 12, maxSamples: 12, timeBudgetMs: 1e9, seed: 4242 }

function advanceToOpponentDecision(mode, seed, firstPicker = 'player') {
  let state = createHeadlessGame({ mode, control: 'both', seed, firstPicker })
  while (state.actor !== 'opponent') state = stepHeadlessGame(state, chooseHeadlessBaselineAction(state))
  return state
}

test('opponent options list RolfBot, IngaBot, SvenBot and Discard DavidBot', () => {
  assert.deepEqual(OPPONENT_AI_OPTIONS.map((option) => option.label), ['RolfBot (Easy)', 'IngaBot (Medium)', 'SvenBot (Hard)', 'DavidBot (Very Hard)'])
  assert.deepEqual(OPPONENT_AI_OPTIONS.map((option) => option.id), ['rules', 'shallow', 'search', 'david'])
  assert.equal(normalizeOpponentAi('search'), 'search')
  assert.equal(normalizeOpponentAi('shallow'), 'shallow')
  assert.equal(normalizeOpponentAi('neural'), 'rules')
  assert.deepEqual(['rules', 'shallow', 'search'].map(getOpponentAiName), ['RolfBot', 'IngaBot', 'SvenBot'])
  assert.deepEqual(['rules', 'shallow', 'search'].map(isSearchOpponentAi), [false, true, true])
})

test('IngaBot shallow search: few samples, Rules AI rollouts, keeps the Rules choice unless clearly beaten', () => {
  const { draft, discard } = BOT_SEARCH_PROFILES.shallow.decision
  for (const [mode, options] of [['draft', draft], ['five-hand-discard', discard]]) {
    const { game } = advanceToOpponentDecision(mode, 37)
    const result = searchDecision(game, 'opponent', { ...options, seed: 5 })
    assert.equal(result.samples, options.maxSamples)
    assert.equal(getDecisionOptions(BOT_SEARCH_PROFILES.shallow.decision, mode), options)
  }
  const { game } = advanceToOpponentDecision('five-hand-discard', 41)
  // An impossible margin always returns the Rules AI's own choice.
  const strict = searchDecision(game, 'opponent', { ...discard, margin: 3, seed: 9 })
  assert.equal(strict.chosenIndex, strict.baselineIndex)
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

// The opponent's first preparation decision with a real choice on this deal (Rules AI play until then).
function opponentPreparationAt(mode, seed) {
  let state = createHeadlessGame({ mode, control: 'both', seed })
  while (!state.terminal) {
    if (state.preparation && state.actor === 'opponent' && getPreparationActions(state.preparation, 'opponent').length > 1) {
      return state
    }
    state = stepHeadlessGame(state, chooseHeadlessBaselineAction(state))
  }
  return null
}

function advanceToOpponentPreparation(mode, firstSeed) {
  for (let seed = firstSeed; seed < firstSeed + 400; seed += 1) {
    const state = opponentPreparationAt(mode, seed)
    if (state) return state
  }
  throw new Error('No opponent preparation choice found')
}

const sameCards = (a, b) => assert.deepEqual(a.map((card) => card.uid).sort(), b.map((card) => card.uid).sort())

for (const mode of ['draft', 'five-hand-discard']) {
  test(`${mode} preparation search is legal and blind to the deck order and the rival's private preparation`, () => {
    const { preparation, game } = advanceToOpponentPreparation(mode, mode === 'draft' ? 61000 : 62000)
    const result = searchPreparationDecision(preparation, game, 'opponent', FIXED)
    const legal = getPreparationActions(preparation, 'opponent')
    assert.ok(legal.some((action) => JSON.stringify(action) === JSON.stringify(result.action)))
    assert.equal(result.samples, 12)
    // Same unseen cards, different secret arrangement: reversed deck, and the rival's prepared
    // hand swapped with deck cards. The searcher cannot tell these worlds apart.
    const reversed = { ...preparation, deck: [...preparation.deck].reverse() }
    assert.deepEqual(searchPreparationDecision(reversed, game, 'opponent', FIXED).values, result.values)
    const hidden = preparation.playerHand.filter((card) => !game.playerHand.some((entry) => entry.uid === card.uid))
    if (mode === 'draft' && hidden.length && preparation.deck.length >= hidden.length) {
      const swapped = { ...preparation,
        playerHand: [...preparation.playerHand.filter((card) => !hidden.includes(card)), ...preparation.deck.slice(0, hidden.length)],
        deck: [...hidden, ...preparation.deck.slice(hidden.length)] }
      assert.deepEqual(searchPreparationDecision(swapped, game, 'opponent', FIXED).values, result.values)
    }
    const view = preparationView(preparation, game, 'opponent')
    sameCards(view.ownHand, preparation.opponentHand)
    assert.ok(view.unseen.every((card, index) => index === 0 || view.unseen[index - 1].uid < card.uid))
  })
}

test('searched preparation finishes every special with real draws and never touches the rival', () => {
  const { preparation, game } = advanceToOpponentPreparation('draft', 63000)
  const { preparation: done, steps } = searchSidePreparation(preparation, game, 'opponent', FIXED)
  assert.ok(steps.length >= 1)
  assert.ok(done.opponentFinished || getActivatablePreBattleCards(done.opponentHand, done.opponentActivated).length === 0)
  assert.deepEqual(done.playerHand, preparation.playerHand)
  assert.deepEqual(done.playerActivated, preparation.playerActivated)
  assert.equal(done.deck.length, preparation.deck.length - done.opponentDrawnCount + preparation.opponentDrawnCount)
})

test('searched preparation scores at least as well as Rules AI preparation on the same deals', () => {
  let searched = 0
  let rules = 0
  let games = 0
  for (let seed = 64000; games < 30 && seed < 65000; seed += 1) {
    const start = opponentPreparationAt('draft', seed)
    if (!start) continue
    const finish = (pickOpponent) => {
      let state = start
      while (!state.terminal) {
        state = stepHeadlessGame(state, state.actor === 'opponent' ? pickOpponent(state) : chooseHeadlessBaselineAction(state))
      }
      return state.battleResult.winner === 'opponent' ? 1 : state.battleResult.winner === 'tie' ? 0.5 : 0
    }
    searched += finish((state) => searchPreparationDecision(state.preparation, state.game, 'opponent', { ...FIXED, seed }).action)
    rules += finish(chooseHeadlessBaselineAction)
    games += 1
  }
  assert.equal(games, 30)
  assert.ok(searched >= rules, `search ${searched} vs rules ${rules} over ${games} preparations`)
})

test('browser Battle waits for the searched opponent preparation and ignores stale results', async () => {
  const { createServer } = await import('vite')
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  try {
    const { sessionReducer } = await server.ssrLoadModule('/src/hooks/useGameSession.js')
    const { requestOpponentPreparation } = await server.ssrLoadModule('/src/game/opponentAi.js')
    const { createPreparationState } = await server.ssrLoadModule('/src/game/preparationState.js')
    const { game } = advanceToOpponentPreparation('draft', 66000)
    const session = (opponentAi) => ({
      settings: { opponentAi, gameMode: 'draft' }, gameMode: 'draft', game,
      preBattle: { ...createPreparationState(game), armedPlayerCopyUid: null, recycleSelection: null,
        infoOverlay: null, pendingAnimation: null, pendingResolution: null, activationTick: 0 },
      selectedIds: [], battleStarted: false, battleLogOpen: false, battleInstance: 3, gameSessionKey: 0, dealId: 7,
      lastTransition: null, pendingPlayerDraftPickAnimation: null, suppressedHandCardIds: { player: [], opponent: [] },
    })
    assert.ok(sessionReducer(session('rules'), { type: 'START_BATTLE' }).battleStarted)
    const waiting = sessionReducer(session('search'), { type: 'START_BATTLE' })
    assert.equal(waiting.battleStarted, false)
    assert.equal(waiting.preBattle.opponentSearchKey, '7:3')
    assert.strictEqual(sessionReducer(waiting, { type: 'START_BATTLE' }), waiting)
    // No Worker in Node: the client falls back to the short main-thread search.
    const opponentPreparation = await requestOpponentPreparation(waiting.preBattle, game)
    assert.strictEqual(sessionReducer(waiting, { type: 'START_BATTLE', opponentPreparation, decisionKey: 'old' }), waiting)
    const started = sessionReducer(waiting, { type: 'START_BATTLE', opponentPreparation, decisionKey: '7:3' })
    assert.ok(started.battleStarted)
    assert.deepEqual(started.preBattle.opponentHand, opponentPreparation.opponentHand)
    assert.deepEqual(started.preBattle.playerHand, waiting.preBattle.playerHand)
    assert.equal(started.preBattle.opponentSearchKey, null)
  } finally {
    await server.close()
  }
})
