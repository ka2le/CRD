import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createDraftGame, applyDraftPick, resolveOpponentDraftPick, commitDraftDiscard, revealNextDraftPack, applyHiddenDraftDiscard } from '../src/game/draftMode.js'
import { createHeadlessGame, getHeadlessSpec, getLegalActions, stepHeadlessGame, chooseHeadlessBaselineAction, encodeObservation } from '../src/game/headlessGame.js'
import { getCoreCards } from '../src/game/cards.js'
import { createPreparationState, getPreparationActions, applyPreparationAction } from '../src/game/preparationState.js'
import { searchDecision, preparationView, searchPreparationDecision } from '../src/game/searchAi.js'
import { getOpponentAiOptions, normalizeOpponentSettings } from '../src/game/opponentAi.js'

test('only Regular NC six-draft deals the two stat swaps and reports the same physical catalog', () => {
  const counts = cards => Object.fromEntries([...new Set(cards.map(c => c.id))].map(id => [id, cards.filter(c => c.id === id).length]))
  for (const tabletop of [false, 'threshold', 'abilities-main', 'abilities-new-cards', 'monsters']) {
    for (const wildDeck of [false, true]) {
      const options = { tabletop, wildDeck, seed: 37 }
      const normal = getHeadlessSpec({ ...options, mode: 'draft' })
      const expected = counts(normal.poolCards)
      assert.deepEqual(getHeadlessSpec({ ...options, mode: 'five-hand-discard' }).poolCards, normal.poolCards)
      const six = getHeadlessSpec({ ...options, mode: '6draft' })
      if (tabletop === 'abilities-new-cards' && !wildDeck) {
        assert.deepEqual([expected.dragon1, expected.robot1, expected.rabbit2, expected.dragon2], [5, 8, 2, 1])
        Object.assign(expected, { dragon1: 4, robot1: 9, rabbit2: 3 })
        delete expected.dragon2
        assert.equal(six.poolCards.length, 73)
        assert.equal(expected.devour, 1)
        assert.equal(expected.dragon_ulti, 1)
      }
      const game = createDraftGame({ ...options, mode: '6draft' })
      assert.deepEqual(counts([...game.draftRow, ...game.deck]), expected)
      assert.deepEqual(counts(six.poolCards), expected)
    }
  }
})

export function draftFixture(options = {}) {
  let game = createDraftGame({ mode: '6draft', tabletop: 'abilities-new-cards', seed: 71, ...options })
  const turns = []
  while (game.phase !== 'draft-hidden-discard') {
    if (game.phase === 'draft-player-pick') {
      turns.push([game.packNumber, 'player'])
      game = applyDraftPick(game, game.draftRow[0].uid)
    } else if (game.phase === 'draft-opponent-thinking') {
      turns.push([game.packNumber, 'opponent'])
      game = resolveOpponentDraftPick({ ...game, pendingOpponentPickUid: game.draftRow[0].uid })
    } else if (game.phase === 'draft-pack-clearing') game = commitDraftDiscard(game)
    else game = revealNextDraftPack(game)
    assert(turns.length <= 12)
  }
  return { game, turns }
}

