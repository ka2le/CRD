import { ROOM_PROTOCOL, MAX_MESSAGE_BYTES, ROOM_ID_PATTERN, randomToken, cleanName, validAction } from './protocol.js'
import { loadProfile, PROFILE_KEY } from './profile.js'
import { compatibleGameVersion } from './gameCompatibility.js'
import { applyRoomAction, seatView, startRoomGame, scoreRoomGame, GAME_VERSION } from './roomGame.js'

export const ROOM_STORAGE_KEY = 'crd-room-v1'
export const RELAY_STORAGE_KEY = 'crd-relay-url-v1'
export const DEFAULT_RELAY_URL = 'https://crimson-haze-8993.kalle-kindvall.workers.dev'

export function readRoomInvite(value = window.location.hash) {
  try {
    const query = new URLSearchParams(value.includes('#') ? value.slice(value.indexOf('#') + 1) : value.replace(/^#/, ''))
    return { id: query.get('room') ?? '', endpoint: query.get('relay') ?? '' }
  } catch { return { id: '', endpoint: '' } }
}

export function normalizeRelay(value) {
  const url = new URL(value)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('Use an HTTPS relay address')
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Use the relay base address')
  return url.origin
}

// A small browser-owned session journal. Storage succeeds before network confirmation.
export default class RoomClient {
  constructor({ storage = window.localStorage, WebSocketImpl = WebSocket, fetchImpl = fetch } = {}) {
    this.storage = storage
    this.Socket = WebSocketImpl
    this.fetch = (...args) => fetchImpl(...args)
    this.profile = loadProfile(storage)
    this.record = null
    this.localSession = null
    this.entering = false
    this.listeners = new Set()
    this.socket = null
    this.retry = null
    this.heartbeat = null
    this.running = false
    this.backoff = 1000
    this.cached = { connection: 'offline', presence: null, record: null, session: null, error: '', busy: false, blocked: false, entry: null, profile: this.profile, notice: '' }
    try {
      const record = JSON.parse(storage.getItem(ROOM_STORAGE_KEY))
      if ([1, ROOM_PROTOCOL].includes(record?.protocol) && ROOM_ID_PATTERN.test(record.id)) {
        record.endpoint = normalizeRelay(record.endpoint)
        record.protocol = ROOM_PROTOCOL
        record.scores ??= {}
        this.record = record
        if (record.snapshot && !compatibleGameVersion(record.snapshot.gameVersion, GAME_VERSION)
          && record.snapshot.gameVersion !== import.meta.env.CRD_GAME_VERSION) {
          this.record = { ...record, snapshot: null, pendingAction: null, revision: 0 }
          this.cached.error = 'The game was updated. Your room is kept; the host can start a fresh match.'
        } else if (record.snapshot) {
          this.record = { ...record, snapshot: { ...record.snapshot, gameVersion: GAME_VERSION } }
        }
        this.emit()
      }
    } catch { this.cached.error = 'Saved room could not be restored. Your local AI game is still available.' }
  }
  subscribe = (listener) => { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  getSnapshot = () => this.cached
  emit(patch = {}) {
    this.cached = { ...this.cached, ...patch, record: this.record ?? null,
      session: this.record?.snapshot ? seatView(this.record.snapshot, this.record.role) : null,
      busy: Boolean(this.record?.pendingAction) }
    this.listeners.forEach((listener) => listener())
  }
  save(record) {
    const encoded = JSON.stringify(record)
    this.storage.setItem(ROOM_STORAGE_KEY, encoded)
    this.record = record
    this.emit()
  }
  start() {
    this.running = true
    this.followInvite()
    if (this.record) this.connect()
  }
  followInvite(value) {
    if (value === undefined && typeof window === 'undefined') return
    const invite = readRoomInvite(value)
    if (!invite.id) return
    if (!ROOM_ID_PATTERN.test(invite.id)) { this.emit({ error: 'This invitation is not valid' }); return }
    let endpoint
    try { endpoint = normalizeRelay(invite.endpoint || DEFAULT_RELAY_URL) }
    catch (error) { this.emit({ error: error.message }); return }
    if (this.record?.id === invite.id && this.record.endpoint === endpoint) return
    if (this.record) this.leave()
    this.cancelEntry()
    this.requestEntry(invite.id, endpoint)
  }
  setLocalSession(session) {
    this.localSession = session
    try { this.ensureMatch() } catch (error) { this.emit({ error: error.message }) }
  }
  requestEntry(id = '', endpoint = '') {
    if (this.record) {
      if (this.record.id !== id && id) this.emit({ error: 'Disconnect from your current room before following another invitation.' })
      return
    }
    if (this.cached.entry) return
    let base
    try { base = normalizeRelay(endpoint || this.storage.getItem(RELAY_STORAGE_KEY) || DEFAULT_RELAY_URL) }
    catch (error) { this.emit({ error: error.message }); return }
    this.emit({ entry: { id, endpoint: base, key: randomToken(8) }, error: '' })
  }
  cancelEntry() { this.emit({ entry: null }) }
  rename(value) {
    const name = cleanName(value)
    if (!name) return
    try {
      this.profile = { ...this.profile, name }
      this.storage.setItem(PROFILE_KEY, JSON.stringify(this.profile))
      if (this.record) this.save({ ...this.record, name })
      this.emit({ profile: this.profile })
      if (this.record) this.send({ type: 'rename', name })
    } catch (error) { this.emit({ error: error.message }) }
  }
  invitation() {
    return this.record && typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}#${new URLSearchParams({ room: this.record.id, relay: this.record.endpoint })}` : ''
  }
  async copyInvite() {
    try { await navigator.clipboard.writeText(this.invitation()); this.emit({ notice: 'Invite copied' }) }
    catch { this.emit({ notice: 'Copy the link from room controls.' }); return false }
    return true
  }
  stop() {
    this.running = false
    clearTimeout(this.retry)
    clearInterval(this.heartbeat)
    this.heartbeat = null
    this.retry = null
    if (this.socket) { this.socket.onclose = null; this.socket.close(); this.socket = null }
  }
  send(value) {
    if (this.socket?.readyState !== 1) return false
    const message = JSON.stringify(value)
    if (new TextEncoder().encode(message).length > MAX_MESSAGE_BYTES) throw new Error('Game state is too large to send')
    this.socket.send(message)
    return true
  }
  async enter({ endpoint, name = this.profile.name, id, challenge }) {
    if (this.entering || this.record) return
    endpoint = normalizeRelay(endpoint)
    name = cleanName(name) || this.profile.name
    if (id && !ROOM_ID_PATTERN.test(id)) throw new Error('This invitation is not valid')
    this.entering = true
    const requestedEntry = this.cached.entry
    try {
      const token = randomToken()
      const response = await this.fetch(`${endpoint}/rooms${id ? `/${id}/join` : ''}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, profileId: this.profile.id, token, challenge }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'Could not enter room')
      if (requestedEntry && requestedEntry.key !== this.cached.entry?.key) return
      this.storage.setItem(RELAY_STORAGE_KEY, endpoint)
      this.save({ protocol: ROOM_PROTOCOL, endpoint, id: id || result.id, token, name,
        role: result.role ?? (id ? 'pending' : 'host'), playerId: result.playerId,
        revision: 0, snapshot: null, seen: [], scores: {}, pendingAction: null })
      this.emit({ error: '', presence: null, entry: null, notice: id ? '' : 'Room ready. Copy your invite to bring a friend.' })
      if (typeof window !== 'undefined' && window.location.hash.includes('room=')) history.replaceState(null, '', window.location.pathname + window.location.search)
      if (this.running) this.connect()
    } finally { this.entering = false }
  }
  connect() {
    if (!this.record || !this.running) return
    clearTimeout(this.retry)
    clearInterval(this.heartbeat)
    if (this.socket) { this.socket.onclose = null; this.socket.close() }
    this.emit({ connection: 'connecting' })
    const ws = new this.Socket(`${this.record.endpoint.replace(/^http/, 'ws')}/rooms/${this.record.id}/socket`, ['crd-v1', this.record.token])
    this.socket = ws
    ws.onopen = () => {
      this.backoff = 1000
      this.lastPong = Date.now()
      this.emit({ connection: 'connected', error: '', blocked: false })
      this.heartbeat = setInterval(() => {
        if (Date.now() - this.lastPong > 60000) { ws.close(); return }
        this.send({ type: 'heartbeat' })
      }, 20000)
    }
    ws.onmessage = (event) => {
      try { this.receive(JSON.parse(event.data)) } catch (error) { this.emit({ error: error.message }) }
    }
    ws.onerror = async () => {
      this.emit({ error: 'Cannot reach the room relay. Saved game is safe.' })
      const saved = this.record
      if (!saved) return
      try {
        const result = await this.fetch(`${saved.endpoint}/rooms/${saved.id}/resume`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: saved.token }),
        })
        if ([401, 404].includes(result.status) && this.record?.token === saved.token) {
          const body = await result.json()
          this.forget(body.error || 'Room access ended. Follow the invite to join again.')
        }
      } catch { /* A service outage keeps the saved session and normal reconnect backoff. */ }
    }
    ws.onclose = (event) => {
      if (this.socket !== ws) return
      clearInterval(this.heartbeat)
      this.heartbeat = null
      this.socket = null
      this.emit({ connection: 'offline' })
      if ([4001, 4003, 4004].includes(event.code)) {
        this.emit({ error: event.reason || 'Room connection ended', blocked: true })
        return
      }
      if (this.running && this.record) {
        this.retry = setTimeout(() => this.connect(), this.backoff)
        this.backoff = Math.min(this.backoff * 2, 30000)
      }
    }
  }
  publish() {
    if (this.record?.snapshot) this.send({ type: 'snapshot', protocol: ROOM_PROTOCOL,
      revision: this.record.revision, state: this.record.snapshot })
    else this.send({ type: 'stop' })
  }
  receive(msg) {
    if (!this.record) return
    if (msg.type === 'pong') { this.lastPong = Date.now(); return }
    if (msg.type === 'presence') {
      if (msg.protocol !== ROOM_PROTOCOL) throw new Error('Room version mismatch. Reload both browsers.')
      const changedSeat = msg.role !== this.record.role || msg.selfId !== this.record.playerId
      if (['host', 'guest'].includes(msg.role) && /^[a-f0-9]{16}$/.test(msg.selfId) && this.profile.id !== msg.selfId) {
        this.profile = { ...this.profile, id: msg.selfId }
        this.storage.setItem(PROFILE_KEY, JSON.stringify(this.profile))
      }
      this.save({ ...this.record, role: msg.role, playerId: msg.selfId, roster: msg,
        pendingAction: changedSeat ? null : this.record.pendingAction })
      this.emit({ presence: msg, profile: this.profile })
      if (msg.selfName && msg.selfName !== this.profile.name) this.send({ type: 'rename', name: this.profile.name })
      if (msg.role === 'host') {
        this.ensureMatch()
        if (msg.guest?.connected || msg.viewers?.some((viewer) => viewer.connected)) this.publish()
      }
      if (['guest', 'viewer'].includes(msg.role) && msg.host?.connected) this.send({ type: 'sync' })
    } else if (msg.type === 'sync' && this.record.role === 'host') {
      this.publish()
    } else if (msg.type === 'snapshot' && ['guest', 'viewer'].includes(this.record.role)) {
      if (msg.protocol !== ROOM_PROTOCOL || msg.state?.gameVersion !== GAME_VERSION || !msg.state?.onlineHuman || !Number.isSafeInteger(msg.revision)) throw new Error('Game versions differ. Reload both browsers before starting a new match.')
      if (msg.revision < this.record.revision) return
      this.save({ ...this.record, snapshot: msg.state, revision: msg.revision, scores: msg.state.scores ?? {} })
      if (this.record.role === 'guest' && this.record.pendingAction) this.send(this.record.pendingAction)
    } else if (msg.type === 'action' && this.record.role === 'host') {
      if (this.record.seen.includes(msg.id)) { this.send({ type: 'ack', id: msg.id }); return }
      try {
        if (msg.actorId && (msg.actorId !== this.cached.presence?.guest?.id || msg.seatEpoch !== this.cached.presence?.guest?.epoch)) throw new Error('Player two changed devices. Resync your game.')
        const game = this.record.snapshot?.game
        const discardAction = game?.mode === 'five-hand-discard' && ['TOGGLE_SELECTED', 'SUBMIT_DISCARD'].includes(msg.action?.type)
        const sameDiscardPass = discardAction && msg.discardDeal === this.record.snapshot.dealId
          && msg.discardPass === Math.min(game.playerDiscardsUsed, game.opponentDiscardsUsed) + 1
        if (!this.record.snapshot || (msg.revision !== this.record.revision && !sameDiscardPass)
          || (discardAction && msg.discardPass !== undefined && !sameDiscardPass)) throw new Error('The table changed. Please try that action again.')
        const snapshot = scoreRoomGame(applyRoomAction(this.record.snapshot, 'guest', msg.action))
        this.save({ ...this.record, snapshot, scores: snapshot.scores ?? {}, revision: this.record.revision + 1, seen: [...this.record.seen, msg.id].slice(-128) })
        // Ack before snapshot prevents immediate resubmission on ordinary updates.
        this.send({ type: 'ack', id: msg.id })
        this.publish()
      } catch (error) { this.send({ type: 'ack', id: msg.id, error: error.message }); this.publish() }
    } else if (msg.type === 'ack' && this.record.role === 'guest' && msg.id === this.record.pendingAction?.id) {
      this.save({ ...this.record, pendingAction: null })
      if (msg.error) this.emit({ error: msg.error })
    } else if (msg.type === 'stop' && ['guest', 'viewer'].includes(this.record.role)) {
      this.save({ ...this.record, snapshot: null, pendingAction: null, revision: 0 })
    } else if (msg.type === 'closed' || msg.type === 'removed') {
      this.forget(msg.error || 'The host closed this room.')
    } else if (msg.type === 'error') {
      if (this.record.pendingAction) this.save({ ...this.record, pendingAction: null })
      this.emit({ error: msg.error })
    }
  }
  dispatch = (action) => {
    try {
      if (!this.record?.snapshot) return
      if (this.cached.blocked) throw new Error(this.cached.error || 'Reconnect this browser before playing')
      action = { type: action.type, ...(action.uid === undefined ? {} : { uid: action.uid }),
        ...(action.damageType === undefined ? {} : { damageType: action.damageType }),
        ...(action.patch === undefined ? {} : { patch: action.patch }) }
      if (this.record.role === 'host') {
        let snapshot
        if (action.type === 'RESET_GAME' || action.type === 'UPDATE_SETTINGS') {
          snapshot = startRoomGame(this.record.snapshot, action)
        } else snapshot = applyRoomAction(this.record.snapshot, 'host', action)
        snapshot = scoreRoomGame(snapshot)
        this.save({ ...this.record, snapshot, scores: snapshot.scores ?? this.record.scores, revision: this.record.revision + 1 })
        this.publish()
      } else {
        if (this.record.role !== 'guest') throw new Error('You are watching this game')
        if (!validAction(action)) throw new Error('The host controls shared game settings and new games')
        if (this.record.pendingAction) return
        if (this.cached.connection !== 'connected' || !this.cached.presence?.host?.connected) throw new Error('Waiting for the host to reconnect')
        const game = this.record.snapshot.game
        const pendingAction = { type: 'action', id: randomToken(16), revision: this.record.revision, action,
          ...(game.mode === 'five-hand-discard' && ['TOGGLE_SELECTED', 'SUBMIT_DISCARD'].includes(action.type)
            ? { discardDeal: this.record.snapshot.dealId, discardPass: Math.min(game.playerDiscardsUsed, game.opponentDiscardsUsed) + 1 } : {}) }
        this.save({ ...this.record, pendingAction })
        this.send(pendingAction)
      }
    } catch (error) { this.emit({ error: error.message }) }
  }
  ensureMatch() {
    if (this.record?.role !== 'host' || !this.cached.presence) return
    const guest = this.cached.presence.guest
    if (!guest) {
      if (this.record.snapshot) {
        this.save({ ...this.record, snapshot: null, pendingAction: null })
        this.send({ type: 'stop' })
      }
      return
    }
    if (this.record.snapshot && !this.record.snapshot.roomPlayers) {
      const snapshot = scoreRoomGame({ ...this.record.snapshot, scores: this.record.scores,
        roomPlayers: { host: this.cached.presence.host.id, guest: guest.id } })
      this.save({ ...this.record, snapshot, scores: snapshot.scores, revision: this.record.revision + 1 })
      this.publish()
    }
    if (!guest.connected || !this.localSession) return
    if (this.record.snapshot?.roomPlayers?.guest === guest.id) return
    this.playTogether(this.localSession)
  }
  playTogether(session) {
    if (this.record?.role !== 'host' || !this.cached.presence?.guest) throw new Error('Waiting for player two')
    const snapshot = { ...startRoomGame(session), scores: this.record.scores ?? {},
      roomPlayers: { host: this.cached.presence.host.id, guest: this.cached.presence.guest.id } }
    this.save({ ...this.record, snapshot, revision: this.record.revision + 1, seen: [] })
    this.emit({ notice: '' })
    this.publish()
  }
  approve(accept, id) { this.send({ type: accept ? 'approve' : 'reject', id }) }
  setPrivate(value) { this.send({ type: 'privacy', private: value }) }
  kick(id) { this.send({ type: 'kick', id }) }
  promote(id) { this.send({ type: 'promote', id }) }
  forget(error = '') {
    this.stop()
    this.storage.removeItem(ROOM_STORAGE_KEY)
    this.record = null
    this.emit({ presence: null, entry: null, error, notice: '', connection: 'offline', blocked: false })
    this.running = true
  }
  leave() {
    this.send({ type: this.record?.role === 'host' ? 'close' : 'leave' })
    this.forget()
  }
}
