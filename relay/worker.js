/* global WebSocketPair */
import { cleanName, MAX_MESSAGE_BYTES, ROOM_ID_PATTERN, ROOM_PROTOCOL, ROOM_TTL_MS, TOKEN_PATTERN, randomToken, validAction } from '../src/network/protocol.js'

const json = (value, status = 200, headers = {}) => Response.json(value, { status, headers })
async function hash(token) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))),
    (n) => n.toString(16).padStart(2, '0')).join('')
}
function originAllowed(request, env) {
  return (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).includes(request.headers.get('Origin'))
}
async function botCheck(body, request, env) {
  if (!env.TURNSTILE_SECRET_KEY) return env.ALLOW_LOCAL_TESTING === 'true'
  const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST', body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY,
      response: String(body.challenge ?? ''), remoteip: request.headers.get('CF-Connecting-IP') ?? '' }),
  }).then((r) => r.json())
  return result.success === true && result.action === 'room-entry' && result.hostname === new URL(request.headers.get('Origin')).hostname
}
async function readBody(request) {
  // Bound streamed bodies too, including requests without Content-Length.
  const reader = request.body?.getReader()
  if (!reader) throw new Error('Missing body')
  let bytes = 0
  const chunks = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value.length
    if (bytes > 4096) { await reader.cancel(); throw new Error('Body too large') }
    chunks.push(value)
  }
  const body = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length }
  return JSON.parse(new TextDecoder().decode(body))
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (!originAllowed(request, env)) return json({ error: 'Origin not allowed' }, 403)
    const cors = { 'Access-Control-Allow-Origin': request.headers.get('Origin'), Vary: 'Origin',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (request.method === 'GET' && url.pathname === '/config') return json({ protocol: ROOM_PROTOCOL, siteKey: env.TURNSTILE_SITE_KEY ?? '',
      localTesting: env.ALLOW_LOCAL_TESTING === 'true' }, 200, cors)
    // Approximate per-IP edge limits, plus exact room/message limits below.
    const ip = request.headers.get('CF-Connecting-IP') ?? 'local'
    const limit = url.pathname === '/rooms' || url.pathname.endsWith('/join') ? env.ENTRY_LIMIT : env.CONNECT_LIMIT
    if (limit && !(await limit.limit({ key: ip })).success) return json({ error: 'Too many attempts. Try again shortly.' }, 429, cors)
    try {
      if (request.method === 'POST' && url.pathname === '/rooms') {
        const body = await readBody(request)
        if (!TOKEN_PATTERN.test(body.token) || !cleanName(body.name)) return json({ error: 'Name and token required' }, 400, cors)
        if (!(await botCheck(body, request, env))) return json({ error: 'Complete the bot check' }, 403, cors)
        // Exact daily creation budget limits persistent membership growth.
        const quota = env.ROOMS.get(env.ROOMS.idFromName('creation-budget'))
        const allowed = await quota.fetch(new Request('https://internal/budget', { method: 'POST' }))
        if (!allowed.ok) return json({ error: 'Room creation is at capacity for today' }, 429, cors)
        const id = randomToken(10)
        const room = env.ROOMS.get(env.ROOMS.idFromName(id))
        const result = await room.fetch(new Request('https://internal/create', { method: 'POST', body: JSON.stringify(body) }))
        if (!result.ok) return json({ error: 'Could not create room' }, 400, cors)
        return json({ id }, 200, cors)
      }
      const match = url.pathname.match(/^\/rooms\/([a-f0-9]{20})\/(join|socket)$/)
      if (!match || !ROOM_ID_PATTERN.test(match[1])) return json({ error: 'Not found' }, 404, cors)
      const room = env.ROOMS.get(env.ROOMS.idFromName(match[1]))
      if (match[2] === 'join' && request.method === 'POST') {
        const body = await readBody(request)
        if (!TOKEN_PATTERN.test(body.token) || !cleanName(body.name)) return json({ error: 'Name and token required' }, 400, cors)
        if (!(await botCheck(body, request, env))) return json({ error: 'Complete the bot check' }, 403, cors)
        const result = await room.fetch(new Request('https://internal/join', { method: 'POST', body: JSON.stringify(body) }))
        return new Response(result.body, { status: result.status, headers: { ...cors, 'Content-Type': 'application/json' } })
      }
      if (match[2] === 'socket' && request.method === 'GET' && request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
        return room.fetch(request)
      }
      return json({ error: 'Not found' }, 404, cors)
    } catch {
      return json({ error: 'Invalid request' }, 400, cors)
    }
  },
}

