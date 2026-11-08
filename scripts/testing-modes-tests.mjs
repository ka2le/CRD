import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createDraftGame, applyDraftPick, resolveOpponentDraftPick, commitDraftDiscard, revealNextDraftPack } from '../src/game/draftMode.js'
import { createTwentyCardsGame, placeLineupCard, lockLineup, chooseBotLineup, twentyCardsScore } from '../src/game/twentyCards.js'
import { createPreparationState, applyPreparationAction, getPreparationActions } from '../src/game/preparationState.js'
import { getExpandedCoreDeck } from '../src/game/cards.js'
import { simulateBattle } from '../src/game/engine.js'
import { getTabletopChoice, resolveTabletopBattle } from '../src/game/tabletop.js'

let vite, api, local, rooms
before(async () => {
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  api = await vite.ssrLoadModule('/src/hooks/useGameSession.js')
  local = await vite.ssrLoadModule('/src/game/localMultiplayer.js')
  rooms = await vite.ssrLoadModule('/src/network/roomGame.js')
})
after(async () => { await vite?.close() })
function session(game, opponentAi = 'rules') {
  return { game, preBattle: createPreparationState(game), gameMode: game.mode,
    settings: { gameMode: game.mode, testing: true, tabletop: 'abilities-new-cards', opponentAi },
    selectedIds: [], battleStarted: false, battleInstance: 0, gameSessionKey: 0, dealId: 1,
    nextDraftStartingPicker: 'player', suppressedHandCardIds: { player: [], opponent: [] } }
}

test('secret opening gives disjoint private packs, one secret each, then full alternating draft', () => {
  for (const tabletop of [false, 'abilities-new-cards', 'monsters']) for (const firstPicker of ['player', 'opponent']) {
    let game = createDraftGame({ tabletop, firstPicker, seed: 91, secretCard: true })
    const deckSize = game.deck.length + 10
    const playerPack = game.playerSecretPack.map(card => card.uid)
    const opponentPack = game.opponentSecretPack.map(card => card.uid)
    assert.equal(playerPack.length, 5); assert.equal(opponentPack.length, 5)
    assert.equal(new Set([...playerPack, ...opponentPack]).size, 10)
    game = applyDraftPick(game, playerPack[0])
    assert.equal(game.playerHand[0].secret, true)
    assert.equal(game.draftDiscard.length, 0, 'do not reveal leftovers before both picks')
    assert.deepEqual(game.playerSecretPack.map(card => card.uid), playerPack.slice(1))
    assert.deepEqual(game.draftRow.map(card => card.uid), opponentPack)
    game = JSON.parse(JSON.stringify(game)) // A refresh between private picks preserves leftovers.
    game = resolveOpponentDraftPick(game)
    assert.equal(game.opponentHand[0].secret, true)
    assert.equal(game.phase, 'draft-pack-dealing')
    const secretIds = [game.playerHand[0].uid, game.opponentHand[0].uid]
    const openingDiscards = [...playerPack, ...opponentPack].filter(uid => !secretIds.includes(uid))
    assert.deepEqual(game.draftDiscard.map(card => card.uid), openingDiscards)
    assert.equal(game.draftDiscard.length, 8)
    assert.equal(new Set(game.draftDiscard.map(card => card.uid)).size, 8)
    assert.equal(game.playerSecretPack.length + game.opponentSecretPack.length, 0)
    game = revealNextDraftPack(game)
    assert.equal(game.firstPicker, firstPicker === 'player' ? 'opponent' : 'player')
    for (let actions = 0; game.phase !== 'battle-ready' && actions < 70; actions += 1) {
      if (game.phase === 'draft-player-pick') game = applyDraftPick(game, game.draftRow[0].uid)
      else if (game.phase === 'draft-opponent-thinking') game = resolveOpponentDraftPick(game)
      else if (game.phase === 'draft-pack-clearing') game = commitDraftDiscard(game)
      else game = revealNextDraftPack(game)
    }
    assert.equal(game.phase, 'battle-ready')
    assert.equal(game.playerHand.length, tabletop === 'monsters' ? 6 : 5)
    assert.equal(game.opponentHand.length, game.playerHand.length)
    assert.deepEqual([game.playerHand[0].uid, game.opponentHand[0].uid], secretIds)
    assert.deepEqual(game.draftDiscard.slice(0, 8).map(card => card.uid), openingDiscards)
    assert.equal(game.draftDiscard.some(card => secretIds.includes(card.uid)), false)
    const all = [...game.playerHand, ...game.opponentHand, ...game.draftDiscard, ...game.deck]
    assert.equal(all.length, deckSize)
    assert.equal(new Set(all.map(card => card.uid)).size, all.length)
  }
})

