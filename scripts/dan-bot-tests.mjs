import test from 'node:test'
import assert from 'node:assert/strict'
import { chooseDanDecision } from '../src/game/danBot.js'
import { chooseFastPreparation, completeFastPreparation } from '../src/game/fastPreparation.js'
import sharedModel from '../data/dan-shared-handpairs-net.json' with { type: 'json' }
import { createLearnedHandPolicy } from '../src/game/learnedHandEvaluator.js'
import { chooseDanDecision as chooseLegacyDanDecision } from '../src/game/legacyDanBotV6.js'
import { getOpponentAiOptions, normalizeOpponentSettings, requestOpponentSearchAction, requestOpponentPreparation } from '../src/game/opponentAi.js'
import { createHeadlessGame, stepHeadlessGame, getLegalActions, chooseHeadlessBaselineAction } from '../src/game/headlessGame.js'
import { applyPreparationAction } from '../src/game/preparationState.js'
import { getResearchAiProfile, chooseResearchAiDecision } from '../src/game/researchAi.js'

test('Dan/David are linked and Sven follows both modes across reloads', () => {
  let s = normalizeOpponentSettings({ gameMode: 'draft' })
  assert.equal(s.opponentAi, 'dan')
  s = normalizeOpponentSettings(s, { gameMode: 'five-hand-discard' })
  assert.equal(s.opponentAi, 'david')
  s = normalizeOpponentSettings(s, { opponentAi: 'search' })
  s = normalizeOpponentSettings(JSON.parse(JSON.stringify(s)), { gameMode: 'draft' })
  assert.equal(s.opponentAi, 'search')
  s = normalizeOpponentSettings(s, { gameMode: 'five-hand-discard' })
  assert.equal(s.opponentAi, 'search')
  s = normalizeOpponentSettings(s, { gameMode: 'draft', opponentAi: 'dan' })
  assert.equal(normalizeOpponentSettings(s, { gameMode: 'five-hand-discard' }).opponentAi, 'david')
  s = normalizeOpponentSettings(s, { gameMode: 'five-hand-discard', opponentAi: 'david' })
  assert.equal(normalizeOpponentSettings(s, { gameMode: 'draft' }).opponentAi, 'dan')
  assert.ok(getOpponentAiOptions('draft').some(o => o.label === 'DanBot (Hard)'))
  assert.ok(!getOpponentAiOptions('five-hand-discard').some(o => o.id === 'dan'))
  assert.ok(!getOpponentAiOptions('draft').some(o => o.id === 'david'))
  assert.equal(getResearchAiProfile('draft').id, 'dan')
  assert.equal(getResearchAiProfile('five-hand-discard').id, 'david')
  assert.equal(getResearchAiProfile('draft').preparationVersion, 'two-order-discard-six-lookup-actual-preparation-v2')
  assert.equal(getResearchAiProfile('five-hand-discard').preparationVersion, 'david-preparation-adaptive-probability-unbiased-v2')
})

test('v10 uses shared picks2–4, v6 opening and the tested discard-six fifth-pick planner', () => {
  let s = createHeadlessGame({ mode: 'draft', tabletop: 'abilities-main', wildDeck: false, control: 'both', seed: 42 })
  const roots = []
  while (!s.preparation) {
    const size = s.game[s.actor+'Hand'].length + 1
    const before = JSON.stringify(s)
    const result = chooseDanDecision(s.game, s.actor, { seed: 42 })
    const neural = [2,3,4].includes(size)
    const independent = neural ? createLearnedHandPolicy({ ...sharedModel, hand_size: size }).choose(s.game, s.actor) : size===1 ? chooseLegacyDanDecision(s.game, s.actor, { seed: 42 }) : null
    assert.equal(result.version, 'dan-draft-shared234-discard6lookup-opponentfirst5-twoorderprep-v10')
    assert.equal(result.stage, neural ? `neural-round${size}` : size===1 ? 'opening-ranking' : 'opponent-first-round5')
    if (neural) assert.equal(result.checkpointSha256, sharedModel.checkpoint_sha256)
    assert.equal(result.samples, 0)
    if (independent) {
      assert.deepEqual(result.action, independent.action)
      assert.deepEqual(result.values, independent.values)
    } else assert.equal(result.discardSixLookupVersion, 'dan-discard-six-combat-prior-shield-points-v2')
    if (neural) assert.equal(result.predictions, roots.length % 2 ? 4 : 20)
    if (size===5) assert.equal(result.comparisons, roots.length % 2 ? 4 : 20)
    assert.equal(JSON.stringify(s), before)
    assert.ok(getLegalActions(s).some(a => a.type === result.action.type && a.uid === result.action.uid))
    const hidden = structuredClone(s.game); hidden.deck.reverse()
    const again = chooseDanDecision(hidden, s.actor)
    for (const key of ['action','values','margins','stage','predictions','comparisons']) assert.deepEqual(again[key], result[key])
    roots.push(size)
    s = stepHeadlessGame(s, result.action)
  }
  assert.deepEqual(roots, [1,1,2,2,3,3,4,4,5,5])
  const profile = getResearchAiProfile('draft')
  assert.deepEqual(profile.decision.rounds, [2,3,4])
  assert.equal(profile.decision.checkpointSha256, sharedModel.checkpoint_sha256)
})

