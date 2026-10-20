import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { readFile } from 'node:fs/promises'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { createDraftGame } from '../src/game/draftMode.js'
import { createFiveHandDiscardGame } from '../src/game/fiveHandDiscard.js'
import { getExpandedCoreDeck } from '../src/game/cards.js'
import { createPreparationState, getPreparationActions } from '../src/game/preparationState.js'
import { getTabletopChoice, getCardTabletopTypes, resolveTabletopBattle } from '../src/game/tabletop.js'
import { MAX_MESSAGE_BYTES, ROOM_PROTOCOL, randomToken } from '../src/network/protocol.js'

let vite, gameApi, Client, miniflare
before(async () => {
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  gameApi = await vite.ssrLoadModule('/src/network/roomGame.js')
  Client = (await vite.ssrLoadModule('/src/network/RoomClient.js')).default
  const protocol = (await readFile('src/network/protocol.js', 'utf8')).replace(/^export /gm, '')
  const worker = (await readFile('relay/worker.js', 'utf8')).replace(/^import .* from .*$/m, '')
  miniflare = new Miniflare(convertV4MiniflareOptions({ modules: true, script: `${protocol}\n${worker}`, compatibilityDate: '2026-10-20',
    durableObjects: { ROOMS: { className: 'Room', useSQLite: true } },
    bindings: { ALLOWED_ORIGINS: 'http://localhost:5173', ALLOW_LOCAL_TESTING: 'true', MAX_ROOMS_PER_DAY: '100' } }))
})
after(async () => { await miniflare?.dispose(); await vite?.close() })

function initial(mode = 'draft', tabletop = false, seed = 42) {
  const game = mode === 'draft' ? createDraftGame({ seed, tabletop }) : createFiveHandDiscardGame({ seed, tabletop })
  return { settings: { gameMode: mode, tabletop, wildDeck: true, showOpponentCards: false, opponentAi: 'rules', testing: false },
    gameMode: mode, game, preBattle: createPreparationState(game), nextDraftStartingPicker: 'player',
    selectedIds: [], battleStarted: false, battleInstance: 0, gameSessionKey: 0, dealId: 1,
    suppressedHandCardIds: { player: [], opponent: [] } }
}
function memoryStorage() {
  const data = new Map()
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) }
}
function client(role, state, storage = memoryStorage()) {
  const instance = new Client({ storage, WebSocketImpl: class {}, fetchImpl: () => {} })
  const sent = []
  instance.send = (msg) => { sent.push(JSON.parse(JSON.stringify(msg))); return true }
  instance.save({ protocol: ROOM_PROTOCOL, endpoint: 'https://rooms.example.com', id: 'a'.repeat(20), token: randomToken(),
    role, snapshot: state, revision: 0, seen: [], pendingAction: null })
  return { instance, sent, storage }
}

