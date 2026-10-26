import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'vite'
import { getCoreCards, createSeededRng } from '../src/game/cards.js'
import { completeOpponentPreBattle } from '../src/game/preBattle.js'
import { createPreparationState, getPreparationActions, applyPreparationAction } from '../src/game/preparationState.js'
import { createFiveHandDiscardGame, applyDiscardPhase } from '../src/game/fiveHandDiscard.js'
import {
  createHeadlessGame, stepHeadlessGame, getLegalActions, encodeObservation, createStepResponse, getHeadlessSpec,
  chooseHeadlessBaselineAction,
} from '../src/game/headlessGame.js'
import { simulateBattle } from '../src/game/engine.js'
import { sampleHeadlessWorld, evaluateRolloutActions, choosePrepLookaheadAction } from '../src/game/rolloutSearch.js'
import { describePreparationActions } from '../src/game/preparationFeatures.js'

const definitions = new Map(getCoreCards().map((card) => [card.id, card]))
let cardSerial = 0
const card = (id, uid = `${id}-test-${++cardSerial}`) => ({ ...definitions.get(id), uid })
const prep = (hand, deck = [], discard = [], enemy = []) => createPreparationState({
  playerHand: hand, opponentHand: enemy, deck, playerDiscards: discard, opponentDiscards: [],
})
const act = (state, source, target) => applyPreparationAction(state, 'player', {
  type: 'prepare', sourceUid: source.uid, ...(target ? { targetUid: target.uid } : {}),
})
const logical = (state) => Object.fromEntries([
  'playerHand', 'opponentHand', 'deck', 'playerDiscard', 'opponentDiscard', 'playerActivated', 'opponentActivated',
].map((key) => [key, state[key]]))

test('activation order changes outcomes and recomputes legal choices', () => {
  const draw = card('draw_2_extra')
  const redraw = card('draw_all_new_1')
  const initial = prep([draw, redraw, card('critter1'), card('swarm'), card('robot1')],
    Array.from({ length: 15 }, () => card('robot1')))
  const saved = structuredClone(initial)
  const drawThenRedraw = act(act(initial, draw), redraw)
  const redrawFirst = act(initial, redraw)
  assert.equal(drawThenRedraw.playerHand.length, 8)
  assert.equal(redrawFirst.playerHand.length, 6)
  assert(!getPreparationActions(redrawFirst).some((action) => action.sourceUid === draw.uid))
  assert.throws(() => act(redrawFirst, draw), /Illegal preparation/)
  assert.deepEqual(initial, saved)
})

test('copy choices expand into every target; copied preparation activates independently', () => {
  const copy = card('copy_card_in_hand')
  const secondCopy = card('copy_card_in_hand')
  const draw = card('draw_2_extra')
  const initial = prep([copy, secondCopy, draw, card('critter1')],
    [card('swarm'), card('robot1'), card('dragon1'), card('robot_attack')])
  const actions = getPreparationActions(initial)
  assert.equal(actions.filter((action) => action.type === 'prepare' && action.sourceUid === copy.uid).length, 2)
  assert(!actions.some((action) => action.type === 'prepare' && action.targetUid === secondCopy.uid))
  const copied = act(initial, copy, draw)
  const newDraw = copied.playerHand.find((entry) => entry.isCopiedCard)
  assert(newDraw && newDraw.uid !== draw.uid)
  const drawn = act(act(copied, newDraw), draw)
  assert.equal(drawn.playerHand.length, 8)
  assert.equal(drawn.deck.length, 0)
  assert(drawn.playerActivated.includes(newDraw.uid))
  assert.throws(() => act(drawn, newDraw), /Illegal/)
})