test('six alternating packs, hidden one-card discard, five-card prep across all pools and battle rules', () => {
  for (const tabletop of [false, 'threshold', 'abilities-main', 'abilities-new-cards', 'monsters']) {
    for (const wildDeck of [false, true]) for (const firstPicker of ['player', 'opponent']) {
      const fixture = draftFixture({ tabletop, wildDeck, firstPicker })
      let { game } = fixture
      assert.equal(game.playerHand.length, 6)
      assert.equal(game.opponentHand.length, 6)
      assert.equal(game.packNumber, 6)
      assert.equal(game.draftDiscard.length, 6 * ((game.packSize ?? 5) - 2))
      for (let i = 0; i < 12; i += 2) {
        const first = (i / 2) % 2 ? (firstPicker === 'player' ? 'opponent' : 'player') : firstPicker
        assert.deepEqual(fixture.turns.slice(i, i + 2), [[i / 2 + 1, first], [i / 2 + 1, first === 'player' ? 'opponent' : 'player']])
      }
      const originalPile = game.draftDiscard.map(card => card.uid)
      const originalDeck = game.deck.map(card => card.uid)
      const removed = [game.playerHand[0].uid, game.opponentHand[0].uid]
      assert.equal(applyHiddenDraftDiscard(game, 'player', 'invalid'), game)
      game = applyHiddenDraftDiscard(game, 'opponent', removed[1])
      assert.equal(game.phase, 'draft-hidden-discard', 'both discards must lock before prep')
      assert.equal(applyHiddenDraftDiscard(game, 'opponent', game.opponentHand[0].uid), game)
      game = applyHiddenDraftDiscard(JSON.parse(JSON.stringify(game)), 'player', removed[0])
      assert.equal(game.phase, 'battle-ready')
      assert.equal(game.playerHand.length, 5)
      assert.equal(game.opponentHand.length, 5)
      assert.deepEqual(game.draftDiscard.map(card => card.uid), originalPile)
      assert.deepEqual(game.deck.map(card => card.uid), originalDeck)
      const physical = [...game.playerHand, ...game.opponentHand, ...game.deck, ...game.draftDiscard, ...game.playerHiddenDiscard, ...game.opponentHiddenDiscard]
      assert.equal(new Set(physical.map(card => card.uid)).size, physical.length)
      const prep = createPreparationState(game)
      for (const side of ['player', 'opponent']) {
        assert.equal(prep[`${side}Hand`].length, 5)
        assert(!prep[`${side}Discard`].some(card => removed.includes(card.uid)))
        assert(!getPreparationActions(prep, side).some(action => removed.includes(action.targetUid)))
      }
    }
  }
})

test('headless legal actions enforce exactly one private discard and retain all public picks for guesswork', () => {
  let state = createHeadlessGame({ mode: '6draft', tabletop: 'abilities-new-cards', seed: 41, control: 'both', revealOpponent: true })
  while (state.game.phase !== 'draft-hidden-discard') state = stepHeadlessGame(state, chooseHeadlessBaselineAction(state))
  assert.equal(getLegalActions(state).length, 6)
  assert.throws(() => stepHeadlessGame(state, { type: 'discard', selectedIds: [] }), /Illegal/)
  assert.throws(() => stepHeadlessGame(state, { type: 'discard', selectedIds: state.game.playerHand.slice(0, 2).map(card => card.uid) }), /Illegal/)
  const uid = state.game.playerHand[0].uid
  state = stepHeadlessGame(state, { type: 'discard', selectedIds: [uid] })
  const enemyView = encodeObservation(state, 'opponent')
  assert.deepEqual(enemyView.opponentHand, [])
  assert.equal(enemyView.opponentDraftedHand.length, 6)
  assert(!enemyView.history.some(event => event.type === 'discard'))
  state = stepHeadlessGame(state, getLegalActions(state)[0])
  assert.equal(state.preparation.playerHand.length, 5)
  const prepView = encodeObservation(state, 'opponent')
  assert.deepEqual(prepView.opponentHand, [])
  while (!state.terminal) state = stepHeadlessGame(state, chooseHeadlessBaselineAction(state))
  assert.equal(encodeObservation(state, 'opponent').hiddenDiscard.length, 2)
})

test('custom minimum-size Monster recipes retain six-card packs and report five-card post-discard hands', () => {
  const monsterDeck = Object.fromEntries(getCoreCards({ tabletop: 'monsters', includeDisabled: true }).map(card => [card.id, 0]))
  Object.assign(monsterDeck, { critter1: 18, robot_attack: 18 })
  const options = { mode: '6draft', tabletop: 'monsters', monsterDeck, seed: 73 }
  const spec = getHeadlessSpec(options)
  assert.equal(spec.handSize, 5)
  assert.equal(spec.draftPicks, 6)
  assert.equal(spec.packSize, 6)
  const { game } = draftFixture(options)
  assert.equal(game.deck.length, 0)
  assert.equal(game.draftDiscard.length, 24)
  assert([...game.playerHand, ...game.opponentHand, ...game.draftDiscard].every(card => ['critter1', 'robot_attack'].includes(card.id)))
})