test('both players can Recycle either secret opening pack’s unpicked cards', () => {
  let game = createDraftGame({ tabletop: 'abilities-new-cards', seed: 91, secretCard: true })
  const playerTarget = game.playerSecretPack[1].uid
  const opponentTarget = game.opponentSecretPack[1].uid
  game = applyDraftPick(game, game.draftRow[0].uid)
  game = resolveOpponentDraftPick({ ...game, pendingOpponentPickUid: game.draftRow[0].uid })
  const source = getExpandedCoreDeck({ tabletop: 'abilities-new-cards' }).find(card => card.id === 'recycle_card')
  for (const [side, targetUid] of [['player', opponentTarget], ['opponent', playerTarget]]) {
    let prep = createPreparationState({ ...game, [`${side}Hand`]: [source] })
    assert(getPreparationActions(prep, side).some(action => action.type === 'prepare' && action.targetUid === targetUid))
    prep = applyPreparationAction(prep, side, { type: 'prepare', sourceUid: source.uid, targetUid })
    assert(prep[`${side}Hand`].some(card => card.uid === targetUid))
    assert(!prep[`${side}Discard`].some(card => card.uid === targetUid))
  }
})

test('20Cards deals 20 each, moves and swaps unique cards, rejects invalid placements and premature locks', () => {
  let game = createTwentyCardsGame({ tabletop: 'abilities-new-cards', seed: 88 })
  assert.equal(game.playerPool.length, 20); assert.equal(game.opponentPool.length, 20)
  assert.equal(new Set([...game.playerPool, ...game.opponentPool, ...game.deck].map(card => card.uid)).size, 73)
  assert.equal(lockLineup(game, 'player'), game)
  assert.equal(placeLineupCard(game, 'player', game.opponentPool[0].uid, 0), game)
  assert.equal(placeLineupCard(game, 'player', game.playerPool[0].uid, 15), game)
  game = placeLineupCard(game, 'player', game.playerPool[0].uid, 0)
  game = placeLineupCard(game, 'player', game.playerPool[1].uid, 1)
  game = placeLineupCard(game, 'player', game.playerPool[0].uid, 1)
  assert.deepEqual(game.playerLineup.slice(0, 2), [game.playerPool[1].uid, game.playerPool[0].uid])
  game = placeLineupCard(game, 'player', game.playerPool[0].uid, -1)
  assert.equal(game.playerLineup[1], null)
  game = { ...game, playerLineup: chooseBotLineup(game.playerPool), opponentLineup: chooseBotLineup(game.opponentPool) }
  game = lockLineup(game, 'player')
  assert.equal(game.phase, 'lineup')
  assert.equal(placeLineupCard(game, 'player', game.playerPool[0].uid, 0), game)
  game = lockLineup(game, 'opponent')
  assert.equal(game.phase, 'battle-ready')
  assert.deepEqual(game.playerHand.map(card => card.uid), game.playerLineup.slice(0, 5))
})

test('20Cards publishes exactly ten unused cards only after both locks, for every pool and lock order', () => {
  for (const tabletop of [false, 'abilities-new-cards', 'monsters']) for (const first of ['player', 'opponent']) {
    let game = createTwentyCardsGame({ tabletop, seed: 12 })
    game.playerLineup = game.playerPool.slice(0, 15).map(card => card.uid)
    game.opponentLineup = game.opponentPool.slice(0, 15).map(card => card.uid)
    game = lockLineup(game, first)
    assert.deepEqual(game.discardPile, [])
    game = lockLineup(JSON.parse(JSON.stringify(game)), first === 'player' ? 'opponent' : 'player')
    const expected = [...game.playerPool.slice(15), ...game.opponentPool.slice(15)].map(card => card.uid)
    assert.deepEqual(game.discardPile.map(card => card.uid), expected)
    const active = [...game.deck, ...game.discardPile, ...game.playerPool.slice(0, 15), ...game.opponentPool.slice(0, 15)]
    assert.equal(new Set(active.map(card => card.uid)).size, active.length)
    const prep = createPreparationState(game)
    assert.equal(prep.sharedDiscard, true)
    assert.deepEqual(prep.playerDiscard, game.discardPile)
    assert.deepEqual(prep.opponentDiscard, game.discardPile)
  }
})