test('recycle target selection, acquired-special chains and prior activation identity', () => {
  const recycle = card('recycle_card')
  const draw = card('draw_2_extra')
  const other = card('swarm')
  const initial = prep([recycle], [card('critter1'), card('bite')], [draw, other])
  assert.equal(getPreparationActions(initial).filter((action) => action.type === 'prepare').length, 2)
  const recovered = act(initial, recycle, draw)
  assert.deepEqual(recovered.playerDiscard, [other])
  assert(getPreparationActions(recovered).some((action) => action.sourceUid === draw.uid))
  assert.equal(act(recovered, draw).playerHand.length, 4)
  const alreadyUsed = act({ ...initial, playerActivated: [draw.uid] }, recycle, draw)
  assert(!getPreparationActions(alreadyUsed).some((action) => action.sourceUid === draw.uid))
  assert.throws(() => act(initial, recycle, card('robot1')), /Illegal/)
})

test('skip, finish, unusable targets and exhausted draws are finite and optional', () => {
  const copy = card('copy_card_in_hand')
  const initial = prep([copy])
  assert(!getPreparationActions(initial).some((action) => action.type === 'prepare'))
  const skipped = applyPreparationAction(initial, 'player', { type: 'skip-preparation', sourceUid: copy.uid })
  assert.deepEqual(getPreparationActions(skipped), [{ type: 'finish-preparation' }])
  const finished = applyPreparationAction(initial, 'player', { type: 'finish-preparation' })
  assert.deepEqual(finished.playerActivated, [])
  assert.deepEqual(getPreparationActions(finished), [])
  assert.throws(() => act(finished, copy), /Illegal/)
  const draw = card('draw_2_extra')
  assert.equal(act(prep([draw]), draw).playerHand.length, 1)
  const redraw = card('draw_all_new_1')
  assert.equal(act(prep([redraw]), redraw).playerHand.length, 0)
})

test('browser reducer and headless share every preparation effect and delayed redraw commit', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  try {
    const { sessionReducer } = await server.ssrLoadModule('/src/hooks/useGameSession.js')
    const copy = card('copy_card_in_hand')
    const draw = card('draw_2_extra')
    const recycle = card('recycle_card')
    const redraw = card('draw_all_new_1')
    const initial = prep([copy, draw, recycle, redraw, card('swarm')],
      [card('critter1'), card('robot1'), card('dragon1'), card('bite'), card('shield2'),
        card('robot_attack'), card('draw_2_extra'), card('swarm'), card('joker')], [card('dragon_ulti')],
      [card('copy_card_in_hand'), card('draw_2_extra')])
    let ui = {
      preBattle: { ...initial, activationTick: 0, armedPlayerCopyUid: null, recycleSelection: null },
      game: { phase: 'battle-ready' }, battleStarted: false, battleInstance: 0, gameSessionKey: 0,
      suppressedHandCardIds: { player: [], opponent: [] },
    }
    let engine = initial
    for (const [source, target] of [[copy, draw], [recycle, initial.playerDiscard[0]], [draw], [redraw]]) {
      engine = act(engine, source, target)
      ui = sessionReducer(ui, { type: 'ACTIVATE_PLAYER_PRE_BATTLE_CARD', uid: source.uid })
      if (source.id === 'copy_card_in_hand') {
        ui = sessionReducer(ui, { type: 'ACTIVATE_PLAYER_PRE_BATTLE_CARD', uid: target.uid })
      } else if (source.id === 'recycle_card') {
        const beforeCancel = ui.preBattle.playerActivated.length
        ui = sessionReducer(ui, { type: 'CANCEL_PLAYER_RECYCLE_PICK' })
        assert.equal(ui.preBattle.playerActivated.length, beforeCancel)
        ui = sessionReducer(ui, { type: 'ACTIVATE_PLAYER_PRE_BATTLE_CARD', uid: source.uid })
        ui = sessionReducer(ui, { type: 'RESOLVE_PLAYER_RECYCLE_PICK', uid: target.uid })
      } else if (source.id === 'draw_all_new_1') {
        assert.strictEqual(sessionReducer(ui, { type: 'START_BATTLE' }), ui)
        ui = sessionReducer(ui, { type: 'RESOLVE_PRE_BATTLE_PENDING_DRAW_ALL_NEW_1' })
      }
      assert.deepEqual(logical(ui.preBattle), logical(engine))
    }
    const completed = sessionReducer(ui, { type: 'START_BATTLE' })
    assert(completed.battleStarted)
    assert.deepEqual(logical(completed.preBattle), logical(completeOpponentPreBattle(engine)))
  } finally {
    await server.close()
  }
})

