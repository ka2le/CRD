import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'vite'
import { getCoreCards, createSeededRng } from '../src/game/cards.js'
import { completeOpponentPreBattle } from '../src/game/preBattle.js'
import { createPreparationState, getPreparationActions, applyPreparationAction } from '../src/game/preparationState.js'
import { createFiveHandDiscardGame, applyDiscardPhase } from '../src/game/fiveHandDiscard.js'
import {
  createHeadlessGame, stepHeadlessGame, getLegalActions, encodeObservation, createStepResponse, getHeadlessSpec,
} from '../src/game/headlessGame.js'
import { simulateBattle } from '../src/game/engine.js'

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