test('both seats complete Draft and Discard with all three battle rules', () => {
  for (const mode of ['draft', 'five-hand-discard']) for (const tabletop of [false, 'threshold', 'abilities']) {
    for (let seed = 0; seed < 8; seed += 1) {
      let state = gameApi.startRoomGame(initial(mode, tabletop, seed))
      while (state.game.phase !== 'battle-ready') {
        const seat = state.game.phase === 'draft-player-pick' || state.game.phase.startsWith('player-discard') ? 'host' : 'guest'
        const view = gameApi.seatView(state, seat)
        assert.equal(view.game.playerHand, seat === 'host' ? state.game.playerHand : state.game.opponentHand)
        assert.equal(view.game.phase, mode === 'draft' ? 'draft-player-pick' : state.game.phase.replace(/^opponent/, 'player'))
        if (mode === 'draft') state = gameApi.applyRoomAction(state, seat, { type: 'PLAYER_DRAFT_PICK', uid: state.game.draftRow[seed % state.game.draftRow.length].uid })
        else {
          state = gameApi.applyRoomAction(state, seat, { type: 'TOGGLE_SELECTED', uid: view.game.playerHand[0].uid })
          state = gameApi.applyRoomAction(state, seat, { type: 'SUBMIT_DISCARD' })
        }
      }
      assert.equal(state.game.playerHand.length, 5)
      assert.equal(state.game.opponentHand.length, 5)
      for (const seat of ['guest', 'host']) {
        const view = gameApi.seatView(state, seat)
        const choice = getTabletopChoice(view.preBattle)
        if (tabletop && choice.needsChoice) {
          state = gameApi.applyRoomAction(state, seat, { type: 'START_BATTLE' })
          const card = view.preBattle.playerHand.find((c) => getCardTabletopTypes(c, choice).length)
          state = gameApi.applyRoomAction(state, seat, { type: 'CHOOSE_TABLETOP_TYPE', uid: card.uid, damageType: getCardTabletopTypes(card, choice)[0] })
        }
        state = gameApi.applyRoomAction(state, seat, { type: 'START_BATTLE' })
        assert.equal(state.battleStarted, seat === 'host')
      }
      assert(state.preBattle.playerFinished && state.preBattle.opponentFinished)
      if (tabletop) {
        const hostResult = resolveTabletopBattle(state.preBattle.playerHand, state.preBattle.opponentHand, {
          playerType: getTabletopChoice(state.preBattle).selectedType, opponentType: gameApi.opponentRoomType(state) })
        const guest = gameApi.seatView(state, 'guest')
        const guestResult = resolveTabletopBattle(guest.preBattle.playerHand, guest.preBattle.opponentHand, {
          playerType: getTabletopChoice(guest.preBattle).selectedType, opponentType: gameApi.opponentRoomType(guest) })
        assert.equal(hostResult.player.score, guestResult.opponent.score)
        assert.equal(hostResult.opponent.score, guestResult.player.score)
      }
    }
  }
})

test('guest preparation uses shared rules, resolves redraw atomically and keeps host UI separate', () => {
  const covered = new Set()
  for (let seed = 0; seed < 100; seed += 1) {
    let state = gameApi.startRoomGame(initial('five-hand-discard', false, seed))
    for (const seat of ['host', 'guest', 'host', 'guest']) state = gameApi.applyRoomAction(state, seat, { type: 'SUBMIT_DISCARD' })
    for (const seat of ['guest', 'host']) {
      for (let count = 0; count < 20; count += 1) {
        const view = gameApi.seatView(state, seat)
        const choice = getPreparationActions(view.preBattle).find((a) => a.type === 'prepare')
        if (!choice) break
        covered.add(choice.cardId)
        state = gameApi.applyRoomAction(state, seat, { type: 'ACTIVATE_PLAYER_PRE_BATTLE_CARD', uid: choice.sourceUid })
        if (choice.targetUid) state = gameApi.applyRoomAction(state, seat, {
          type: choice.cardId === 'recycle_card' ? 'RESOLVE_PLAYER_RECYCLE_PICK' : 'ACTIVATE_PLAYER_PRE_BATTLE_CARD', uid: choice.targetUid })
        assert.equal(state.preBattle.pendingResolution, null)
        const updated = gameApi.seatView(state, seat)
        assert(updated.preBattle.playerActivated.includes(choice.sourceUid))
      }
    }
  }
  assert(covered.has('copy_card_in_hand'))
  assert(covered.has('draw_all_new_1'))
  assert(covered.has('draw_2_extra'))
})

test('invalid turns and arbitrary reducer actions cannot change a room game', () => {
  const state = gameApi.startRoomGame(initial())
  const before = JSON.stringify(state)
  assert.throws(() => gameApi.applyRoomAction(state, 'guest', { type: 'PLAYER_DRAFT_PICK', uid: state.game.draftRow[0].uid }))
  assert.throws(() => gameApi.applyRoomAction(state, 'guest', { type: 'UPDATE_SETTINGS', patch: { gameMode: 'five-hand-discard' } }))
  assert.throws(() => gameApi.applyRoomAction(state, 'host', { type: 'START_BATTLE' }))
  assert.equal(JSON.stringify(state), before)
})