test('default headless hand-building matches the browser synchronized discard passes', () => {
  let browser = createFiveHandDiscardGame({ seed: 39, wildDeck: true })
  let state = createHeadlessGame({ seed: 39 })
  for (let pass = 0; pass < 2; pass++) {
    const ids = [state.game.playerHand[pass].uid]
    browser = applyDiscardPhase(browser, ids, { includeRecentMoves: false })
    state = stepHeadlessGame(state, { type: 'discard', selectedIds: ids })
    assert.deepEqual(state.game, browser)
  }
  assert(!state.terminal)
  assert.equal(encodeObservation(state).phase, 'preparation')
})

test('wrong phase, wrong seat, stale and malformed actions fail without mutation', () => {
  const state = createHeadlessGame({ seed: 3, control: 'both' })
  const before = JSON.stringify(state)
  for (const action of [
    -1, 32, 0.5, null, [], { type: 'discard' }, { type: 'discard', mask: -1 },
    { type: 'discard', selectedIds: ['not-in-hand'] },
    { type: 'discard', selectedIds: [state.game.playerHand[0].uid, state.game.playerHand[0].uid] },
    { type: 'discard', mask: 0, selectedIds: [state.game.playerHand[0].uid] },
    { type: 'discard', mask: 0, actor: 'opponent' }, { type: 'finish-preparation' },
  ]) assert.throws(() => stepHeadlessGame(state, action))
  assert.equal(JSON.stringify(state), before)
  for (const config of [{ mode: 'unknown' }, { control: 'bad' }, { seed: '3' },
    { firstPicker: 'bad' }, { battleEvaluation: { maxRounds: 0 } }]) {
    assert.throws(() => createHeadlessGame(config))
  }
})

test('observations never expose private hands, deck order, seed, debug or enemy preparation', () => {
  let state = createHeadlessGame({ seed: 5, control: 'both' })
  for (let i = 0; i < 4; i++) state = stepHeadlessGame(state, { type: 'discard', mask: 0 })
  const view = encodeObservation(state, 'opponent')
  assert.equal(view.opponentHand.length, 0)
  const changed = {
    ...state, config: { ...state.config, seed: 99 },
    game: { ...state.game, opponentDebug: { secret: 'debug' }, deck: [...state.game.deck].reverse() },
    preparation: {
      ...state.preparation, playerHand: [card('devour')], playerActivated: ['secret'],
      playerDrawnCount: 9, playerDiscard: [card('dragon2')], deck: [],
    },
    history: [...state.history, { scope: 'player', type: 'private-draw', secret: 'private' }],
    decisions: { ...state.decisions, player: 900 },
  }
  assert.deepEqual(encodeObservation(changed, 'opponent'), view)
  view.history.push({ type: 'tamper' })
  assert(!state.history.some((event) => event.type === 'tamper'))
  const draft = createHeadlessGame({ mode: 'draft', seed: 7, control: 'both' })
  const picked = stepHeadlessGame(draft, 0)
  assert.equal(encodeObservation(picked, 'opponent').opponentHand.length, 1)
  const serialized = JSON.stringify(encodeObservation(state))
  assert(!serialized.includes('opponentDebug') && !serialized.includes('seed') && !serialized.includes('image'))
  const shown = createHeadlessGame({ seed: 5, control: 'both', revealOpponent: true })
  const shownHistory = encodeObservation(shown).history.filter((event) => event.type === 'opening-hand')
  assert.equal(shownHistory.length, 2)
  const hiddenHistory = encodeObservation(createHeadlessGame({ seed: 5, control: 'both' })).history
  assert.equal(hiddenHistory.filter((event) => event.type === 'opening-hand').length, 1)
})