test('Sven searches actual sixth picks and hidden discard actions without reading the rival choice', () => {
  const { game } = draftFixture()
  const opts = { seed: 19, minSamples: 2, maxSamples: 2, timeBudgetMs: 0, rollout: 'rules' }
  const a = applyHiddenDraftDiscard(game, 'player', game.playerHand[0].uid)
  const b = applyHiddenDraftDiscard(game, 'player', game.playerHand[1].uid)
  const first = searchDecision(a, 'opponent', opts)
  const second = searchDecision(b, 'opponent', opts)
  assert.equal(first.action.selectedIds.length, 1)
  assert.deepEqual(first.values, second.values)
  assert.deepEqual(first.action, second.action)
  let state = createHeadlessGame({ mode: '6draft', tabletop: 'abilities-new-cards', seed: 1, control: 'both' })
  while (state.game.packNumber < 6) state = stepHeadlessGame(state, chooseHeadlessBaselineAction(state))
  const lastPick = searchDecision(state.game, state.actor, opts)
  assert.equal(lastPick.action.type, 'draft-pick')
})

test('private preparation samples five from the public six; set-aside cards never return as draws or Recycle', () => {
  const { game } = draftFixture()
  const enemyDiscard = game.playerHand[0].uid
  const ownDiscard = game.opponentHand[0].uid
  const a = applyHiddenDraftDiscard(applyHiddenDraftDiscard(game, 'player', enemyDiscard), 'opponent', ownDiscard)
  const b = applyHiddenDraftDiscard(applyHiddenDraftDiscard(game, 'player', game.playerHand[1].uid), 'opponent', ownDiscard)
  const prepA = createPreparationState(a), prepB = createPreparationState(b)
  assert.deepEqual(preparationView(prepA, a), preparationView(prepB, b))
  const view = preparationView(prepA, a)
  assert.equal(view.enemyPublicHand, null)
  assert.equal(view.enemyDraftedHand.length, 6)
  assert(!view.unseen.some(card => card.uid === ownDiscard || view.enemyDraftedHand.some(c => c.uid === card.uid)))
  const options = { seed: 17, minSamples: 2, maxSamples: 2, timeBudgetMs: 0, rollout: 'rules' }
  assert.deepEqual(searchPreparationDecision(prepA, a, 'opponent', options).values,
    searchPreparationDecision(prepB, b, 'opponent', options).values)
  // Exercise real draw and Recycle effects with a known physical deck.
  const pool = [...game.playerHand, ...game.opponentHand, ...game.draftDiscard, ...game.deck]
  const draw = pool.find(card => card.id === 'draw_2_extra'), recycle = pool.find(card => card.id === 'recycle_card')
  const controlled = createPreparationState({ ...a, playerHand: [draw, recycle, ...a.playerHand.filter(c => ![draw.uid, recycle.uid].includes(c.uid)).slice(0, 3)],
    deck: a.deck.filter(c => c.uid !== draw.uid && c.uid !== recycle.uid) })
  let prep = applyPreparationAction(controlled, 'player', { type: 'prepare', sourceUid: draw.uid, cardId: draw.id })
  assert.equal(prep.playerHand.length, 7)
  assert(!getPreparationActions(prep).some(action => [enemyDiscard, ownDiscard].includes(action.targetUid)))
})

test('six-draft supports Felix in Regular NC and preserves existing compatibility elsewhere', () => {
  for (const tabletop of [false, 'abilities-main', 'abilities-new-cards', 'monsters']) {
    assert.deepEqual(getOpponentAiOptions('6draft', tabletop).map(option => option.id), tabletop === 'abilities-new-cards' ? ['rules', 'search', 'felix'] : ['rules', 'search'])
    for (const opponentAi of ['rules', 'search', 'local', 'felix', 'dan', 'david', 'shallow']) {
      const settings = normalizeOpponentSettings({ gameMode: 'draft', tabletop, opponentAi }, { gameMode: '6draft' })
      assert(['rules', 'search', 'local', ...(tabletop === 'abilities-new-cards' ? ['felix'] : [])].includes(settings.opponentAi))
    }
  }
})

