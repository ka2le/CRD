import test from 'node:test'
import assert from 'node:assert/strict'
import { getOpponentAiOptions, normalizeOpponentSettings, requestOpponentSearchAction, requestOpponentPreparation } from '../src/game/opponentAi.js'
import { chooseFelixDecision, FELIX_CHECKPOINT_SHA256 } from '../src/game/felixBot.js'
import { FELIX_NC_CHECKPOINT_SHA256, getFelixPreparationOptions } from '../src/game/felixNcBot.js'
import { createHeadlessGame, stepHeadlessGame } from '../src/game/headlessGame.js'
import { getExpandedCoreDeck } from '../src/game/cards.js'
import { createPreparationState } from '../src/game/preparationState.js'
import { MAIN_ABILITY_SHIELD_COST } from '../src/game/tabletop.js'

test('one Felix selection survives NC/main, reload and the unsupported NC Discard roundtrip', () => {
  assert.equal(getOpponentAiOptions('draft', 'abilities-new-cards').filter(o => o.id === 'felix').length, 1)
  assert.equal(getOpponentAiOptions('draft', 'abilities-new-cards').find(o => o.id === 'felix').name, 'Felix')
  assert(!getOpponentAiOptions('five-hand-discard', 'abilities-new-cards').some(o => o.id === 'felix'))
  let s = normalizeOpponentSettings({ gameMode: 'draft', tabletop: 'abilities-main' }, { opponentAi: 'felix' })
  s = normalizeOpponentSettings(s, { tabletop: 'abilities-new-cards' })
  assert.equal(s.opponentAi, 'felix')
  s = normalizeOpponentSettings(JSON.parse(JSON.stringify(s)))
  assert.equal(s.opponentAi, 'felix')
  s = normalizeOpponentSettings(s, { gameMode: 'five-hand-discard' })
  assert.equal(s.opponentAi, 'shallow')
  assert.equal(s.draftOpponentAi, 'felix')
  s = normalizeOpponentSettings(s, { gameMode: 'draft' })
  assert.equal(s.opponentAi, 'felix')
  s = normalizeOpponentSettings(s, { tabletop: 'abilities-main' })
  assert.equal(s.opponentAi, 'felix')
  s = normalizeOpponentSettings(s, { tabletop: 'abilities-new-cards', opponentAi: 'rules' })
  assert.equal(s.opponentAi, 'rules')
})

test('the public Felix request routes NC to the qualified model and main to its existing checkpoint', async () => {
  let s = createHeadlessGame({ mode: 'draft', tabletop: 'abilities-new-cards', seed: 4182, firstPicker: 'opponent', control: 'both' })
  while (!s.preparation) {
    const result = chooseFelixDecision(s.game, s.actor)
    assert.equal(result.checkpointSha256, FELIX_NC_CHECKPOINT_SHA256)
    assert.equal(result.checkpointSha256, 'e9b03e264b3e486fa93fb8f7a084a62b683540d405c7a57bcf8ce85d632958af')
    assert.equal(result.compatibility, undefined)
    assert.equal(result.fallback, undefined)
    assert.equal(result.stage, 'FelixNC-round' + (s.game[s.actor + 'Hand'].length + 1))
    if (s.actor === 'opponent') assert.deepEqual(await requestOpponentSearchAction(s.game, 'felix'), result.action)
    const hidden = structuredClone(s.game); hidden.deck.reverse()
    assert.deepEqual(chooseFelixDecision(hidden, s.actor).values, result.values)
    s = stepHeadlessGame(s, result.action)
  }
  assert.deepEqual(getFelixPreparationOptions(s.game), { discardSixLookup: false, timeBudgetMs: 1e12, maxNodes: 12000, maxDepth: 8 })
  const main = createHeadlessGame({ mode: 'draft', tabletop: 'abilities-main', seed: 42 })
  assert.equal(chooseFelixDecision(main.game, main.actor).checkpointSha256, FELIX_CHECKPOINT_SHA256)
  assert.deepEqual(getFelixPreparationOptions(main.game), { discardSixLookup: false })
})

test('browser NC preparation finishes the real discard action with the bounded native planner', async () => {
  const defs = new Map(getExpandedCoreDeck({ tabletop: 'abilities-new-cards' }).map(c => [c.id, c]))
  let serial = 0
  const hand = ids => ids.map(id => ({ ...defs.get(id), uid: 'browser-nc-' + serial++ }))
  const game = { mode: 'draft', playerHand: hand(['shield2', 'bite']), opponentHand: hand(['draw_2_discard_2', 'robot2', 'robot_ulti']), deck: hand(['robot1', 'dragon1']), draftDiscard: [] }
  const state = createPreparationState(game), before = JSON.stringify(state)
  const patch = await requestOpponentPreparation(state, game, 'felix')
  assert.equal(JSON.stringify(state), before)
  assert.equal(patch.opponentFinished, true)
  assert.equal(patch.opponentPendingDiscard, null)
  assert.equal(patch.opponentHand.length, 3)
  assert.equal(patch.opponentDiscard.length, 2)
  assert.deepEqual(MAIN_ABILITY_SHIELD_COST, { critter: 1, robot: 1, dragon: 0 })
  for (const id of ['single_faction_2', 'draw_2_discard_2', 'critter_shield', 'discard_for_damage']) assert(defs.has(id))
  assert(!defs.has('no_stats_to_2'))
})