test('terminal outcomes and reward use exact 21/50 rules, with explicit diagnostic overrides', () => {
  const deck = [card('swarm'), card('swarm'), card('critter1'), card('rabbit2'), card('critter1'),
    card('robot_attack'), card('robot1'), card('robot1'), card('robot1'), card('robot1')]
  const complete = (config) => {
    let state = createHeadlessGame({ deck, control: 'both', ...config })
    while (!state.terminal) state = stepHeadlessGame(state,
      state.preparation ? { type: 'finish-preparation' } : { type: 'discard', mask: 0 })
    return state
  }
  const state = complete({})
  const exact = simulateBattle(state.preparation.playerHand, state.preparation.opponentHand)
  assert.deepEqual(state.battleResult, exact)
  assert.equal(state.battleResult.rounds.length, 3)
  assert.equal(createStepResponse(state).reward, 1)
  assert.equal(createStepResponse(state, 'opponent').reward, -1)
  assert.equal(getLegalActions(state).length, 0)
  assert.throws(() => stepHeadlessGame(state, 0), /terminal/)
  assert.equal(complete({ battleEvaluation: { maxRounds: 12, damageToWin: 999 } }).battleResult.rounds.length, 12)
  const tieDeck = Array.from({ length: 10 }, () => card('critter1'))
  let tie = createHeadlessGame({ deck: tieDeck, control: 'both' })
  while (!tie.terminal) tie = stepHeadlessGame(tie,
    tie.preparation ? { type: 'finish-preparation' } : { type: 'discard', mask: 0 })
  assert.equal(tie.battleResult.rounds.length, 50)
  assert.equal(createStepResponse(tie).reward, 0)
})

test('numeric combat profiles include shield damage and whole-hand doubling at their actual cadence', () => {
  const deck = ['critter1', 'swarm', 'double_dmg', 'shield2', 'shield_is_dmg',
    'robot1', 'robot1', 'robot1', 'robot1', 'robot1'].map((id) => card(id))
  const observation = encodeObservation(createHeadlessGame({ deck }))
  assert.deepEqual(observation.ownCombat.cycle[0], [3, 2])
  assert.deepEqual(observation.ownCombat.cycle[1], [6, 2])
  assert.deepEqual(observation.ownCombat.cycle[2], [3, 2])
})

test('seeded episodes replay across both modes, pool settings and controlled seats', () => {
  let count = 0
  for (const mode of ['draft', 'five-hand-discard']) {
    for (const control of ['player', 'opponent', 'both']) {
      for (const wildDeck of [false, true]) {
        for (let seed = 1; seed <= 12; seed++) {
          const config = { mode, control, wildDeck, seed, firstPicker: seed % 2 ? 'player' : 'opponent' }
          const rng = createSeededRng(seed + 500)
          let state = createHeadlessGame(config)
          const actions = []
          while (!state.terminal) {
            const legal = getLegalActions(state)
            assert(legal.length > 0 && legal.length <= getHeadlessSpec(config).maxLegalActions)
            const action = legal[Math.floor(rng() * legal.length)]
            actions.push(action)
            state = stepHeadlessGame(state, action)
            assert(actions.length < 500)
          }
          let replay = createHeadlessGame(config)
          for (const action of actions) replay = stepHeadlessGame(replay, action)
          assert.deepEqual(createStepResponse(replay), createStepResponse(state))
          assert.deepEqual(replay.battleResult, state.battleResult)
          assert(state.preparation.playerFinished && state.preparation.opponentFinished)
          assert.deepEqual(state.battleResult, simulateBattle(state.preparation.playerHand,
            state.preparation.opponentHand, { deck: state.preparation.deck }))
          count++
        }
      }
    }
  }
  assert.equal(count, 144)
})