test('unsupported battle rules preserve the explicit Dan v6 fallback', () => {
  let s = createHeadlessGame({ mode: 'draft', tabletop: false, wildDeck: false, control: 'both', seed: 7 })
  while (s.game[s.actor+'Hand'].length < 1) s = stepHeadlessGame(s, chooseHeadlessBaselineAction(s))
  const current = chooseDanDecision(s.game, s.actor, { seed: 42 })
  const legacy = chooseLegacyDanDecision(s.game, s.actor, { seed: 42 })
  assert.equal(current.fallbackVersion, 'dan-draft-expanded3-opponentfirst5-twoorderprep-v6')
  assert.deepEqual(current.action, legacy.action)
  assert.deepEqual(current.values, legacy.values)
})

test('v10 retains two-order actual preparation with the six-card lookup', async () => {
  let s = createHeadlessGame({ mode: 'draft', tabletop: 'abilities-main', wildDeck: false, control: 'both', seed: 42 })
  while (!s.preparation) s = stepHeadlessGame(s, chooseDanDecision(s.game, s.actor).action)
  const result = await chooseFastPreparation(s)
  assert.equal(result.version, 'two-order-discard-six-lookup-actual-preparation-v2')
  assert.equal(result.leafModel, 'two-order-prepared-opponent-target-v1')
  assert.ok(result.planningOrders.matrix.length === 2)
})

for (const mode of ['draft', 'five-hand-discard']) for (const tabletop of [false, 'threshold', 'abilities-main', 'abilities-prototype']) {
  test(`shared preparation legal, input-preserving and hidden-order independent: ${mode}/${tabletop || 'Battle'}`, async () => {
    let s = createHeadlessGame({ mode, tabletop, wildDeck: true, control: 'both', seed: 7 })
    while (!s.preparation) s = stepHeadlessGame(s, chooseHeadlessBaselineAction(s))
    // Fix the private coin across cloned public views; live games keep secure random commitments.
    const before = JSON.stringify(s), options = { chanceLimit: 4, maxNodes: 500, rng: () => .37 }
    const a = await chooseFastPreparation(s, options)
    assert.equal(JSON.stringify(s), before)
    assert.ok(getLegalActions(s).some(x => JSON.stringify(x) === JSON.stringify(a.action)))
    assert.equal(a.metrics.rolloutSteps, 0)
    const changed = structuredClone(s)
    changed.game.deck.reverse(); changed.preparation.deck.reverse()
    if (mode === 'five-hand-discard') {
      const enemy = s.actor === 'player' ? 'opponent' : 'player'
      const replacement = changed.preparation.deck.splice(0, 1)[0]
      changed.preparation.deck.push(changed.preparation[`${enemy}Hand`][0])
      changed.preparation[`${enemy}Hand`][0] = replacement
    }
    const b = await chooseFastPreparation(changed, options)
    assert.deepEqual(a.action, b.action); assert.deepEqual(a.values, b.values)
    if (mode === 'five-hand-discard') assert.deepEqual(a.opponentPrior, b.opponentPrior)
    const completed = await completeFastPreparation(s.preparation, s.game, s.actor, options)
    let independent = s.preparation
    for (const step of completed.steps) independent = applyPreparationAction(independent, s.actor, step.action)
    assert.deepEqual(completed.preparation, independent)
    assert.ok(completed.preparation[`${s.actor}Finished`])
  })
}

test('browser requests route Dan and shared preparation to their worker paths', async () => {
  const original = globalThis.Worker, messages = []
  globalThis.Worker = class {
    postMessage(m) {
      messages.push(m)
      queueMicrotask(() => this.onmessage({ data: { id: m.id, ok: true,
        ...(m.kind ? { preparation: { ...m.preparation, opponentFinished: true } } : { action: { type: 'draft-pick', uid: 'selected' } }) } }))
    }
  }
  try {
    assert.equal((await requestOpponentSearchAction({ mode: 'draft' }, 'dan')).uid, 'selected')
    assert.equal(messages.at(-1).bot, 'dan')
    const patch = await requestOpponentPreparation({}, { mode: 'draft' }, 'dan')
    assert.equal(messages.at(-1).kind, 'fast-preparation'); assert.equal(patch.opponentFinished, true)
    await requestOpponentPreparation({}, { mode: 'five-hand-discard' }, 'david')
    assert.equal(messages.at(-1).kind, 'fast-preparation')
  } finally { globalThis.Worker = original }
})

test('research action uses shared preparation and records actual profile', async () => {
  let s = createHeadlessGame({ mode: 'draft', tabletop: 'abilities-main', wildDeck: false, control: 'both', seed: 19 })
  assert.equal((await chooseResearchAiDecision(s, { seed: 7 })).stage, 'opening-ranking')
  while (!s.preparation) s = stepHeadlessGame(s, chooseHeadlessBaselineAction(s))
  const result = await chooseResearchAiDecision(s)
  assert.equal(result.version, getResearchAiProfile('draft').preparationVersion)
  assert.equal(result.discardAllBias, 0)
  assert.equal(getResearchAiProfile('draft').preparation.discardAllBias, 0)
  assert.equal(getResearchAiProfile('five-hand-discard').preparation.discardAllBias, 0)
})
