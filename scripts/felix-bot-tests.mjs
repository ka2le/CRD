import test from 'node:test'
import assert from 'node:assert/strict'
import { chooseFelixDecision, felixAdapter, felixPolicy, FELIX_CHECKPOINT_SHA256 } from '../src/game/felixBot.js'
import { createHeadlessGame, stepHeadlessGame, getLegalActions, chooseHeadlessBaselineAction } from '../src/game/headlessGame.js'
import { getOpponentAiOptions, normalizeOpponentSettings, requestOpponentSearchAction, requestOpponentPreparation } from '../src/game/opponentAi.js'
import { completeFastPreparation } from '../src/game/fastPreparation.js'

test('Felix is a distinct Draft choice, survives reload and returns after Discard', () => {
  assert.ok(getOpponentAiOptions('draft').some(o => o.id === 'felix'))
  assert.ok(!getOpponentAiOptions('five-hand-discard').some(o => o.id === 'felix'))
  let settings = normalizeOpponentSettings({ gameMode: 'draft' }, { opponentAi: 'felix' })
  settings = normalizeOpponentSettings(JSON.parse(JSON.stringify(settings)), { gameMode: 'five-hand-discard' })
  assert.equal(settings.opponentAi, 'david')
  settings = normalizeOpponentSettings(settings, { gameMode: 'draft' })
  assert.equal(settings.opponentAi, 'felix')
  assert.equal(normalizeOpponentSettings(settings, { opponentAi: 'dan' }).draftOpponentAi, 'dan')
  assert.equal(normalizeOpponentSettings({ gameMode: 'draft' }).opponentAi, 'dan')
})

test('Felix240k uses the selected WDL net on every draft pick and hides future cards', async () => {
  let s = createHeadlessGame({ mode: 'draft', tabletop: 'abilities-main', wildDeck: false, control: 'both', seed: 42 })
  const sizes = []
  while (!s.preparation) {
    const before = JSON.stringify(s), size = s.game[s.actor + 'Hand'].length + 1
    const x = chooseFelixDecision(s.game, s.actor)
    assert.ok(getLegalActions(s).some(a => a.uid === x.action.uid))
    assert.equal(JSON.stringify(s), before)
    assert.equal(FELIX_CHECKPOINT_SHA256, '457c44a5a52de7cb85dd6f0317f9fa4fe4cb9faeb80bec3e999b97e03e15d326')
    assert.equal(x.checkpointSha256, FELIX_CHECKPOINT_SHA256)
    assert.equal(x.stage, 'felix-round' + size)
    assert.equal(x.predictions, sizes.length % 2 ? 4 : 20)
    assert.equal(x.fallback, undefined)
    const hidden = structuredClone(s.game); hidden.deck.reverse()
    assert.deepEqual(chooseFelixDecision(hidden, s.actor).values, x.values)
    if (s.actor === 'opponent') assert.deepEqual(await requestOpponentSearchAction(s.game, 'felix'), x.action)
    sizes.push(size); s = stepHeadlessGame(s, x.action)
  }
  assert.deepEqual(sizes, [1,1,2,2,3,3,4,4,5,5])
})

test('Felix numeric encoding matches official combat and ignores identity labels', () => {
  const cs = [...felixAdapter.definitions.values()]
  for (let i = 0; i < 120; i++) {
    const size = i % 5 + 1
    const own = Array.from({length:size}, (_,j) => cs[(i*7+j*3)%cs.length])
    const enemy = Array.from({length:size}, (_,j) => cs[(i*11+j*5)%cs.length])
    felixAdapter.oracle(own, enemy)
    const x = felixPolicy.predict(own, enemy)
    const reverse = felixPolicy.predict([...own].reverse(), [...enemy].reverse())
    assert.deepEqual(x, reverse)
    const rename = hand => hand.map((c,j) => ({ id: 'renamed'+j, uid: 'private'+j, name:'unused', felixEffects:felixAdapter.descriptor(c) }))
    assert.deepEqual(felixPolicy.predict(rename(own), rename(enemy)), x)
    const swapped = felixPolicy.predict(enemy, own)
    assert.ok(Math.abs(x.value + swapped.value - 1) < 1e-14)
  }
})

test('Felix browser preparation fallback uses analytic planner and real physical actions', async () => {
  let s = createHeadlessGame({ mode:'draft', tabletop:'abilities-main', wildDeck:false, control:'both', seed:42 })
  while (!s.preparation) s = stepHeadlessGame(s, chooseHeadlessBaselineAction(s))
  const patch = await requestOpponentPreparation(s.preparation, s.game, 'felix')
  assert.ok(patch.opponentFinished)
  assert.deepEqual(s.preparation.playerHand, s.game.playerHand)
  const direct = await completeFastPreparation(s.preparation, s.game, 'opponent', { discardSixLookup:false })
  assert.deepEqual(patch.opponentHand, direct.preparation.opponentHand)
  assert.ok(direct.steps.every(d => d.discardSixLookupVersion === undefined))
})