function twentyDiscardFixture() {
  const remaining = getExpandedCoreDeck({ tabletop: 'abilities-new-cards' })
  const take = id => remaining.splice(remaining.findIndex(card => card.id === id), 1)[0]
  const own = ['draw_2_discard_2', 'discard_for_damage', 'draw_all_new_1', 'rabbit2', 'robot2'].map(take)
  const enemy = ['recycle_card', 'copy_card_in_hand', 'dragon1', 'dragon1', 'robot1'].map(take)
  let game = createTwentyCardsGame({ deck: [...own, ...remaining.splice(0, 15), ...enemy, ...remaining.splice(0, 15), ...remaining] })
  game = { ...game, playerLineup: game.playerPool.slice(0, 15).map(card => card.uid), opponentLineup: game.opponentPool.slice(0, 15).map(card => card.uid) }
  return lockLineup(lockLineup(game, 'player'), 'opponent')
}

test('20Cards shares prep discards and Recycle removals across both players and later rounds', () => {
  const game = twentyDiscardFixture()
  let prep = createPreparationState(game)
  const source = id => prep.playerHand.find(card => card.id === id).uid
  const draw = source('draw_2_discard_2'), damage = source('discard_for_damage'), redraw = source('draw_all_new_1')
  const victims = prep.playerHand.slice(3).map(card => card.uid)
  prep = applyPreparationAction(prep, 'player', { type: 'prepare', sourceUid: draw })
  for (const targetUid of victims) prep = applyPreparationAction(prep, 'player', { type: 'discard-preparation', sourceUid: draw, targetUid })
  assert.equal(prep.playerDiscard.length, 12)
  assert.deepEqual(prep.opponentDiscard, prep.playerDiscard)
  const recycle = prep.opponentHand.find(card => card.id === 'recycle_card').uid
  prep = applyPreparationAction(JSON.parse(JSON.stringify(prep)), 'opponent', { type: 'prepare', sourceUid: recycle, targetUid: victims[0] })
  assert(prep.opponentHand.some(card => card.uid === victims[0]))
  assert(!prep.playerDiscard.some(card => card.uid === victims[0]))
  assert.deepEqual(prep.opponentDiscard, prep.playerDiscard)
  prep = applyPreparationAction(prep, 'player', { type: 'prepare', sourceUid: damage })
  prep = applyPreparationAction(prep, 'player', { type: 'discard-preparation', sourceUid: damage, targetUid: draw })
  prep = applyPreparationAction(prep, 'player', { type: 'finish-preparation-discard', sourceUid: damage })
  const redrawn = prep.playerHand.map(card => card.uid), before = prep.playerDiscard.length
  prep = applyPreparationAction(prep, 'player', { type: 'prepare', sourceUid: redraw })
  assert.equal(prep.playerDiscard.length, before + redrawn.length)
  assert(redrawn.every(uid => prep.opponentDiscard.some(card => card.uid === uid)))
  assert.equal(new Set(prep.playerDiscard.map(card => card.uid)).size, prep.playerDiscard.length)
  const future = [...game.playerPool, ...game.opponentPool].filter(card => [...game.playerLineup.slice(5), ...game.opponentLineup.slice(5)].includes(card.uid))
  const physical = [...prep.playerHand, ...prep.opponentHand, ...prep.playerDiscard, ...prep.deck, ...future]
  assert.equal(physical.length, 73)
  assert.equal(new Set(physical.map(card => card.uid)).size, 73)
  const state = { ...session(game), preBattle: prep, battleStarted: true }
  state.settings.tabletop = false
  const next = api.sessionReducer(JSON.parse(JSON.stringify(state)), { type: 'NEXT_MATCH_ROUND' })
  assert.deepEqual(next.game.discardPile, prep.playerDiscard)
  assert.deepEqual(next.preBattle.playerDiscard, prep.playerDiscard)
  assert.deepEqual(next.preBattle.opponentDiscard, prep.playerDiscard)
  assert.deepEqual(next.preBattle.playerHand.map(card => card.uid), game.playerLineup.slice(5, 10))
  assert(!next.preBattle.playerDiscard.some(card => [...next.preBattle.playerHand, ...next.preBattle.opponentHand].some(held => held.uid === card.uid)))
})