// Bounded membership only. No deck, snapshots, action history or game rules here.
export class Room {
  constructor(ctx, env) {
    this.ctx = ctx
    this.env = env
    this.ready = ctx.blockConcurrencyWhile(async () => { this.members = await ctx.storage.get('members') })
  }
  async fetch(request) {
    await this.ready
    const path = new URL(request.url).pathname
    if (path === '/budget') {
      const day = Math.floor(Date.now() / 86400000)
      const old = await this.ctx.storage.get('budget')
      const count = old?.day === day ? old.count : 0
      if (count >= Number(this.env.MAX_ROOMS_PER_DAY ?? 1000)) return json({}, 429)
      await this.ctx.storage.put('budget', { day, count: count + 1 })
      return json({})
    }
    if (path === '/create') {
      if (this.members) return json({}, 409)
      const body = await request.json()
      this.members = { host: { hash: await hash(body.token), name: cleanName(body.name) }, guest: null, pending: null,
        expires: Date.now() + ROOM_TTL_MS }
      await this.save()
      await this.ctx.storage.setAlarm(this.members.expires)
      return json({})
    }
    if (!this.members || this.members.expires <= Date.now()) return json({ error: 'Room expired or does not exist' }, 404)
    if (path === '/join') {
      const body = await request.json()
      const credential = await hash(body.token)
      if (this.members.guest?.hash === credential || this.members.pending?.hash === credential) return json({})
      if (this.members.guest || (this.members.pending && this.members.pending.until > Date.now())) return json({ error: 'Room already has a player or pending request' }, 409)
      this.members.pending = { hash: credential, name: cleanName(body.name), until: Date.now() + 120000 }
      await this.save()
      await this.ctx.storage.setAlarm(Math.min(this.members.pending.until, this.members.expires))
      this.presence()
      return json({})
    }
    const protocols = (request.headers.get('Sec-WebSocket-Protocol') ?? '').split(',').map((s) => s.trim())
    if (protocols[0] !== 'crd-v1' || !TOKEN_PATTERN.test(protocols[1])) return json({}, 401)
    const credential = await hash(protocols[1])
    const role = ['host', 'guest', 'pending'].find((key) => this.members[key]?.hash === credential)
    if (!role || (role === 'pending' && this.members.pending.until <= Date.now())) return json({}, 401)
    // One live connection per token. A refresh replaces the old connection.
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.deserializeAttachment()?.hash === credential) ws.close(4001, 'Connected in another tab')
    }
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({ hash: credential, role, window: Date.now(), count: 0, bytes: 0 })
    this.presence()
    return new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': 'crd-v1' } })
  }
  async save() { await this.ctx.storage.put('members', this.members) }
  send(ws, value) { try { ws.send(JSON.stringify(value)) } catch { /* Close event updates presence. */ } }
  presence() {
    if (!this.members) return
    const sockets = this.ctx.getWebSockets()
    const connected = (role) => sockets.some((ws) => ws.readyState === 1 && ws.deserializeAttachment()?.role === role)
    for (const ws of sockets) {
      const role = ws.deserializeAttachment()?.role
      this.send(ws, { type: 'presence', protocol: ROOM_PROTOCOL, role, expires: this.members.expires,
        host: { name: this.members.host.name, connected: connected('host') },
        guest: this.members.guest ? { name: this.members.guest.name, connected: connected('guest') } : null,
        pending: role === 'host' && this.members.pending ? { name: this.members.pending.name } : null })
    }
  }
  async webSocketMessage(ws, raw) {
    await this.ready
    const meta = ws.deserializeAttachment()
    if (!this.members || this.members.expires <= Date.now()) return ws.close(4004, 'Room expired')
    if (this.members[meta.role]?.hash !== meta.hash) return ws.close(4003, 'Seat no longer available')
    if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > MAX_MESSAGE_BYTES) return ws.close(1009, 'Message too large')
    if (Date.now() - meta.window >= 60000) { meta.window = Date.now(); meta.count = 0; meta.bytes = 0 }
    meta.count += 1
    meta.bytes += raw.length
    ws.serializeAttachment(meta)
    if (meta.count > 120 || meta.bytes > 4 * 1024 * 1024) return ws.close(4008, 'Slow down')
    try {
      const msg = JSON.parse(raw)
      if (msg.type === 'approve' || msg.type === 'reject') {
        if (meta.role !== 'host' || !this.members.pending) throw new Error('Not allowed')
        const pending = this.members.pending
        if (msg.type === 'approve' && pending.until <= Date.now()) throw new Error('Join request expired')
        if (msg.type === 'approve') this.members.guest = { hash: pending.hash, name: pending.name }
        this.members.pending = null
        await this.save()
        await this.ctx.storage.setAlarm(this.members.expires)
        for (const socket of this.ctx.getWebSockets()) {
          const entry = socket.deserializeAttachment()
          if (entry.hash !== pending.hash) continue
          if (msg.type === 'approve') socket.serializeAttachment({ ...entry, role: 'guest' })
          else { this.send(socket, { type: 'error', error: 'Join request declined' }); socket.close(4003, 'Declined') }
        }
        this.presence()
        return
      }
      if (meta.role === 'pending') {
        if (msg.type !== 'leave') throw new Error('Waiting for approval')
        this.members.pending = null
        await this.save()
        await this.ctx.storage.setAlarm(this.members.expires)
        ws.close(4003, 'Left room')
        this.presence()
        return
      }
      if (msg.type === 'close') {
        if (meta.role !== 'host') throw new Error('Only host can close room')
        await this.closeRoom()
        return
      }
      if (msg.type === 'leave') {
        if (meta.role !== 'guest') throw new Error('Only guest can leave')
        this.members.guest = null
        await this.save()
        ws.close(4003, 'Left room')
        this.presence()
        return
      }
      const hostMessage = ['snapshot', 'ack', 'stop'].includes(msg.type)
      const guestMessage = msg.type === 'action' || msg.type === 'sync'
      if ((hostMessage && meta.role !== 'host') || (guestMessage && meta.role !== 'guest') || (!hostMessage && !guestMessage)) throw new Error('Not allowed')
      if (msg.type === 'action' && (!validAction(msg.action) || !/^[a-f0-9]{32}$/.test(msg.id) || !Number.isSafeInteger(msg.revision))) throw new Error('Invalid action')
      if (msg.type === 'snapshot' && (!Number.isSafeInteger(msg.revision) || msg.protocol !== ROOM_PROTOCOL || !msg.state?.onlineHuman)) throw new Error('Invalid snapshot')
      for (const peer of this.ctx.getWebSockets()) {
        if (peer.deserializeAttachment()?.role === (meta.role === 'host' ? 'guest' : 'host')) this.send(peer, msg)
      }
    } catch (error) { this.send(ws, { type: 'error', error: error.message }) }
  }
  async webSocketClose() { this.presence() }
  async webSocketError(ws) { ws.close(1011, 'Connection error') }
  async alarm() {
    await this.ready
    if (this.members && this.members.expires > Date.now()) {
      if (this.members.pending && this.members.pending.until <= Date.now()) {
        const expired = this.members.pending.hash
        this.members.pending = null
        await this.save()
        for (const ws of this.ctx.getWebSockets()) if (ws.deserializeAttachment()?.hash === expired) ws.close(4003, 'Join request expired')
        this.presence()
      }
      await this.ctx.storage.setAlarm(this.members.expires)
      return
    }
    await this.closeRoom()
  }
  async closeRoom() {
    for (const ws of this.ctx.getWebSockets()) { this.send(ws, { type: 'closed' }); ws.close(4004, 'Room closed or expired') }
    this.members = null
    await this.ctx.storage.deleteAll()
  }
}