test('guest recycle and copy target their own pools without overwriting host preparation controls', () => {
  const pool = getExpandedCoreDeck({ wildDeck: true })
  const take = (id) => pool.splice(pool.findIndex((c) => c.id === id), 1)[0]
  const source = take('recycle_card'), copied = take('copy_card_in_hand'), target = take('draw_2_extra')
  const discarded = take('dragon1')
  const state = initial('five-hand-discard')
  state.game = { ...state.game, phase: 'battle-ready', deck: pool, opponentHand: [source, copied, target],
    opponentDiscards: [discarded], playerHand: [take('copy_card_in_hand'), take('robot1')] }
  state.preBattle = { ...createPreparationState(state.game), armedPlayerCopyUid: state.game.playerHand[0].uid }
  let online = { ...gameApi.settleSession(state), onlineHuman: true, gameVersion: gameApi.GAME_VERSION, otherUi: {}, otherSelectedIds: [] }
  online = gameApi.applyRoomAction(online, 'guest', { type: 'ACTIVATE_PLAYER_PRE_BATTLE_CARD', uid: source.uid })
  assert.equal(online.preBattle.recycleSelection, null)
  assert.equal(online.otherUi.recycleSelection.sourceUid, source.uid)
  online = gameApi.applyRoomAction(online, 'guest', { type: 'RESOLVE_PLAYER_RECYCLE_PICK', uid: discarded.uid })
  assert(online.preBattle.opponentHand.some((c) => c.uid === discarded.uid))
  assert.equal(online.preBattle.opponentDiscard.length, 0)
  assert.equal(online.preBattle.armedPlayerCopyUid, state.game.playerHand[0].uid)
  online = gameApi.applyRoomAction(online, 'guest', { type: 'ACTIVATE_PLAYER_PRE_BATTLE_CARD', uid: copied.uid })
  online = gameApi.applyRoomAction(online, 'guest', { type: 'ACTIVATE_PLAYER_PRE_BATTLE_CARD', uid: target.uid })
  const guest = gameApi.seatView(online, 'guest')
  const copy = guest.preBattle.playerHand.find((c) => c.id === 'draw_2_extra' && c.uid !== target.uid)
  assert(copy)
  assert.equal(guest.preBattle.armedPlayerCopyUid, null)
  assert.equal(online.preBattle.armedPlayerCopyUid, state.game.playerHand[0].uid)
  online = gameApi.applyRoomAction(online, 'guest', { type: 'ACTIVATE_PLAYER_PRE_BATTLE_CARD', uid: copy.uid })
  assert(online.preBattle.opponentActivated.includes(copy.uid))
})

test('host commits before ack; refresh restores deck; duplicate retries do not apply twice', () => {
  let state = gameApi.startRoomGame(initial('five-hand-discard'))
  state = gameApi.applyRoomAction(state, 'host', { type: 'SUBMIT_DISCARD' })
  const { instance: host, sent, storage } = client('host', state)
  const action = { type: 'action', id: randomToken(16), revision: 0, action: { type: 'SUBMIT_DISCARD' } }
  host.receive(action)
  assert.equal(host.record.revision, 1)
  assert.equal(sent[0].type, 'ack')
  const restored = new Client({ storage, WebSocketImpl: class {}, fetchImpl: () => {} })
  assert.deepEqual(restored.record.snapshot.game.deck, host.record.snapshot.game.deck)
  assert.equal(restored.record.token, host.record.token)
  const original = JSON.stringify(host.record.snapshot)
  host.receive(action)
  assert.equal(host.record.revision, 1)
  assert.equal(JSON.stringify(host.record.snapshot), original)
  assert.equal(host.record.seen.length, 1)
  // Client-owned snapshots fit the relay's message budget, even with full deck definitions.
  assert(new TextEncoder().encode(JSON.stringify(sent.find((m) => m.type === 'snapshot'))).length < MAX_MESSAGE_BYTES)
})

test('failed host storage never acknowledges an action as accepted', () => {
  let state = gameApi.startRoomGame(initial('five-hand-discard'))
  state = gameApi.applyRoomAction(state, 'host', { type: 'SUBMIT_DISCARD' })
  const { instance: host, sent, storage } = client('host', state)
  storage.setItem = () => { throw new Error('Storage full') }
  host.receive({ type: 'action', id: randomToken(16), revision: 0, action: { type: 'SUBMIT_DISCARD' } })
  assert.equal(host.record.revision, 0)
  assert.equal(sent[0].error, 'Storage full')
})

