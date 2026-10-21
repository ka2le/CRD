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
import { LEGACY_GAME_VERSION } from '../src/network/gameCompatibility.js'

let vite, gameApi, Client, miniflare, RoomClass
before(async () => {
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  gameApi = await vite.ssrLoadModule('/src/network/roomGame.js')
  Client = (await vite.ssrLoadModule('/src/network/RoomClient.js')).default
  RoomClass = (await vite.ssrLoadModule('/relay/worker.js')).Room
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

test('both seats complete Draft and Discard with digital and all three tabletop rules', () => {
  for (const mode of ['draft', 'five-hand-discard']) for (const tabletop of [false, 'threshold', 'abilities', 'abilitiesv2']) {
    for (let seed = 0; seed < 8; seed += 1) {
      let state = gameApi.startRoomGame(initial(mode, tabletop, seed))
      while (state.game.phase !== 'battle-ready') {
        const seat = mode === 'draft' ? (state.game.phase === 'draft-player-pick' ? 'host' : 'guest') : state.discardReady?.host ? 'guest' : 'host'
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
  const created = await post('/rooms', { token, name: 'Host', private: true })
  assert.equal(created.status, 200)
  const { id } = await created.json()
  const host = await socket(id, token)
  assert(host.ws)
  assert.equal((await post(`/rooms/${id}/join`, { token: guestToken, name: 'Friend' })).status, 200)
  const guest = await socket(id, guestToken)
  await until(() => host.messages.some((m) => m.pending?.some((p) => p.name === 'Friend')))
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


test('open rooms auto-seat player two; a new device resumes the offline seat and revokes the old token', async () => {
  const hostToken = randomToken(), firstToken = randomToken(), newToken = randomToken()
  const { id } = await (await post('/rooms', { token: hostToken, name: 'Host' })).json()
  const host = await socket(id, hostToken)
  const first = await (await post(`/rooms/${id}/join`, { token: firstToken, name: 'AppleFireman' })).json()
  assert.equal(first.role, 'guest')
  const guest = await socket(id, firstToken)
  guest.ws.send(JSON.stringify({ type: 'heartbeat' }))
  await until(() => guest.messages.some((m) => m.type === 'pong'))
  await until(() => host.messages.some((m) => m.guest?.connected))
  const original = host.messages.filter((m) => m.guest?.connected).at(-1).guest
  guest.ws.close(1000)
  await until(() => host.messages.some((m) => m.guest?.id === original.id && !m.guest.connected))
  const replacement = await (await post(`/rooms/${id}/join`, { token: newToken, name: 'AppleOnPhone' })).json()
  assert.equal(replacement.role, 'guest')
  assert.equal(replacement.playerId, first.playerId)
  const phone = await socket(id, newToken)
  await until(() => host.messages.some((m) => m.guest?.name === 'AppleOnPhone' && m.guest.connected))
  const changed = host.messages.filter((m) => m.guest?.name === 'AppleOnPhone').at(-1).guest
  assert.notEqual(changed.epoch, original.epoch)
  assert.equal((await socket(id, firstToken)).status, 401)
  assert.equal((await post(`/rooms/${id}/resume`, { token: firstToken })).status, 401)
  assert.equal((await post(`/rooms/${id}/resume`, { token: newToken })).status, 200)
  const snapshot = { type: 'snapshot', protocol: ROOM_PROTOCOL, revision: 14, state: gameApi.startRoomGame(initial()) }
  host.ws.send(JSON.stringify(snapshot))
  await until(() => phone.messages.some((m) => m.type === 'snapshot' && m.revision === 14))
  host.ws.send(JSON.stringify({ type: 'close' }))
  await until(() => host.messages.some((m) => m.type === 'closed'))
})

test('viewers require admission, receive snapshots, cannot act; host can rename, set privacy, kick and promote', async () => {
  const hostToken = randomToken(), guestToken = randomToken(), viewerToken = randomToken()
  const { id } = await (await post('/rooms', { token: hostToken, name: 'Host' })).json()
  const host = await socket(id, hostToken)
  const admitted = await (await post(`/rooms/${id}/join`, { token: guestToken, name: 'Player' })).json()
  const guest = await socket(id, guestToken)
  await until(() => host.messages.some((m) => m.guest?.connected))
  const watching = await (await post(`/rooms/${id}/join`, { token: viewerToken, name: 'Viewer' })).json()
  assert.equal(watching.role, 'pending')
  const viewer = await socket(id, viewerToken)
  await until(() => host.messages.some((m) => m.pending?.some((p) => p.id === watching.playerId && p.desired === 'viewer')))
  host.ws.send(JSON.stringify({ type: 'approve', id: watching.playerId }))
  await until(() => viewer.messages.some((m) => m.role === 'viewer'))
  viewer.ws.send(JSON.stringify({ type: 'action', id: randomToken(16), revision: 0, action: { type: 'START_BATTLE' } }))
  await until(() => viewer.messages.some((m) => m.error === 'Not allowed'))
  host.ws.send(JSON.stringify({ type: 'snapshot', protocol: ROOM_PROTOCOL, revision: 7, state: gameApi.startRoomGame(initial()) }))
  await until(() => viewer.messages.some((m) => m.type === 'snapshot' && m.revision === 7))
  viewer.ws.send(JSON.stringify({ type: 'rename', name: 'PeachWizard' }))
  await until(() => host.messages.some((m) => m.viewers?.some((v) => v.name === 'PeachWizard')))
  host.ws.send(JSON.stringify({ type: 'privacy', private: true }))
  await until(() => viewer.messages.some((m) => m.private === true))
  host.ws.send(JSON.stringify({ type: 'kick', id: admitted.playerId }))
  await until(() => guest.messages.some((m) => m.type === 'removed'))
  assert.equal((await socket(id, guestToken)).status, 401)
  assert.equal((await post(`/rooms/${id}/join`, { token: guestToken, name: 'Kicked' })).status, 403)
  host.ws.send(JSON.stringify({ type: 'promote', id: watching.playerId }))
  await until(() => viewer.messages.some((m) => m.role === 'guest'))
  const privateToken = randomToken()
  const request = await (await post(`/rooms/${id}/join`, { token: privateToken, name: 'Private viewer' })).json()
  assert.equal(request.role, 'pending')
  host.ws.send(JSON.stringify({ type: 'close' }))
  await until(() => host.messages.some((m) => m.type === 'closed'))
})

test('names persist beyond rooms; public auto-start happens once and reconnects preserve the same match', () => {
  const storage = memoryStorage()
  const { instance: host } = client('host', null, storage)
  assert.match(host.profile.name, /^[A-Z][a-z]+[A-Z][a-z]+$/)
  host.rename('AppleFireman')
  host.record.scores = { host: 2 }
  host.setLocalSession(initial())
  const presence = { type: 'presence', protocol: ROOM_PROTOCOL, role: 'host', selfId: 'host', private: false,
    host: { id: 'host', name: 'AppleFireman', connected: true }, guest: { id: 'guest', name: 'MintPilot', connected: true, epoch: 'device-1' }, viewers: [], pending: [] }
  host.receive(presence)
  assert(host.record.snapshot?.onlineHuman)
  const snapshot = host.record.snapshot
  host.receive({ ...presence, guest: { ...presence.guest, name: 'ChangedName' } })
  assert.equal(host.record.snapshot, snapshot)
  host.receive({ ...presence, guest: { ...presence.guest, connected: false } })
  assert.equal(host.record.snapshot, snapshot)
  host.receive({ ...presence, guest: { ...presence.guest, epoch: 'device-2' } })
  assert.equal(host.record.snapshot, snapshot)
  host.leave()
  const restored = new Client({ storage, WebSocketImpl: class {}, fetchImpl: () => {} })
  assert.equal(restored.profile.name, 'AppleFireman')
  assert.equal(restored.record, null)
})

test('wins count once, survive refresh and rematches, and viewers have a read-only host perspective', () => {
  const state = initial('five-hand-discard', 'threshold')
  const pool = getExpandedCoreDeck({ tabletop: 'threshold', wildDeck: true })
  const ownHand = ['robot1', 'robot_attack'].map((id) => pool.find((c) => c.id === id))
  state.game = { ...state.game, phase: 'battle-ready', playerHand: ownHand, opponentHand: [] }
  state.preBattle = { ...createPreparationState(state.game), opponentFinished: true }
  let online = { ...gameApi.settleSession(state), onlineHuman: true, gameVersion: gameApi.GAME_VERSION,
    roomPlayers: { host: 'host', guest: 'guest' }, scores: { host: 2, guest: 1 }, otherUi: {}, otherSelectedIds: [] }
  online = gameApi.applyRoomAction(online, 'host', { type: 'START_BATTLE' })
  online = gameApi.scoreRoomGame(online)
  assert.equal(online.roomResult.winnerId, 'host')
  assert.equal(online.scores.host, 3)
  assert.equal(gameApi.scoreRoomGame(online), online)
  const { storage } = client('host', online)
  const restored = new Client({ storage, WebSocketImpl: class {}, fetchImpl: () => {} })
  assert.equal(restored.record.snapshot.scores.host, 3)
  const next = gameApi.startRoomGame(online)
  assert.equal(next.roomResult, null)
  assert.equal(next.scores.host, 3)
  const { instance: viewer } = client('viewer', online)
  assert.equal(viewer.cached.session.game.playerHand, online.game.playerHand)
  viewer.dispatch({ type: 'START_BATTLE' })
  assert.equal(viewer.record.pendingAction, null)
  assert.match(viewer.cached.error, /watching/)
  assert.throws(() => gameApi.applyRoomAction(online, 'viewer', { type: 'START_BATTLE' }), /Viewers/)
})


test('existing rooms migrate without losing tokens, and silent sockets eventually release player two', async () => {
  const legacy = { host: { hash: 'host-token', name: 'Host' }, guest: { hash: 'guest-token', name: 'Guest' },
    pending: { hash: 'pending-token', name: 'Pending', until: Date.now() + 10000 }, expires: Date.now() + 50000 }
  let meta = { hash: 'guest-token', seenAt: Date.now() - 70000 }
  const stale = { readyState: 1, deserializeAttachment: () => meta, serializeAttachment: (next) => { meta = next } }
  const saved = []
  const ctx = { getWebSockets: () => [stale], blockConcurrencyWhile: (callback) => callback(),
    storage: { get: async () => legacy, put: async (_, value) => saved.push(value) } }
  const room = new RoomClass(ctx, {})
  await room.ready
  assert.equal(room.members.host.hash, 'host-token')
  assert.equal(room.members.guest.hash, 'guest-token')
  assert.equal(room.members.private, false)
  assert.equal(room.members.pending.length, 1)
  assert.equal(room.members.pending[0].desired, 'guest')
  assert.match(room.members.host.id, /^[a-f0-9]{16}$/)
  assert.equal(room.connected(room.members.guest), false)
  assert.equal(room.guestAvailable(), true)
  assert.equal(saved.length, 1)
})

test('published saved matches gain player identities without redealing; incompatible rules still reset', () => {
  const state = gameApi.startRoomGame(initial())
  state.gameVersion = LEGACY_GAME_VERSION
  const { storage } = client('host', state)
  const restored = new Client({ storage, WebSocketImpl: class {}, fetchImpl: () => {} })
  restored.send = () => true
  restored.setLocalSession(initial())
  restored.receive({ type: 'presence', protocol: ROOM_PROTOCOL, role: 'host', selfId: 'host',
    host: { id: 'host', connected: true }, guest: { id: 'guest', connected: true }, viewers: [] })
  assert.deepEqual(restored.record.snapshot.game.deck, state.game.deck)
  assert.deepEqual(restored.record.snapshot.game.draftRow, state.game.draftRow)
  assert.deepEqual(restored.record.snapshot.roomPlayers, { host: 'host', guest: 'guest' })
  assert.equal(restored.record.snapshot.gameVersion, gameApi.GAME_VERSION)
  restored.save({ ...restored.record, snapshot: { ...state, gameVersion: 'incompatible' } })
  const reset = new Client({ storage, WebSocketImpl: class {}, fetchImpl: () => {} })
  assert.equal(reset.record.snapshot, null)
  assert.equal(reset.record.id, restored.record.id)
  restored.save({ ...restored.record, snapshot: { ...state, gameVersion: gameApi.GAME_VERSION.split(':')[0] } })
  const previousRoomFlow = new Client({ storage, WebSocketImpl: class {}, fetchImpl: () => {} })
  assert.equal(previousRoomFlow.record.snapshot.gameVersion, gameApi.GAME_VERSION)
  assert.deepEqual(previousRoomFlow.record.snapshot.game.deck, state.game.deck)
})

test('new invitations switch rooms while retaining the remembered name; malformed links keep the current room', () => {
  const { instance, sent } = client('guest', gameApi.startRoomGame(initial()))
  instance.rename('AppleFireman')
  const original = instance.record
  instance.followInvite('#room=bad&relay=https%3A%2F%2Frooms.example.com')
  assert.equal(instance.record, original)
  instance.followInvite('#room=' + 'b'.repeat(20) + '&relay=https%3A%2F%2Frooms.example.com')
  assert.equal(instance.record, null)
  assert.equal(instance.profile.name, 'AppleFireman')
  assert.equal(instance.cached.entry.id, 'b'.repeat(20))
  assert(sent.some((msg) => msg.type === 'leave'))
})


test('simultaneous discard locks either seat first, preserves both hands until ready, and resolves both passes atomically', () => {
  for (const first of ['host', 'guest']) for (const count of [0, 2, 5]) {
    let state = gameApi.startRoomGame(initial('five-hand-discard'))
    for (let pass = 1; pass <= 2; pass++) {
      const before = state.game
      const second = first === 'host' ? 'guest' : 'host'
      for (const seat of [first, second]) {
        const view = gameApi.seatView(state, seat)
        assert.equal(view.game.phase, `player-discard-${pass}`)
        for (const card of view.game.playerHand.slice(0, count)) state = gameApi.applyRoomAction(state, seat, { type: 'TOGGLE_SELECTED', uid: card.uid })
      }
      state = gameApi.applyRoomAction(state, first, { type: 'SUBMIT_DISCARD' })
      assert.equal(state.game, before)
      assert.equal(state.discardReady[first], true)
      assert.throws(() => gameApi.applyRoomAction(state, first, { type: 'SUBMIT_DISCARD' }), /already submitted/)
      assert.throws(() => gameApi.applyRoomAction(state, first, { type: 'TOGGLE_SELECTED', uid: gameApi.seatView(state, first).game.playerHand[0].uid }), /already submitted/)
      const { storage } = client('host', state)
      const restored = new Client({ storage, WebSocketImpl: class {}, fetchImpl: () => {} })
      assert.deepEqual(restored.record.snapshot.discardReady, state.discardReady)
      assert.deepEqual(restored.record.snapshot.game.deck, before.deck)
      state = gameApi.applyRoomAction(state, second, { type: 'SUBMIT_DISCARD' })
      assert.equal(state.game.deck.length, before.deck.length - count * 2)
      assert.equal(state.game.playerDiscardsUsed, pass)
      assert.equal(state.game.opponentDiscardsUsed, pass)
      assert.deepEqual(state.discardReady, {})
      assert.equal(state.game.phase, pass === 2 ? 'battle-ready' : 'player-discard-2')
    }
  }
})

test('concurrent discard messages tolerate selection revisions, but cannot cross into another pass', () => {
  const { instance: host, sent } = client('host', gameApi.startRoomGame(initial('five-hand-discard')))
  const first = host.record.snapshot.game
  const guestUid = first.opponentHand[0].uid
  host.dispatch({ type: 'TOGGLE_SELECTED', uid: first.playerHand[0].uid })
  host.receive({ type: 'action', id: randomToken(16), revision: 0, discardDeal: host.record.snapshot.dealId, discardPass: 1, action: { type: 'TOGGLE_SELECTED', uid: guestUid } })
  assert.deepEqual(host.record.snapshot.otherSelectedIds, [guestUid])
  host.receive({ type: 'action', id: randomToken(16), revision: 0, discardDeal: host.record.snapshot.dealId, discardPass: 1, action: { type: 'SUBMIT_DISCARD' } })
  assert.equal(host.record.snapshot.game, first)
  host.dispatch({ type: 'SUBMIT_DISCARD' })
  assert.equal(host.record.snapshot.game.deck.length, first.deck.length - 2)
  const next = host.record.snapshot
  host.receive({ type: 'action', id: randomToken(16), revision: 0, discardDeal: host.record.snapshot.dealId, discardPass: 1, action: { type: 'SUBMIT_DISCARD' } })
  assert.equal(host.record.snapshot, next)
  assert(sent.some((msg) => msg.error?.includes('table changed')))
  const oldDeal = host.record.snapshot.dealId
  host.dispatch({ type: 'RESET_GAME' })
  const fresh = host.record.snapshot
  host.receive({ type: 'action', id: randomToken(16), revision: 0, discardDeal: oldDeal, discardPass: 1, action: { type: 'SUBMIT_DISCARD' } })
  assert.equal(host.record.snapshot, fresh)
})

test('older saved mid-discard games finish the guest half without drawing the host twice', () => {
  let state = gameApi.startRoomGame(initial('five-hand-discard'))
  state.game = { ...state.game, phase: 'opponent-discard-1', playerDiscardsUsed: 1 }
  delete state.discardReady
  const before = state.game.deck
  assert.throws(() => gameApi.applyRoomAction(state, 'host', { type: 'SUBMIT_DISCARD' }), /already submitted/)
  state = gameApi.applyRoomAction(state, 'guest', { type: 'SUBMIT_DISCARD' })
  assert.equal(state.game.deck, before)
  assert.equal(state.game.playerDiscardsUsed, 1)
  assert.equal(state.game.opponentDiscardsUsed, 1)
  assert.equal(state.game.phase, 'player-discard-2')
})

test('emotes ride on sync: host re-broadcasts guest emotes, echoes and junk are ignored, sends are throttled', () => {
  const state = gameApi.startRoomGame(initial())
  const host = client('host', state)
  const guest = client('guest', state)
  const viewer = client('viewer', state)
  for (const side of [host, guest, viewer]) side.instance.emit({ connection: 'connected' })
  assert.equal(viewer.instance.sendEmote('hi'), false)
  assert.equal(guest.instance.sendEmote('nope'), false)
  assert.equal(guest.instance.sendEmote('gg'), true)
  assert.equal(guest.instance.sendEmote('fire'), false, 'cooldown')
  const message = guest.sent.at(-1)
  assert.deepEqual([message.type, message.emote.id, message.emote.seat], ['sync', 'gg', 'guest'])
  assert.equal(guest.instance.getSnapshot().emote.id, 'gg')
  const published = host.sent.length
  host.instance.receive(message)
  assert.equal(host.instance.getSnapshot().emote.id, 'gg')
  assert.equal(host.sent.length, published + 1)
  assert.deepEqual(host.sent.at(-1), { type: 'sync', emote: message.emote }, 'forwarded, not a snapshot')
  // Guest ignores its own echo; the viewer shows it.
  const before = guest.instance.getSnapshot().emote
  guest.instance.receive(host.sent.at(-1))
  assert.equal(guest.instance.getSnapshot().emote, before)
  viewer.instance.receive(host.sent.at(-1))
  assert.deepEqual([viewer.instance.getSnapshot().emote.id, viewer.instance.getSnapshot().emote.seat], ['gg', 'guest'])
  // Malformed emotes never reach the UI.
  viewer.instance.lastReceivedEmoteAt = 0
  viewer.instance.receive({ type: 'sync', emote: { id: '<b>', seat: 'host', key: 'abcdef0123' } })
  assert.equal(viewer.instance.getSnapshot().emote.id, 'gg')
})