test('sampled worlds reproduce observations throughout both modes, including conditioned private preparation', () => {
  let sampledRoots = 0
  let conditionedRoots = 0
  for (const mode of ['draft', 'five-hand-discard']) {
    for (const revealOpponent of [false, true]) {
      // Keep the coverage floor even when deck changes shorten seeded episodes.
      for (let seed = 1; seed <= 32; seed++) {
        const config = { mode, revealOpponent, control: 'both', seed }
        const spec = getHeadlessSpec(config)
        const rng = createSeededRng(seed + 500)
        let state = createHeadlessGame(config)
        while (!state.terminal) {
          const before = JSON.stringify(state)
          const observation = encodeObservation(state)
          const sample = sampleHeadlessWorld(observation, spec, { seed: seed + 1000 })
          assert.deepEqual(encodeObservation(sample.state, observation.side), observation)
          assert.deepEqual(getLegalActions(sample.state), getLegalActions(state))
          assert.equal(JSON.stringify(state), before)
          if (observation.phase === 'preparation' && observation.side === 'opponent' && observation.steps > 2) conditionedRoots++
          sampledRoots++
          const actions = getLegalActions(state)
          state = stepHeadlessGame(state, actions[Math.floor(rng() * actions.length)])
        }
      }
    }
  }
  assert(sampledRoots >= 800)
  assert(conditionedRoots > 0)
})

test('planning uses only observation/public pool, varies unseen cards and respects physical copies', () => {
  const root = createHeadlessGame({ seed: 6, control: 'both' })
  const spec = getHeadlessSpec()
  const observation = encodeObservation(root)
  const sampled = [100, 200, 300].map((seed) => sampleHeadlessWorld(observation, spec, { seed }).state)
  assert.notDeepEqual(sampled[0].game.deck, sampled[1].game.deck)
  for (const world of sampled) {
    const cards = [...world.game.playerHand, ...world.game.opponentHand, ...world.game.deck]
    assert.equal(cards.length, spec.poolCards.length)
    assert.equal(new Set(cards.map((entry) => entry.uid)).size, cards.length)
    assert.deepEqual(world.game.playerHand.map((entry) => entry.uid), root.game.playerHand.map((entry) => entry.uid))
  }
  const concealedChange = {
    ...root, config: { ...root.config, seed: 123456 },
    game: { ...root.game, deck: [...root.game.deck].reverse(), opponentHand: [...root.game.opponentHand].reverse() },
  }
  assert.deepEqual(encodeObservation(concealedChange), observation)
  const first = evaluateRolloutActions(observation, spec, { samples: 2, seed: 9000 })
  const second = evaluateRolloutActions(encodeObservation(concealedChange), spec, { samples: 2, seed: 9000 })
  assert.deepEqual(second, first)
  const reordered = Object.fromEntries(Object.entries(observation).reverse())
  assert.deepEqual(evaluateRolloutActions(reordered, spec, { samples: 2, seed: 9000 }), first)
  assert.equal(first.candidates.length, 32)
  assert.equal(first.simulations, 64)
  assert(first.candidates.every((candidate) => candidate.wins + candidate.draws + candidate.losses === 2))
})

test('rollout teacher values a winning recycle target above skipping/finishing', () => {
  const ids = ['recycle_card', 'critter1', 'critter1', 'critter1', 'critter1',
    'murder_rabbit', 'swarm', 'critter1', 'critter1', 'critter1', 'critter1']
  const deck = ids.map((id) => card(id))
  const config = { deck, control: 'both', revealOpponent: true }
  let root = createHeadlessGame(config)
  for (const mask of [0, 1, 0, 0]) root = stepHeadlessGame(root, { type: 'discard', mask })
  const before = JSON.stringify(root)
  const evaluation = evaluateRolloutActions(encodeObservation(root), getHeadlessSpec(config), { samples: 4, seed: 11 })
  assert.equal(evaluation.candidates.length, 3)
  assert.equal(evaluation.candidates[0].value, 1)
  assert.equal(evaluation.candidates[1].value, -1)
  assert.equal(evaluation.candidates[2].value, -1)
  assert.deepEqual(evaluation.bestIndices, [0])
  assert.equal(evaluation.baselineValue, 1)
  assert.equal(evaluation.candidates[2].deltaFromBaseline, -2)
  assert.equal(JSON.stringify(root), before)
  assert.throws(() => evaluateRolloutActions(encodeObservation(root), getHeadlessSpec(config), { samples: 1, maxDecisions: 1 }), /guard/)
  assert.throws(() => evaluateRolloutActions(encodeObservation(root), getHeadlessSpec(config), { samples: 0 }), /samples/)
})

