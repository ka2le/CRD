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

test('special modes disappear when Testing is off and use only compatible opponents', () => {
  const settings = { gameMode: '20cards', testing: true, secretCard: true, tabletop: 'monsters', opponentAi: 'felix' }
  const normal = api.normalizePlaySettings(settings, { testing: false })
  assert.equal(normal.gameMode, 'draft'); assert.equal(normal.secretCard, false)
  assert.equal(normal.tabletop, 'abilities-new-cards')
  assert.equal(api.normalizePlaySettings(settings).opponentAi, 'rules')
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