test('guest pending action and accepted identity survive refresh, stale revisions report retry', () => {
  const state = gameApi.startRoomGame(initial())
  const { instance: guest, storage } = client('guest', state)
  guest.emit({ connection: 'connected', presence: { host: { connected: true } } })
  guest.dispatch({ type: 'PLAYER_DRAFT_PICK', uid: state.game.draftRow[0].uid })
  assert(guest.record.pendingAction)
  const restored = new Client({ storage, WebSocketImpl: class {}, fetchImpl: () => {} })
  assert.equal(restored.record.role, 'guest')
  assert.deepEqual(restored.record.pendingAction, guest.record.pendingAction)
  const { instance: host, sent } = client('host', state)
  host.receive({ ...guest.record.pendingAction, revision: 999 })
  assert.match(sent[0].error, /table changed/)
  guest.receive(sent[0])
  assert.equal(guest.record.pendingAction, null)
})

const origin = 'http://localhost:5173'
async function post(path, body) {
  return miniflare.dispatchFetch(`http://relay${path}`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}
async function socket(id, token) {
  const response = await miniflare.dispatchFetch(`http://relay/rooms/${id}/socket`, {
    headers: { Origin: origin, Upgrade: 'websocket', 'Sec-WebSocket-Protocol': `crd-v1, ${token}` },
  })
  if (response.status !== 101) return response
  const ws = response.webSocket
  const messages = []
  ws.addEventListener('message', (event) => messages.push(JSON.parse(event.data)))
  ws.accept()
  return { ws, messages }
}
async function until(check) {
  const deadline = Date.now() + 5000
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for relay')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

test('real Durable Object: approval, relay permissions, refresh tokens, bounded messages and closure', async () => {
  const token = randomToken(), guestToken = randomToken()
  const created = await post('/rooms', { token, name: 'Host' })
  assert.equal(created.status, 200)
  const { id } = await created.json()
  const host = await socket(id, token)
  assert(host.ws)
  assert.equal((await post(`/rooms/${id}/join`, { token: guestToken, name: 'Friend' })).status, 200)
  assert.equal((await post(`/rooms/${id}/join`, { token: randomToken(), name: 'Intruder' })).status, 409)
  const guest = await socket(id, guestToken)
  await until(() => host.messages.some((m) => m.pending?.name === 'Friend'))
  guest.ws.send(JSON.stringify({ type: 'sync' }))
  await until(() => guest.messages.some((m) => m.type === 'error'))
  host.ws.send(JSON.stringify({ type: 'approve' }))
  await until(() => guest.messages.some((m) => m.type === 'presence' && m.role === 'guest'))
  const action = { type: 'action', id: randomToken(16), revision: 0, action: { type: 'SUBMIT_DISCARD' } }
  guest.ws.send(JSON.stringify(action))
  await until(() => host.messages.some((m) => m.id === action.id))
  const snapshot = { type: 'snapshot', protocol: ROOM_PROTOCOL, revision: 1, state: gameApi.startRoomGame(initial()) }
  host.ws.send(JSON.stringify(snapshot))
  await until(() => guest.messages.some((m) => m.type === 'snapshot'))
  guest.ws.send(JSON.stringify(snapshot))
  await until(() => guest.messages.some((m) => m.error === 'Not allowed'))
  // Approved guest reconnects with same token; no new join or approval.
  guest.ws.close(1000)
  const returned = await socket(id, guestToken)
  await until(() => returned.messages.some((m) => m.role === 'guest'))
  assert.equal((await socket(id, randomToken())).status, 401)
  const closed = new Promise((resolve) => returned.ws.addEventListener('close', resolve))
  returned.ws.send('x'.repeat(MAX_MESSAGE_BYTES + 1))
  assert.equal((await closed).code, 1009)
  host.ws.send(JSON.stringify({ type: 'close' }))
  await until(() => host.messages.some((m) => m.type === 'closed'))
  assert.equal((await socket(id, token)).status, 404)
})

test('relay rejects unknown origins and large HTTP bodies before storing membership', async () => {
  const blocked = await miniflare.dispatchFetch('http://relay/rooms', { method: 'POST', headers: { Origin: 'https://unrelated.example' }, body: '{}' })
  assert.equal(blocked.status, 403)
  const oversized = await post('/rooms', { name: 'X'.repeat(6000), token: randomToken() })
  assert.equal(oversized.status, 400)
})