test('20Cards lets either seat Recycle the other seat’s unused cards exactly once', () => {
  const game = twentyDiscardFixture()
  const recycle = game.opponentHand.find(card => card.id === 'recycle_card')
  for (const side of ['player', 'opponent']) {
    const enemy = side === 'player' ? 'opponent' : 'player'
    const targetUid = game[`${enemy}Pool`][15].uid
    let prep = createPreparationState({ ...game, [`${side}Hand`]: [recycle] })
    assert(getPreparationActions(prep, side).some(action => action.targetUid === targetUid))
    prep = applyPreparationAction(prep, side, { type: 'prepare', sourceUid: recycle.uid, targetUid })
    assert(prep[`${side}Hand`].some(card => card.uid === targetUid))
    assert(!prep.playerDiscard.some(card => card.uid === targetUid))
    assert(!prep.opponentDiscard.some(card => card.uid === targetUid))
  }
  let state = rooms.applyRoomAction(session(game, 'local'), 'guest', { type: 'ACTIVATE_PLAYER_PRE_BATTLE_CARD', uid: recycle.uid })
  state = rooms.applyRoomAction(state, 'guest', { type: 'RESOLVE_PLAYER_RECYCLE_PICK', uid: game.playerPool[15].uid })
  assert.equal(state.preBattle.playerDiscard.length, 9)
  assert.deepEqual(state.preBattle.playerDiscard, state.preBattle.opponentDiscard)
  assert(state.preBattle.opponentHand.some(card => card.uid === game.playerPool[15].uid))
})

test('20Cards browser reducer commits redraw, Recycle and async bot pile changes to both seats', () => {
  const game = twentyDiscardFixture()
  let state = session(game, 'sven-20cards')
  const redraw = game.playerHand.find(card => card.id === 'draw_all_new_1').uid
  state = api.sessionReducer(state, { type: 'ACTIVATE_PLAYER_PRE_BATTLE_CARD', uid: redraw })
  assert(state.preBattle.pendingResolution)
  assert.equal(state.preBattle.playerDiscard.length, 10)
  state = api.sessionReducer(state, { type: 'RESOLVE_PRE_BATTLE_PENDING_DRAW_ALL_NEW_1' })
  assert.equal(state.preBattle.playerDiscard.length, 15)
  assert.deepEqual(state.preBattle.opponentDiscard, state.preBattle.playerDiscard)
  const [recycled, ...discard] = state.preBattle.opponentDiscard
  state.settings.tabletop = false
  state = api.sessionReducer(state, { type: 'START_BATTLE' })
  state = api.sessionReducer(state, { type: 'START_BATTLE', decisionKey: state.preBattle.opponentSearchKey,
    opponentPreparation: { opponentHand: [...state.preBattle.opponentHand, recycled], opponentDiscard: discard, opponentFinished: true, deck: state.preBattle.deck } })
  assert.equal(state.battleStarted, true)
  assert.equal(state.preBattle.playerDiscard.length, 14)
  assert.deepEqual(state.preBattle.playerDiscard, state.preBattle.opponentDiscard)
})

test('special modes disappear when Testing is off and use only compatible opponents', () => {
  const settings = { gameMode: '20cards', testing: true, secretCard: true, tabletop: 'monsters', opponentAi: 'felix' }
  const normal = api.normalizePlaySettings(settings, { testing: false })
  assert.equal(normal.gameMode, 'draft'); assert.equal(normal.secretCard, false)
  assert.equal(normal.tabletop, 'abilities-new-cards')
  assert.equal(api.normalizePlaySettings(settings).opponentAi, 'sven-20cards')
  assert.equal(api.normalizePlaySettings(settings, { opponentAi: 'local' }).opponentAi, 'local')
  assert.equal(api.normalizePlaySettings(settings).secretCard, false)
})