test('draft search cannot see the actual next packs or preparation draws', () => {
  const config = { mode: 'draft', control: 'both', seed: 54321, wildDeck: true }
  const root = createHeadlessGame(config)
  const spec = getHeadlessSpec(config)
  const observation = encodeObservation(root)
  const changedFuture = { ...root, config: { ...root.config, seed: 987654 },
    game: { ...root.game, deck: [...root.game.deck].reverse() } }
  assert.deepEqual(encodeObservation(changedFuture), observation)
  const options = { samples: 8, seed: 111222 }
  assert.deepEqual(evaluateRolloutActions(observation, spec, options),
    evaluateRolloutActions(encodeObservation(changedFuture), spec, options))
  const worlds = [1, 2, 3].map((seed) => sampleHeadlessWorld(observation, spec, { seed }).state)
  assert.notDeepEqual(worlds[0].game.deck.slice(0, 5), worlds[1].game.deck.slice(0, 5))
  for (const world of worlds) assert.deepEqual(encodeObservation(world), observation)
  assert.notDeepEqual(root.game.deck.slice(0, 5), worlds[0].game.deck.slice(0, 5))
})

const completeHeuristically = (state) => {
  let current = state
  while (!current.terminal) current = stepHeadlessGame(current, chooseHeadlessBaselineAction(current))
  return current
}
const utilityFor = (side, terminal) => terminal.battleResult.winner === 'tie' ? 0
  : (terminal.battleResult.winner === side ? 1 : -1)

test('preparation afterstate features match real deterministic transitions, never resolve draws', () => {
  const multiset = (cards) => cards.map((entry) => entry.id ?? entry).sort()
  let checked = 0
  for (let seed = 0; seed < 60; seed++) {
    let state = createHeadlessGame({ mode: 'draft', control: 'both', seed: 900000 + seed, wildDeck: true })
    while (!state.terminal) {
      if (state.preparation) {
        const side = state.actor
        const legal = getLegalActions(state)
        const described = describePreparationActions(encodeObservation(state, side), legal)
        assert.equal(described.length, legal.length)
        legal.forEach((action, index) => {
          const next = stepHeadlessGame(state, action)
          const after = next.preparation[`${side}Hand`]
          const info = described[index]
          if (info.pendingDraws === 0) {
            assert.deepEqual(multiset(info.handIds), multiset(after))
            assert.deepEqual(multiset(info.pileIds), multiset(next.preparation[`${side}Discard`]))
          } else {
            assert.ok(after.length <= info.handIds.length + info.pendingDraws)
          }
          checked++
        })
      }
      state = stepHeadlessGame(state, chooseHeadlessBaselineAction(state))
    }
  }
  assert.ok(checked > 100, `only ${checked} preparation actions checked`)
})

test('prep-lookahead completion never does worse than the heuristic inside a full-information world', () => {
  let compared = 0
  let improved = 0
  for (let seed = 0; seed < 80; seed++) {
    let state = createHeadlessGame({ mode: 'draft', control: 'both', seed: 910000 + seed, wildDeck: true })
    while (!state.terminal) {
      if (state.preparation && getLegalActions(state).length > 1) {
        const side = state.actor
        const look = choosePrepLookaheadAction(state)
        assert.ok(getLegalActions(state).some((action) => JSON.stringify(action) === JSON.stringify(look)))
        const a = utilityFor(side, completeHeuristically(stepHeadlessGame(state, look)))
        const b = utilityFor(side, completeHeuristically(stepHeadlessGame(state, chooseHeadlessBaselineAction(state))))
        assert.ok(a >= b, `lookahead ${a} < heuristic ${b}`)
        compared++
        if (a > b) improved++
      }
      state = stepHeadlessGame(state, chooseHeadlessBaselineAction(state))
    }
  }
  assert.ok(compared > 50 && improved > 0, `compared ${compared}, improved ${improved}`)
})
