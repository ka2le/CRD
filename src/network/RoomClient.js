import { ROOM_PROTOCOL, MAX_MESSAGE_BYTES, ROOM_ID_PATTERN, randomToken, cleanName, validAction } from './protocol.js'
import { applyRoomAction, seatView, startRoomGame, GAME_VERSION } from './roomGame.js'

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
    this.listeners = new Set()
    this.socket = null
    this.retry = null
    this.running = false
    this.backoff = 1000
    this.cached = { connection: 'offline', presence: null, record: null, session: null, error: '', busy: false, blocked: false }
    try {
      const record = JSON.parse(storage.getItem(ROOM_STORAGE_KEY))
      if (record?.protocol === ROOM_PROTOCOL && ROOM_ID_PATTERN.test(record.id)) {
        record.endpoint = normalizeRelay(record.endpoint)
        this.record = record
        if (record.snapshot && record.snapshot.gameVersion !== GAME_VERSION) {
          this.record = { ...record, snapshot: null, pendingAction: null, revision: 0 }
          this.cached.error = 'The game was updated. Your room is kept; the host can start a fresh match.'
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
  start() { this.running = true; if (this.record) this.connect() }
  stop() {
    this.running = false
    clearTimeout(this.retry)
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
  async enter({ endpoint, name, id, challenge }) {
    if (this.record) throw new Error('Leave your current room first')
    endpoint = normalizeRelay(endpoint)
    name = cleanName(name)
    if (!name) throw new Error('Enter your name')
    if (id && !ROOM_ID_PATTERN.test(id)) throw new Error('Enter a valid room code or invitation link')
    const token = randomToken()
    const response = await this.fetch(`${endpoint}/rooms${id ? `/${id}/join` : ''}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, token, challenge }),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error ?? 'Could not enter room')
    this.storage.setItem(RELAY_STORAGE_KEY, endpoint)
    this.save({ protocol: ROOM_PROTOCOL, endpoint, id: id || result.id, token, name, role: id ? 'pending' : 'host',
      revision: 0, snapshot: null, seen: [], pendingAction: null })
    this.emit({ error: '', presence: null })
    if (this.running) this.connect()
  }
  connect() {
    if (!this.record || !this.running) return
    clearTimeout(this.retry)
    if (this.socket) { this.socket.onclose = null; this.socket.close() }
    this.emit({ connection: 'connecting' })
    const ws = new this.Socket(`${this.record.endpoint.replace(/^http/, 'ws')}/rooms/${this.record.id}/socket`, ['crd-v1', this.record.token])
    this.socket = ws
    ws.onopen = () => { this.backoff = 1000; this.emit({ connection: 'connected', error: '', blocked: false }) }
    ws.onmessage = (event) => {
      try { this.receive(JSON.parse(event.data)) } catch (error) { this.emit({ error: error.message }) }
    }
    ws.onerror = () => this.emit({ error: 'Cannot reach the room relay. Saved game is safe.' })
    ws.onclose = (event) => {
      if (this.socket !== ws) return
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
    if (msg.type === 'presence') {
      if (msg.protocol !== ROOM_PROTOCOL) throw new Error('Room version mismatch. Reload both browsers.')
      if (msg.role !== this.record.role) this.save({ ...this.record, role: msg.role })
      this.emit({ presence: msg })
      if (msg.role === 'host' && msg.guest?.connected) this.publish()
      if (msg.role === 'guest' && msg.host?.connected) this.send({ type: 'sync' })
    } else if (msg.type === 'sync' && this.record.role === 'host') {
      this.publish()
    } else if (msg.type === 'snapshot' && this.record.role === 'guest') {
      if (msg.protocol !== ROOM_PROTOCOL || msg.state?.gameVersion !== GAME_VERSION || !msg.state?.onlineHuman || !Number.isSafeInteger(msg.revision)) throw new Error('Game versions differ. Reload both browsers before starting a new match.')
      if (msg.revision < this.record.revision) return
      this.save({ ...this.record, snapshot: msg.state, revision: msg.revision })
      if (this.record.pendingAction) this.send(this.record.pendingAction)
    } else if (msg.type === 'action' && this.record.role === 'host') {
      if (this.record.seen.includes(msg.id)) { this.send({ type: 'ack', id: msg.id }); return }
      try {
        if (!this.record.snapshot || msg.revision !== this.record.revision) throw new Error('The table changed. Please try that action again.')
        const snapshot = applyRoomAction(this.record.snapshot, 'guest', msg.action)
        this.save({ ...this.record, snapshot, revision: this.record.revision + 1, seen: [...this.record.seen, msg.id].slice(-128) })
        // Ack before snapshot prevents immediate resubmission on ordinary updates.
        this.send({ type: 'ack', id: msg.id })
        this.publish()
      } catch (error) { this.send({ type: 'ack', id: msg.id, error: error.message }); this.publish() }
    } else if (msg.type === 'ack' && this.record.role === 'guest' && msg.id === this.record.pendingAction?.id) {
      this.save({ ...this.record, pendingAction: null })
      if (msg.error) this.emit({ error: msg.error })
    } else if (msg.type === 'stop' && this.record.role === 'guest') {
      this.save({ ...this.record, snapshot: null, pendingAction: null, revision: 0 })
    } else if (msg.type === 'closed') {
      this.emit({ error: 'Room closed or expired. Leave this room to continue against AI.', blocked: true })
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
        this.save({ ...this.record, snapshot, revision: this.record.revision + 1 })
        this.publish()
      } else {
        if (!validAction(action)) throw new Error('The host controls shared game settings and new games')
        if (this.record.pendingAction) return
        if (this.cached.connection !== 'connected' || !this.cached.presence?.host?.connected) throw new Error('Waiting for the host to reconnect')
        const pendingAction = { type: 'action', id: randomToken(16), revision: this.record.revision, action }
        this.save({ ...this.record, pendingAction })
        this.send(pendingAction)
      }
    } catch (error) { this.emit({ error: error.message }) }
  }
  playTogether(session) {
    if (this.record?.role !== 'host' || !this.cached.presence?.guest) throw new Error('Accept a player first')
    this.save({ ...this.record, snapshot: startRoomGame(session), revision: this.record.revision + 1, seen: [] })
    this.publish()
  }
  playAi() {
    if (this.record?.role !== 'host') return
    this.save({ ...this.record, snapshot: null, revision: 0, seen: [] })
    this.send({ type: 'stop' })
  }
  approve(accept) { this.send({ type: accept ? 'approve' : 'reject' }) }
  leave() {
    this.send({ type: this.record?.role === 'host' ? 'close' : 'leave' })
    this.stop()
    this.storage.removeItem(ROOM_STORAGE_KEY)
    this.record = null
    this.emit({ presence: null, error: '', connection: 'offline', blocked: false })
    this.running = true
  }
}

