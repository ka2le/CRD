import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createHeadlessGame } from '../src/game/headlessGame.js'
import { createPreparationState } from '../src/game/preparationState.js'

test('normal play locks NC, preserves hands when toggling tools, and redeals when leaving test rules', async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  try {
    const { normalizePlaySettings, sessionReducer } = await server.ssrLoadModule('/src/hooks/useGameSession.js')
    const settings = normalizePlaySettings({ gameMode: 'draft', opponentAi: 'felix', testing: false,
      tabletop: 'threshold', wildDeck: true, showOpponentCards: false })
    assert.equal(settings.tabletop, 'abilities-new-cards')
    assert.equal(settings.wildDeck, false)
    assert.equal(settings.showOpponentCards, true)
    const game = createHeadlessGame({ mode: 'draft', tabletop: settings.tabletop, seed: 41 }).game
    const state = { settings, gameMode: 'draft', game, preBattle: createPreparationState(game),
      nextDraftStartingPicker: 'player', battleInstance: 0, gameSessionKey: 0, dealId: 1 }
    const tools = sessionReducer(state, { type: 'UPDATE_SETTINGS', patch: { testing: true } })
    assert.strictEqual(tools.game, game)
    const normal = sessionReducer(tools, { type: 'UPDATE_SETTINGS', patch: { testing: false } })
    assert.strictEqual(normal.game, game)
    const blocked = sessionReducer(normal, { type: 'UPDATE_SETTINGS', patch: { tabletop: false, wildDeck: true } })
    assert.strictEqual(blocked.game, game)
    const custom = sessionReducer(tools, { type: 'UPDATE_SETTINGS', patch: { tabletop: false, wildDeck: true, showOpponentCards: false } })
    assert.equal(custom.settings.tabletop, false)
    assert.equal(custom.settings.wildDeck, true)
    const exited = sessionReducer(custom, { type: 'UPDATE_SETTINGS', patch: { testing: false } })
    assert.notStrictEqual(exited.game, custom.game)
    assert.equal(exited.settings.tabletop, 'abilities-new-cards')
    assert.equal(exited.settings.wildDeck, false)
    assert.equal(exited.game.deck.length + exited.game.draftRow.length, 73)
    assert(exited.game.deck.every(c => c.tabletop === 'abilities-new-cards' && c.id !== 'no_stats_to_2'))
  } finally { await server.close() }
})