test('special cards activate only after all lineups lock, without touching future hands or unused cards', () => {
  const deck = getExpandedCoreDeck({ tabletop: 'abilities-new-cards' })
  const draw = deck.find(card => card.id === 'draw_2_extra')
  assert(draw)
  const game = createTwentyCardsGame({ deck: [draw, ...deck.filter(card => card.uid !== draw.uid)] })
  let state = session(game)
  state = api.sessionReducer(state, { type: 'ACTIVATE_PLAYER_PRE_BATTLE_CARD', uid: draw.uid })
  assert.equal(state.game.phase, 'lineup'); assert.equal(state.preBattle.playerHand.length, 0)
  const playerLineup = game.playerPool.slice(0, 15).map(card => card.uid)
  state = api.sessionReducer({ ...state, game: { ...game, playerLineup } }, { type: 'LOCK_LINEUP' })
  assert.equal(state.game.phase, 'battle-ready')
  const beforeDeck = state.preBattle.deck.length
  state = api.sessionReducer(state, { type: 'ACTIVATE_PLAYER_PRE_BATTLE_CARD', uid: draw.uid })
  assert.equal(state.preBattle.playerHand.length, 7)
  assert.equal(state.preBattle.deck.length, beforeDeck - 2)
  assert.deepEqual(state.game.playerLineup, playerLineup)
  const future = new Set(playerLineup.slice(5))
  assert.equal(state.preBattle.playerHand.some(card => future.has(card.uid)), false)
})

test('20Cards next round preserves remaining draw deck and resets preparation; no repeated round or fourth round', () => {
  let game = createTwentyCardsGame({ tabletop: 'abilities-new-cards', seed: 32 })
  game = { ...game, playerLineup: chooseBotLineup(game.playerPool), opponentLineup: chooseBotLineup(game.opponentPool) }
  game = lockLineup(lockLineup(game, 'player'), 'opponent')
  let state = session(game)
  state.preBattle = { ...state.preBattle, playerActivated: game.playerHand.map(card => card.uid), playerFinished: true }
  const choice = getTabletopChoice(state.preBattle)
  state.preBattle.tabletopChoice = { type: choice.types[0], handKey: game.playerHand.map(card => card.uid).join('|') }
  state = api.sessionReducer(state, { type: 'START_BATTLE' })
  assert.equal(state.battleStarted, true)
  const expectedWinner = resolveTabletopBattle(state.preBattle.playerHand, state.preBattle.opponentHand,
    { playerType: getTabletopChoice(state.preBattle).selectedType }).winner
  const remainingDeck = state.preBattle.deck.map(card => card.uid)
  const next = api.sessionReducer(state, { type: 'NEXT_MATCH_ROUND' })
  assert.equal(next.battleStarted, false)
  assert.deepEqual(next.game.roundResults, [expectedWinner])
  assert.deepEqual(next.preBattle.playerHand.map(card => card.uid), game.playerLineup.slice(5, 10))
  assert.deepEqual(next.preBattle.deck.map(card => card.uid), remainingDeck)
  assert.equal(next.preBattle.playerActivated.length, 0)
  assert.equal(api.sessionReducer(next, { type: 'NEXT_MATCH_ROUND' }), next)
  const final = { ...state, game: { ...state.game, roundIndex: 2, roundResults: ['player', 'opponent'] } }
  assert.equal(api.sessionReducer(final, { type: 'NEXT_MATCH_ROUND' }), final)
  if (expectedWinner !== 'tie') {
    const twoWins = { ...state, game: { ...state.game, roundIndex: 1, roundResults: [expectedWinner] } }
    assert.equal(api.sessionReducer(twoWins, { type: 'NEXT_MATCH_ROUND' }), twoWins)
  }
})

test('match scoring requires two wins and draws after three rounds without a two-win winner', () => {
  assert.deepEqual(twentyCardsScore(['player', 'player']), { player: 2, opponent: 0, complete: true, winner: 'player' })
  assert.equal(twentyCardsScore(['player', 'opponent']).complete, false)
  assert.equal(twentyCardsScore(['player', 'opponent', 'tie']).winner, 'tie')
  assert.equal(twentyCardsScore(['tie', 'tie', 'opponent']).winner, 'tie')
  assert.equal(twentyCardsScore(['tie', 'tie', 'tie']).winner, 'tie')
})

