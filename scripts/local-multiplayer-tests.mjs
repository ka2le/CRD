import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createDraftGame } from '../src/game/draftMode.js'
import { createFiveHandDiscardGame } from '../src/game/fiveHandDiscard.js'
import { getExpandedCoreDeck } from '../src/game/cards.js'
import { createPreparationState } from '../src/game/preparationState.js'
import { getCardTabletopTypes, getTabletopChoice } from '../src/game/tabletop.js'
import { compatibleGameVersion } from '../src/network/gameCompatibility.js'

let vite, api, reduce, normalize
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  api = await vite.ssrLoadModule('/src/game/localMultiplayer.js')
  const hook = await vite.ssrLoadModule('/src/hooks/useGameSession.js')
  reduce = hook.localSessionReducer
  normalize = hook.normalizePlaySettings
})
after(async () => { await vite?.close() })

function initial(mode = 'draft', seed = 1, firstPicker = 'player') {
  const game = mode === 'draft' ? createDraftGame({ seed, firstPicker, tabletop: 'abilities-new-cards' })
    : createFiveHandDiscardGame({ seed, tabletop: 'abilities-new-cards' })
  return api.initializeLocalMultiplayer({ settings: normalize({ gameMode: mode, opponentAi: 'local' }),
    gameMode: mode, game, preBattle: createPreparationState(game), nextDraftStartingPicker: 'player',
    selectedIds: [], battleStarted: false, battleInstance: 0, gameSessionKey: 0, dealId: 1,
    suppressedHandCardIds: { player: [], opponent: [] } })
}
const reveal = (s) => reduce(s, { type: 'LOCAL_REVEAL' })

function finishPreparation(state) {
  let next = reveal(state)
  const view = api.localMultiplayerView(next)
  next = reduce(next, { type: 'START_BATTLE' })
  const choice = getTabletopChoice(view.preBattle)
  if (choice.needsChoice) {
    const card = view.preBattle.playerHand.find((c) => getCardTabletopTypes(c, choice).length)
    next = reduce(next, { type: 'CHOOSE_TABLETOP_TYPE', uid: card.uid, damageType: getCardTabletopTypes(card, choice)[0] })
    assert.equal(next.battleStarted, false, 'faction remains private until explicitly ready')
    next = reduce(next, { type: 'START_BATTLE' })
  }
  return next
}

test('same-screen selection survives mode changes, reload and names without redealing', () => {
  assert(compatibleGameVersion('63f6f86971550562', 'new-presentation-build'))
  assert(compatibleGameVersion('52b42449457db8ef', 'new-presentation-build'))
  assert(compatibleGameVersion('63f6f86971550562:rooms-2', 'new-presentation-build:rooms-2'))
  assert(!compatibleGameVersion('unrelated-rules', 'new-presentation-build'))
  let state = initial()
  const game = state.game
  state = reduce(state, { type: 'LOCAL_RENAME', seat: 'host', name: 'Alex' })
  state = reduce(state, { type: 'LOCAL_RENAME', seat: 'guest', name: 'Sam' })
  assert.strictEqual(state.game, game)
  assert.equal(api.localPlayerName(state, 'host'), 'Alex')
  state = reveal(state)
  state = reduce(state, { type: 'LOCAL_SHOW_ALL' })
  state = api.initializeLocalMultiplayer(JSON.parse(JSON.stringify(state)), true)
  assert.equal(state.localPlay.handoff, false, 'public draft resumes without a reveal step')
  assert.equal(state.localPlay.showAll, false)
  assert.equal(api.localPlayerName(state, 'guest'), 'Sam')
  state = reduce(state, { type: 'UPDATE_SETTINGS', patch: { gameMode: 'five-hand-discard' } })
  assert.equal(state.settings.opponentAi, 'local')
  assert.equal(state.localPlay.handoff, true)
  const openHands = reduce(state, { type: 'LOCAL_SHOW_ALL' })
  assert.equal(reduce(openHands, { type: 'SUBMIT_DISCARD' }).localPlay.handoff, false,
    'open hands continue without private handoffs')
  state = reduce(state, { type: 'UPDATE_SETTINGS', patch: { opponentAi: 'shallow' } })
  assert.equal(state.localPlay, null)
})

