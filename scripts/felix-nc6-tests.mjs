import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { buildShuffledDeck } from '../src/game/cards.js'
import { createHeadlessGame, getLegalActions, stepHeadlessGame } from '../src/game/headlessGame.js'
import { chooseFelixDecision } from '../src/game/felixBot.js'
import { getOpponentAiOptions, normalizeOpponentSettings, requestOpponentSearchAction, requestOpponentPreparation } from '../src/game/opponentAi.js'
import { chooseFelixNc6Decision, publicFelixNc6Preparation, chooseFelixNc6Preparation, completeFelixNc6Preparation } from '../src/game/felixNc6Bot.js'
const other = side => side === 'player' ? 'opponent' : 'player'

test('one Felix option persists across supported Draft and NC six-draft modes', () => {
  assert.deepEqual(getOpponentAiOptions('6draft', 'abilities-new-cards').map(x => x.id), ['rules', 'search', 'felix'])
  assert.equal(getOpponentAiOptions('6draft', 'abilities-new-cards').filter(x => /Felix/.test(x.name)).length, 1)
  assert(!getOpponentAiOptions('6draft', 'abilities-new-cards', { wildDeck: true }).some(x => x.id === 'felix'))
  let settings = { gameMode: 'draft', tabletop: 'abilities-new-cards', wildDeck: false, opponentAi: 'felix' }
  for (const gameMode of ['6draft', 'draft', '6draft', 'draft']) {
    settings = normalizeOpponentSettings(settings, { gameMode })
    assert.equal(settings.opponentAi, 'felix')
  }
})

test('Felix handles six real picks, private set-aside and native preparation legally', async () => {
  let state = createHeadlessGame({ mode: '6draft', tabletop: 'abilities-new-cards', wildDeck: false, control: 'both', seed: 617 })
  let picks = 0, discards = 0, prepared = 0
  while (!state.terminal) {
    let result
    if (state.preparation) {
      const visible = publicFelixNc6Preparation(state.preparation, state.game, state.actor)
      const clone = structuredClone(state), enemy = other(state.actor)
      clone.preparation.deck.reverse()
      clone.game[`${enemy}Hand`] = clone.game[`${enemy}DraftedHand`].slice(1)
      clone.game[`${enemy}HiddenDiscard`] = [clone.game[`${enemy}DraftedHand`][0]]
      assert.deepEqual(publicFelixNc6Preparation(clone.preparation, clone.game, clone.actor), visible)
      assert.deepEqual(visible.preparation[`${enemy}Activated`], [])
      assert.deepEqual(visible.game[`${enemy}HiddenDiscard`], [])
      result = chooseFelixNc6Preparation(visible); prepared++
    } else {
      const before = JSON.stringify(state.game)
      result = chooseFelixDecision(state.game, state.actor)
      assert.equal(JSON.stringify(state.game), before)
      assert.deepEqual(result.action, chooseFelixNc6Decision(state.game, state.actor).action)
      if (result.action.type === 'draft-pick') picks++
      else discards++
    }
    assert(getLegalActions(state).some(a => ['type', 'uid', 'sourceUid', 'targetUid'].every(k => a[k] === result.action[k]) && JSON.stringify(a.selectedIds) === JSON.stringify(result.action.selectedIds)))
    state = stepHeadlessGame(state, result.action)
  }
  assert.equal(picks, 12); assert.equal(discards, 2); assert(prepared > 0)
  assert.equal(state.game.playerHand.length, 5); assert.equal(state.game.opponentHand.length, 5)
})

test('browser inline paths keep Felix decisions and host-side real draws', async () => {
  let state = createHeadlessGame({ mode: '6draft', tabletop: 'abilities-new-cards', wildDeck: false, control: 'both', firstPicker: 'opponent', seed: 71 })
  assert.deepEqual(await requestOpponentSearchAction(state.game, 'felix'), chooseFelixNc6Decision(state.game).action)
  while (!state.preparation) state = stepHeadlessGame(state, chooseFelixNc6Decision(state.game, state.actor).action)
  const expected = await completeFelixNc6Preparation(state.preparation, state.game)
  const actual = await requestOpponentPreparation(state.preparation, state.game, 'felix')
  for (const key of ['opponentHand', 'opponentPendingDiscard', 'opponentDiscard', 'opponentActivated', 'opponentFinished', 'opponentDrawnCount', 'deck']) assert.deepEqual(actual[key], expected.preparation[key])
})

test('installed model and public preparation reproduce saved candidate decisions', { skip: !process.env.CRD_NC6_TEST_ARCHIVE }, () => {
  const root = process.env.CRD_NC6_TEST_ARCHIVE
  const read = file => JSON.parse(zlib.gunzipSync(fs.readFileSync(file)))
  const manifest = read(path.join(root, 'stages/NC6-120k-vs-previous/raw-manifest.json.gz'))
  for (const item of manifest.slice(0, 12)) {
    const r = read(item.file), config = { mode: '6draft', tabletop: 'abilities-new-cards', wildDeck: false, control: 'both', seed: r.seed, firstPicker: r.firstPicker }
    let s = createHeadlessGame({ ...config, deck: buildShuffledDeck(config) })
    for (const d of r.decisions) {
      assert.equal(s.actor, d.actor)
      if (d.actor === r.aSeat) {
        const result = s.preparation ? chooseFelixNc6Preparation(publicFelixNc6Preparation(s.preparation, s.game, s.actor)) : chooseFelixDecision(s.game, s.actor)
        for (const key of ['type', 'uid', 'sourceUid', 'targetUid', 'selectedIds']) assert.deepEqual(result.action[key], d.action[key])
      }
      s = stepHeadlessGame(s, d.action)
    }
    assert(s.terminal); assert.equal(s.battleResult.winner, r.battleResult.winner)
    for (const side of ['player', 'opponent']) for (const key of ['score', 'damageType', 'base', 'bonus', 'shields']) assert.equal(s.battleResult[side][key], r.battleResult[side][key])
  }
})
