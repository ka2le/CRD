import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'vite'
import { getExpandedCoreDeck, createSeededRng, shuffle } from '../src/game/cards.js'
import { simulateBattle } from '../src/game/engine.js'
import { compileCombatCycle, compareCombatCycles } from '../src/game/davidCombat.js'
import { createHeadlessGame, stepHeadlessGame, chooseHeadlessBaselineAction, getLegalActions } from '../src/game/headlessGame.js'
import { getDavidPolicy, searchDavidDecision, davidPlanningSeed, davidStateFromGame } from '../src/game/davidBot.js'
import { getOpponentAiOptions, normalizeOpponentSettings } from '../src/game/opponentAi.js'
import { requestDavidAction } from '../src/game/davidBotClient.js'
import { getResearchAiProfile } from '../src/game/researchAi.js'

test('Battle compiled cycles match the official 21-damage/50-round resolver', () => {
  const rng = createSeededRng(61271)
  const pool = getExpandedCoreDeck({ wildDeck: true })
  for (let i = 0; i < 1024; i++) {
    const deal = shuffle(pool, { rng }), a = deal.slice(0, 5 + i % 5), b = deal.slice(10, 15 + i % 5)
    const expected = simulateBattle(a, b).winner
    assert.equal(compareCombatCycles(compileCombatCycle(a), compileCombatCycle(b)), expected === 'player' ? 1 : expected === 'opponent' ? -1 : 0)
  }
  assert.equal(compareCombatCycles(compileCombatCycle([]), compileCombatCycle([])), 0)
})

test('David public seed matches the original SHA-256 stream', async () => {
  const v = { side: 'opponent', own: [], unseen: [1, 2] }
  assert.equal(await davidPlanningSeed(v), parseInt(createHash('sha256').update(JSON.stringify({ v, stream: 912371 })).digest('hex').slice(0, 8), 16))
})

for (const tabletop of [false, 'threshold', 'abilities-main', 'abilities-prototype']) {
  for (const wildDeck of [false, true]) {
    test(`David legal/public-only decisions: ${tabletop || 'Battle'}, ${wildDeck ? 'Wild' : 'Regular'}, both passes/seats`, async () => {
      let state = createHeadlessGame({ mode: 'five-hand-discard', tabletop, wildDeck, seed: 24119, control: 'both' })
      const policy = getDavidPolicy(state.config)
      const options = { opponentCount: 3, prepScenarios: 1, chanceLimit: 4 }
      for (let step = 0; !state.preparation; step++) {
        assert.ok(step < 5)
        const report = await searchDavidDecision(state, options)
        assert.ok(getLegalActions(state).some((a) => JSON.stringify(a) === JSON.stringify(report.action)))
        assert.equal(report.values.length, 32)
        assert.ok(report.actions.every((a) => Math.abs(a.weightSum - 1) < 1e-9))
        const enemy = state.actor === 'player' ? 'opponent' : 'player'
        const changed = { ...state, game: { ...state.game, [`${enemy}Hand`]: state.game.deck.slice(0, 5),
          deck: [...state.game[`${enemy}Hand`], ...state.game.deck.slice(5)].reverse() } }
        assert.deepEqual(policy.view(changed), policy.view(state))
        assert.deepEqual((await searchDavidDecision(changed, options)).values, report.values)
        const browser = davidStateFromGame(state.game, state.actor, state.config)
        assert.deepEqual(policy.view(browser), policy.view(state))
        state = stepHeadlessGame(state, report.action)
      }
      assert.ok(state.preparation)
    })
  }
}

test('David is Discard-only; its memory persists through Draft, reload and alternate choices', () => {
  assert.equal(getOpponentAiOptions('draft').length, 3)
  assert.equal(getOpponentAiOptions('five-hand-discard').at(-1).label, 'DavidBot (Very Hard)')
  let s = normalizeOpponentSettings({ gameMode: 'five-hand-discard', opponentAi: 'rules' }, { opponentAi: 'david' })
  s = normalizeOpponentSettings(s, { gameMode: 'draft' })
  assert.equal(s.opponentAi, 'search')
  s = normalizeOpponentSettings(JSON.parse(JSON.stringify(s)))
  s = normalizeOpponentSettings(s, { opponentAi: 'shallow' })
  s = normalizeOpponentSettings(s, { gameMode: 'five-hand-discard' })
  assert.equal(s.opponentAi, 'david')
  s = normalizeOpponentSettings(s, { opponentAi: 'rules' })
  s = normalizeOpponentSettings(s, { gameMode: 'draft' })
  assert.equal(s.opponentAi, 'shallow')
  assert.equal(normalizeOpponentSettings(s, { gameMode: 'five-hand-discard' }).opponentAi, 'rules')
  assert.equal(getResearchAiProfile('five-hand-discard').id, 'david')
  assert.equal(getResearchAiProfile('draft').id, 'search')
})

test('real settings reducer preserves David across UPDATE_SETTINGS and RESET_GAME', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  try {
    const { sessionReducer } = await server.ssrLoadModule('/src/hooks/useGameSession.js')
    let s = { settings: { gameMode: 'five-hand-discard', opponentAi: 'david' }, gameMode: 'five-hand-discard',
      game: createHeadlessGame({ mode: 'five-hand-discard' }).game, nextDraftStartingPicker: 'player',
      battleInstance: 0, gameSessionKey: 0, dealId: 1 }
    s = sessionReducer(s, { type: 'UPDATE_SETTINGS', patch: { gameMode: 'draft' } })
    assert.equal(s.settings.opponentAi, 'search')
    s = sessionReducer(s, { type: 'RESET_GAME', nextMode: 'five-hand-discard' })
    assert.equal(s.settings.opponentAi, 'david')
  } finally { await server.close() }
})

test('David worker reports progress, completes, surfaces failure and cancels on mode change', async () => {
  const saved = globalThis.Worker
  let instance
  globalThis.Worker = class {
    constructor() { instance = this }
    postMessage(message) { this.message = message }
    terminate() { this.terminated = true }
  }
  try {
    let progress
    const pending = requestDavidAction({}, { onProgress: (p) => { progress = p.completed } })
    instance.onmessage({ data: { kind: 'progress', completed: 5, total: 32 } })
    assert.equal(progress, 5)
    instance.onmessage({ data: { kind: 'result', action: { type: 'discard', selectedIds: [] } } })
    assert.deepEqual(await pending, { type: 'discard', selectedIds: [] })
    assert.ok(instance.terminated)
    const controller = new AbortController()
    const aborted = requestDavidAction({}, { signal: controller.signal })
    controller.abort()
    await assert.rejects(aborted, { name: 'AbortError' })
    assert.ok(instance.terminated)
    const failed = requestDavidAction({})
    instance.onmessage({ data: { kind: 'error', error: 'test failure' } })
    await assert.rejects(failed, /test failure/)
    const early = new AbortController(); early.abort()
    await assert.rejects(requestDavidAction({}, { signal: early.signal }), { name: 'AbortError' })
  } finally { globalThis.Worker = saved }
})