test('both seats draft continuously without a blocking handoff, then enter private preparation', () => {
  for (const firstPicker of ['player', 'opponent']) for (let seed = 1; seed <= 8; seed++) {
    let state = initial('draft', seed, firstPicker)
    for (let pick = 0; pick < 10; pick++) {
      assert.equal(state.localPlay.handoff, false)
      const seat = state.localPlay.seat
      const view = api.localMultiplayerView(state)
      assert.equal(api.getLocalDisplaySeat(state), 'host')
      assert.strictEqual(view.game.playerHand, state.game.playerHand, 'P1 stays at the bottom on both turns')
      assert.strictEqual(view.game.opponentHand, state.game.opponentHand, 'P2 stays at the top on both turns')
      assert.equal(view.game.currentPicker, seat === 'host' ? 'player' : 'opponent')
      const card = state.game.draftRow.at(-1)
      state = reduce(state, { type: 'PLAYER_DRAFT_PICK', uid: card.uid })
      assert((seat === 'host' ? state.game.playerHand : state.game.opponentHand).some((c) => c.uid === card.uid))
      if (state.localPlay.handoff) assert.strictEqual(reduce(state, { type: 'PLAYER_DRAFT_PICK', uid: state.game.draftRow[0]?.uid }), state)
      assert.equal(state.game.pendingOpponentPickUid, null)
    }
    assert.equal(state.game.phase, 'battle-ready')
    assert.equal(state.game.playerHand.length, 5)
    assert.equal(state.game.opponentHand.length, 5)
    if (!state.battleStarted) assert(state.localPlay.handoff)
    for (let ready = 0; !state.battleStarted && ready < 2; ready++) state = finishPreparation(state)
    assert(state.battleStarted)
  }
})

test('private discard choices wait for both seats and consume each replacement once', () => {
  let state = initial('five-hand-discard')
  for (let pass = 0; pass < 2; pass++) {
    const before = state.game
    for (let turn = 0; turn < 2; turn++) {
      state = reveal(state)
      const holder = state.localPlay.seat
      const view = api.localMultiplayerView(state)
      state = reduce(state, { type: 'TOGGLE_SELECTED', uid: view.game.playerHand[0].uid })
      state = reduce(state, { type: 'SUBMIT_DISCARD' })
      assert.equal(state.localPlay.handoff, !state.battleStarted && state.localPlay.seat !== holder)
      if (!turn) {
        assert.strictEqual(state.game, before)
        assert.equal(state.game.deck.length, before.deck.length)
      }
    }
    assert.equal(state.game.deck.length, before.deck.length - 2)
    assert.equal(state.game.playerDiscardsUsed, pass + 1)
    assert.equal(state.game.opponentDiscardsUsed, pass + 1)
  }
  assert.equal(state.game.phase, 'battle-ready')
  const cards = [...state.game.deck, ...state.game.playerHand, ...state.game.opponentHand]
  assert.equal(new Set(cards.map((c) => c.uid)).size, cards.length)
  for (let ready = 0; !state.battleStarted && ready < 2; ready++) state = finishPreparation(state)
  assert(state.battleStarted)
})

test('snake discard keeps the same holder visible through the next pass and into preparation', () => {
  const cards = getExpandedCoreDeck({ tabletop: 'abilities-new-cards' })
  const playerHand = cards.filter((c) => c.id === 'critter1').slice(0, 5)
  const opponentHand = cards.filter((c) => c.id === 'robot1').slice(0, 5)
  assert.equal(playerHand.length, 5)
  assert.equal(opponentHand.length, 5)
  const inHand = new Set([...playerHand, ...opponentHand].map((c) => c.uid))
  let state = initial('five-hand-discard')
  const game = { ...state.game, playerHand, opponentHand, deck: cards.filter((c) => !inHand.has(c.uid)) }
  state = api.initializeLocalMultiplayer({ ...state, game, preBattle: createPreparationState(game), localPlay: null })
  const holders = []
  for (const [seat, handoff, pass] of [['host', true, 1], ['guest', true, 1], ['guest', false, 2], ['host', true, 2]]) {
    assert.equal(state.localPlay.seat, seat)
    assert.equal(state.localPlay.handoff, handoff)
    const view = api.localMultiplayerView(state)
    assert.equal(view.game.playerDiscardsUsed + 1, pass)
    if (handoff) state = reveal(state)
    holders.push(seat)
    state = reduce(state, { type: 'SUBMIT_DISCARD' })
  }
  assert.equal(state.game.phase, 'battle-ready')
  assert.equal(state.localPlay.seat, 'host')
  assert.equal(state.localPlay.handoff, false, 'P1 keeps their visible hand from discard 2 into prep')
  holders.push(state.localPlay.seat)
  state = finishPreparation(state)
  assert.equal(state.localPlay.seat, 'guest')
  assert.equal(state.localPlay.handoff, true, 'P2 preparation requires the device to change hands')
  holders.push(state.localPlay.seat)
  state = finishPreparation(state)
  assert(state.battleStarted)
  assert.deepEqual(holders, ['host', 'guest', 'guest', 'host', 'host', 'guest'])
})