test('same-screen private choices require handoffs, persist locks and flip lane ownership correctly', () => {
  let state = local.initializeLocalMultiplayer(session(createTwentyCardsGame({ tabletop: 'abilities-new-cards', seed: 91 }), 'local'))
  assert.equal(state.localPlay.handoff, true)
  state = api.localSessionReducer(state, { type: 'LOCAL_REVEAL' })
  for (let slot = 0; slot < 15; slot += 1) state = api.localSessionReducer(state,
    { type: 'PLACE_LINEUP_CARD', uid: state.game.playerPool[slot].uid, slot })
  state = api.localSessionReducer(state, { type: 'LOCK_LINEUP' })
  assert.equal(state.game.playerLocked, true); assert.equal(state.game.opponentLocked, false)
  assert.equal(state.localPlay.seat, 'guest'); assert.equal(state.localPlay.handoff, true)
  const before = state
  assert.equal(api.localSessionReducer(state, { type: 'PLACE_LINEUP_CARD', uid: state.game.opponentPool[0].uid, slot: 0 }), before)
  state = api.localSessionReducer(state, { type: 'LOCAL_REVEAL' })
  for (let slot = 0; slot < 15; slot += 1) state = api.localSessionReducer(state,
    { type: 'PLACE_LINEUP_CARD', uid: state.game.opponentPool[slot].uid, slot })
  state = api.localSessionReducer(state, { type: 'LOCK_LINEUP' })
  assert.equal(state.game.phase, 'battle-ready'); assert.equal(state.game.opponentLocked, true)
  assert.equal(state.preBattle.playerHand.length, 5); assert.equal(state.preBattle.opponentHand.length, 5)
  const mirrored = rooms.seatView({ ...state, game: { ...state.game, roundResults: ['player', 'tie'] } }, 'guest')
  assert.deepEqual(mirrored.game.roundResults, ['opponent', 'tie'])
})

test('same-screen Secret Card hides each opening pack behind a handoff, then resumes public drafting', () => {
  let state = local.initializeLocalMultiplayer(session(createDraftGame({ tabletop: 'abilities-new-cards', seed: 19, secretCard: true }), 'local'))
  assert.equal(state.localPlay.handoff, true)
  state = api.localSessionReducer(state, { type: 'LOCAL_REVEAL' })
  state = api.localSessionReducer(state, { type: 'PLAYER_DRAFT_PICK', uid: state.game.draftRow[0].uid })
  assert.equal(state.localPlay.seat, 'guest'); assert.equal(state.localPlay.handoff, true)
  assert.equal(state.game.draftDiscard.length, 0)
  assert.equal(local.getLocalDisplaySeat(state), 'guest')
  state = api.localSessionReducer(state, { type: 'LOCAL_REVEAL' })
  state = api.localSessionReducer(state, { type: 'PLAYER_DRAFT_PICK', uid: state.game.draftRow[0].uid })
  assert.equal(state.game.secretOpening, false); assert.equal(state.localPlay.handoff, false)
  assert.equal(state.game.playerHand[0].secret, true); assert.equal(state.game.opponentHand[0].secret, true)
  assert.equal(state.game.packNumber, 2)
  assert.equal(state.game.draftDiscard.length, 8)
  assert.equal(state.preBattle.playerDiscard.length, 8)
  assert.equal(state.preBattle.opponentDiscard.length, 8)
})

test('same-screen 20Cards completes three drawn rounds with reloads and forced preparation', () => {
  const deck = getExpandedCoreDeck({ tabletop: 'abilities-new-cards' })
  // Two sides with no attacks guarantee drawn combat, including after mirroring.
  const blank = Array.from({ length: 40 }, (_, i) => ({ ...deck.find(card => card.id === 'dragon1'), uid: `blank-${i}` }))
  let game = createTwentyCardsGame({ deck: [...blank, ...deck] })
  game = { ...game, playerLineup: game.playerPool.slice(0, 15).map(card => card.uid), opponentLineup: game.opponentPool.slice(0, 15).map(card => card.uid) }
  game = lockLineup(lockLineup(game, 'player'), 'opponent')
  const initial = session(game, 'local')
  initial.settings.tabletop = false
  let state = local.initializeLocalMultiplayer(initial)
  for (let round = 0; round < 3; round += 1) {
    assert.equal(state.battleStarted, true) // No optional actions or faction decisions.
    assert.equal(state.game.roundIndex, round)
    assert.equal(simulateBattle(state.preBattle.playerHand, state.preBattle.opponentHand).winner, 'tie')
    state = local.initializeLocalMultiplayer(JSON.parse(JSON.stringify(state)), true)
    assert.equal(state.game.playerLineup.length, 15)
    assert.equal(state.game.playerLocked, true)
    const next = api.localSessionReducer(state, { type: 'NEXT_MATCH_ROUND' })
    if (round < 2) {
      assert.deepEqual(next.game.roundResults, Array(round + 1).fill('tie'))
      assert.equal(next.preBattle.playerHand[0].uid, `blank-${(round + 1) * 5}`)
      state = next
    } else assert.equal(next, state)
  }
})