let vite, session, rooms, local
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  session = await vite.ssrLoadModule('/src/hooks/useGameSession.js')
  rooms = await vite.ssrLoadModule('/src/network/roomGame.js')
  local = await vite.ssrLoadModule('/src/game/localMultiplayer.js')
})
after(async () => { await vite?.close() })

function sessionFixture(game, opponentAi = 'rules') {
  return { game, gameMode: '6draft', settings: session.normalizePlaySettings({ gameMode: '6draft', tabletop: 'abilities-new-cards', opponentAi }),
    preBattle: createPreparationState(game), selectedIds: [], otherSelectedIds: [], battleStarted: false, battleInstance: 0,
    nextDraftStartingPicker: 'player', gameSessionKey: 0, dealId: 1, suppressedHandCardIds: { player: [], opponent: [] } }
}

test('solo reducer locks one card, blocks early prep, accepts asynchronous bot choice and resets to 6draft', () => {
  let state = sessionFixture(draftFixture().game)
  const before = state
  assert.equal(session.sessionReducer(state, { type: 'SUBMIT_DISCARD' }), state)
  state = session.sessionReducer(state, { type: 'TOGGLE_SELECTED', uid: state.game.playerHand[0].uid })
  state = session.sessionReducer(state, { type: 'TOGGLE_SELECTED', uid: state.game.playerHand[1].uid })
  assert.equal(state.selectedIds.length, 1)
  state = session.sessionReducer(state, { type: 'SUBMIT_DISCARD' })
  assert.equal(state.game.phase, 'draft-hidden-discard')
  assert.equal(session.sessionReducer(state, { type: 'START_BATTLE' }), state)
  state = session.sessionReducer(state, { type: 'APPLY_OPPONENT_DISCARD', selectedIds: [state.game.opponentHand[0].uid], decisionKey: '1:hidden-discard' })
  assert.equal(state.game.phase, 'battle-ready')
  assert.equal(state.preBattle.playerHand.length, 5)
  assert.equal(state.preBattle.opponentHand.length, 5)
  const reset = session.sessionReducer(state, { type: 'RESET_GAME' })
  assert.equal(reset.game.mode, '6draft')
  assert.equal(reset.game.phase, 'draft-player-pick')
  assert.equal(before.game.playerHand.length, 6)
})

test('rooms accept either discard order; seat views and same-screen handoffs keep choices private', () => {
  for (const order of [['host', 'guest'], ['guest', 'host']]) {
    let state = sessionFixture(draftFixture().game)
    for (const seat of order) {
      const view = rooms.seatView(state, seat)
      state = rooms.applyRoomAction(state, seat, { type: 'TOGGLE_SELECTED', uid: view.game.playerHand[0].uid })
      state = rooms.applyRoomAction(state, seat, { type: 'SUBMIT_DISCARD' })
    }
    assert.equal(state.game.phase, 'battle-ready')
    assert.equal(state.preBattle.playerHand.length, 5)
    assert.equal(state.preBattle.opponentHand.length, 5)
  }
  let state = local.initializeLocalMultiplayer(sessionFixture(draftFixture().game, 'local'))
  assert(state.localPlay.handoff)
  for (let i = 0; i < 2; i++) {
    state = session.localSessionReducer(state, { type: 'LOCAL_REVEAL' })
    const view = local.localMultiplayerView(state)
    state = session.localSessionReducer(state, { type: 'TOGGLE_SELECTED', uid: view.game.playerHand[0].uid })
    state = session.localSessionReducer(state, { type: 'SUBMIT_DISCARD' })
    assert(state.localPlay.handoff, 'hide before passing device')
  }
  assert.equal(state.game.phase, 'battle-ready')
})