test('reload during preparation does not confirm a private faction choice', () => {
  let state = initial('five-hand-discard', 22)
  for (let turn = 0; turn < 4; turn++) state = reduce(reveal(state), { type: 'SUBMIT_DISCARD' })
  assert.equal(state.battleStarted, false)
  state = reveal(state)
  state = reduce(state, { type: 'START_BATTLE' })
  const view = api.localMultiplayerView(state)
  const choice = getTabletopChoice(view.preBattle)
  if (choice.needsChoice) {
    const card = view.preBattle.playerHand.find((c) => getCardTabletopTypes(c, choice).length)
    state = reduce(state, { type: 'CHOOSE_TABLETOP_TYPE', uid: card.uid, damageType: getCardTabletopTypes(card, choice)[0] })
  }
  const seat = state.localPlay.seat
  state = api.initializeLocalMultiplayer(JSON.parse(JSON.stringify(state)), true)
  assert.equal(state.localPlay.seat, seat)
  assert.equal(state.localPlay.handoff, true)
  assert.equal(api.localMultiplayerView(state).preBattle.playerFinished, false)
  assert.equal(state.battleStarted, false)
})

test('both humans prepare in sequence and a mandatory guest discard survives reload', () => {
  const cards = getExpandedCoreDeck({ tabletop: 'abilities-new-cards' })
  const used = new Set()
  const take = (id) => {
    const card = cards.find((c) => c.id === id && !used.has(c.uid))
    assert(card, id)
    used.add(card.uid)
    return card
  }
  const host = ['draw_2_extra', 'critter1', 'critter1', 'critter1', 'swarm'].map(take)
  const guest = ['draw_2_discard_2', 'robot1', 'robot_attack', 'dragon1', 'dragons_breath'].map(take)
  let state = initial()
  const game = { ...state.game, phase: 'battle-ready', currentPicker: null, playerHand: host, opponentHand: guest,
    deck: cards.filter((c) => !used.has(c.uid)) }
  state = reveal(api.initializeLocalMultiplayer({ ...state, game, preBattle: createPreparationState(game), localPlay: null }))
  state = reduce(state, { type: 'ACTIVATE_PLAYER_PRE_BATTLE_CARD', uid: host[0].uid })
  assert.equal(state.preBattle.playerHand.length, 7)
  assert.equal(state.localPlay.seat, 'host')
  state = finishPreparation(state)
  assert.equal(state.localPlay.seat, 'guest')
  assert(state.localPlay.handoff)
  assert.equal(state.battleStarted, false)
  const lockedHostHand = state.preBattle.playerHand
  state = reduce(reveal(state), { type: 'ACTIVATE_PLAYER_PRE_BATTLE_CARD', uid: guest[0].uid })
  assert.equal(state.preBattle.opponentPendingDiscard.remaining, 2)
  assert.throws(() => reduce(state, { type: 'START_BATTLE' }), /Finish discarding/)
  state = reveal(api.initializeLocalMultiplayer(JSON.parse(JSON.stringify(state)), true))
  const ownHand = api.localMultiplayerView(state).preBattle.playerHand
  for (const card of ownHand.slice(0, 2)) state = reduce(state, { type: 'TOGGLE_PREPARATION_DISCARD', uid: card.uid })
  state = reduce(state, { type: 'SUBMIT_PREPARATION_DISCARD' })
  assert.equal(state.preBattle.opponentPendingDiscard, null)
  assert.deepEqual(state.preBattle.playerHand, lockedHostHand)
  state = finishPreparation(state)
  assert(state.battleStarted)
  assert.equal(state.preBattle.opponentHand.length, 5)
})

test('forced preparation starts battle directly; one real decision requires only that player', () => {
  const cards = getExpandedCoreDeck({ tabletop: 'abilities-new-cards' })
  const forced = cards.filter((c) => c.id === 'critter1').slice(0, 5)
  forced[4] = cards.find((c) => c.id === 'swarm')
  assert.equal(forced.length, 5)
  // Zero typed damage permits all factions, including the Critter tiebreak.
  const mixed = cards.filter((c) => c.id === 'critter1').slice(0, 5)
  for (const decisionSeat of [null, 'host', 'guest']) {
    let state = initial()
    const game = { ...state.game, phase: 'battle-ready', currentPicker: null,
      playerHand: decisionSeat === 'host' ? mixed : forced,
      opponentHand: decisionSeat === 'guest' ? mixed : forced }
    state = api.initializeLocalMultiplayer({ ...state, game, preBattle: createPreparationState(game), localPlay: null })
    if (!decisionSeat) assert(state.battleStarted)
    else {
      assert.equal(state.localPlay.seat, decisionSeat)
      assert.equal(state.battleStarted, false)
      state = finishPreparation(state)
      assert(state.battleStarted)
    }
  }
})
