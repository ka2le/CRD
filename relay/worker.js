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
      const match = url.pathname.match(/^\/rooms\/([a-f0-9]{20})\/(join|socket|resume)$/)
      if (!match || !ROOM_ID_PATTERN.test(match[1])) return json({ error: 'Not found' }, 404, cors)
      const room = env.ROOMS.get(env.ROOMS.idFromName(match[1]))
      if (match[2] === 'resume' && request.method === 'POST') {
        const body = await readBody(request)
        if (!TOKEN_PATTERN.test(body.token)) return json({ error: 'Invalid room token' }, 401, cors)
        const result = await room.fetch(new Request('https://internal/resume', { method: 'POST', body: JSON.stringify(body) }))
        return new Response(result.body, { status: result.status, headers: { ...cors, 'Content-Type': 'application/json' } })
      }
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
    this.ready = ctx.blockConcurrencyWhile(async () => {
      this.members = await ctx.storage.get('members')
      if (!this.members) return
      const m = this.members
      const legacy = !Array.isArray(m.pending) || !m.host.id
      m.private ??= false
      m.viewers ??= []
      m.banned ??= []
      m.host.id ??= randomToken(8)
      if (m.guest) { m.guest.id ??= randomToken(8); m.guest.epoch ??= randomToken(8) }
      m.pending = Array.isArray(m.pending) ? m.pending : m.pending ? [{ ...m.pending, id: randomToken(8), desired: 'guest' }] : []
      for (const ws of ctx.getWebSockets()) {
        const meta = ws.deserializeAttachment()
        if (meta && !meta.seenAt) ws.serializeAttachment({ ...meta, seenAt: Date.now() })
      }
      if (legacy) await this.save()
    })
  }
  allMembers() { return [this.members.host, this.members.guest, ...this.members.viewers, ...this.members.pending].filter(Boolean) }
  member(hash) { return this.allMembers().find((member) => member.hash === hash) }
  role(member) {
    if (member === this.members.host) return 'host'
    if (member === this.members.guest) return 'guest'
    return this.members.viewers.includes(member) ? 'viewer' : 'pending'
  }
  connected(member, excluded = null) {
    return Boolean(member && this.ctx.getWebSockets().some((ws) => {
      const meta = ws.deserializeAttachment()
      return ws !== excluded && ws.readyState === 1 && meta?.hash === member.hash && Date.now() - meta.seenAt <= 65000
    }))
  }
  publicMember(member) { return member ? { id: member.id, name: member.name, connected: this.connected(member), epoch: member.epoch } : null }
  connectionKey() { return this.allMembers().map((member) => `${member.id}:${this.connected(member)}`).join('|') }
  guestAvailable() { return !this.members.guest || (!this.connected(this.members.guest) && (this.members.guest.reservedUntil ?? 0) <= Date.now()) }
  makeMember(body, credential) {
    const proposed = /^[a-f0-9]{16}$/.test(body.profileId) ? body.profileId : randomToken(8)
    return { id: this.allMembers().some((m) => m.id === proposed) ? randomToken(8) : proposed, hash: credential, name: cleanName(body.name) }
  }
  async admit(member, desired) {
    if (desired === 'guest') {
      if (!this.guestAvailable()) throw new Error('Player two is already connected')
      const previous = this.members.guest
      // An offline player-two seat carries its hand and score to the new device.
      if (previous && previous.hash !== member.hash) {
        member.id = previous.id
        this.members.banned = [...this.members.banned, previous.hash].slice(-32)
        this.closeToken(previous.hash, 'Player two continued on another device')
      }
      member.epoch = randomToken(8)
      member.reservedUntil = Date.now() + 15000
      this.members.guest = member
    } else {
      if (this.members.viewers.length >= 8) throw new Error('Viewer seats are full')
      this.members.viewers.push(member)
    }
    this.members.pending = this.members.pending.filter((m) => m !== member)
    await this.save()
    await this.nextAlarm()
    this.presence()
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
      this.members = { host: { id: /^[a-f0-9]{16}$/.test(body.profileId) ? body.profileId : randomToken(8), hash: await hash(body.token), name: cleanName(body.name) },
        guest: null, viewers: [], pending: [], banned: [], private: body.private === true, expires: Date.now() + ROOM_TTL_MS }
      await this.save()
      await this.nextAlarm()
      return json({ role: 'host', playerId: this.members.host.id })
    }
    if (!this.members || this.members.expires <= Date.now()) return json({ error: 'Room expired or does not exist' }, 404)
    if (path === '/resume') {
      const body = await request.json()
      const credential = await hash(body.token)
      const member = this.member(credential)
      if (!member || this.members.banned.includes(credential)) return json({ error: 'This seat moved to another device or was removed. Follow the invite to join again.' }, 401)
      return json({ role: this.role(member), playerId: member.id })
    }
    if (path === '/join') {
      const body = await request.json()
      const credential = await hash(body.token)
      if (this.members.banned.includes(credential)) return json({ error: 'This room access was revoked' }, 403)
      const existing = this.member(credential)
      if (existing) return json({ role: this.role(existing), playerId: existing.id })
      this.members.pending = this.members.pending.filter((m) => m.until > Date.now())
      const desired = this.guestAvailable() ? 'guest' : 'viewer'
      if (desired === 'viewer' && this.members.viewers.length >= 8) return json({ error: 'Viewer seats are full' }, 409)
      if (this.members.pending.length >= 4) return json({ error: 'Room has too many pending requests' }, 429)
      const member = this.makeMember(body, credential)
      if (!this.members.private && desired === 'guest') {
        await this.admit(member, 'guest')
        return json({ role: 'guest', playerId: member.id })
      }
      this.members.pending.push({ ...member, desired, until: Date.now() + 120000 })
      await this.save()
      await this.nextAlarm()
      this.presence()
      return json({ role: 'pending', playerId: member.id })
    }
    const protocols = (request.headers.get('Sec-WebSocket-Protocol') ?? '').split(',').map((s) => s.trim())
    if (protocols[0] !== 'crd-v1' || !TOKEN_PATTERN.test(protocols[1])) return json({}, 401)
    const credential = await hash(protocols[1])
    const member = this.member(credential)
    if (!member || this.members.banned.includes(credential) || (this.role(member) === 'pending' && member.until <= Date.now())) return json({}, 401)
    for (const ws of this.ctx.getWebSockets()) if (ws.deserializeAttachment()?.hash === credential) ws.close(4001, 'Connected in another tab')
    const [client, server] = Object.values(new WebSocketPair())
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({ hash: credential, window: Date.now(), seenAt: Date.now(), count: 0, bytes: 0 })
    this.presence()
    return new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': 'crd-v1' } })
  }
  async save() { await this.ctx.storage.put('members', this.members) }
  async nextAlarm() { await this.ctx.storage.setAlarm(Math.min(this.members.expires, ...this.members.pending.map((m) => m.until))) }
  send(ws, value) { try { ws.send(JSON.stringify(value)) } catch { /* A close event updates presence. */ } }
  closeToken(credential, reason) {
    for (const ws of this.ctx.getWebSockets()) if (ws.deserializeAttachment()?.hash === credential) {
      this.send(ws, { type: 'removed', error: reason })
      ws.close(4003, reason)
    }
  }
  presence() {
    if (!this.members) return
    const presenceKey = this.connectionKey()
    for (const ws of this.ctx.getWebSockets()) {
      const meta = ws.deserializeAttachment()
      const member = this.member(meta?.hash)
      if (!member) continue
      ws.serializeAttachment({ ...meta, presenceKey })
      const role = this.role(member)
      this.send(ws, { type: 'presence', protocol: ROOM_PROTOCOL, role, selfId: member.id, selfName: member.name, private: this.members.private,
        expires: this.members.expires, host: this.publicMember(this.members.host), guest: this.publicMember(this.members.guest),
        viewers: this.members.viewers.map((m) => this.publicMember(m)),
        pending: role === 'host' ? this.members.pending.map((m) => ({ id: m.id, name: m.name, desired: m.desired })) : [] })
    }
  }
  async webSocketMessage(ws, raw) {
    await this.ready
    const meta = ws.deserializeAttachment()
    if (!this.members || this.members.expires <= Date.now()) return ws.close(4004, 'Room expired')
    const member = this.member(meta.hash)
    if (!member || this.members.banned.includes(meta.hash)) return ws.close(4003, 'Seat no longer available')
    const role = this.role(member)
    if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > MAX_MESSAGE_BYTES) return ws.close(1009, 'Message too large')
    if (Date.now() - meta.window >= 60000) { meta.window = Date.now(); meta.count = 0; meta.bytes = 0 }
    meta.count += 1
    meta.bytes += raw.length
    meta.seenAt = Date.now()
    ws.serializeAttachment(meta)
    if (meta.count > 120 || meta.bytes > 4 * 1024 * 1024) return ws.close(4008, 'Slow down')
    try {
      const msg = JSON.parse(raw)
      if (msg.type === 'heartbeat') {
        this.send(ws, { type: 'pong' })
        if (meta.presenceKey !== this.connectionKey()) this.presence()
        return
      }
      if (['approve', 'reject', 'kick', 'privacy', 'promote'].includes(msg.type)) {
        if (role !== 'host') throw new Error('Not allowed')
        if (msg.type === 'privacy') {
          if (typeof msg.private !== 'boolean') throw new Error('Invalid privacy setting')
          this.members.private = msg.private
          await this.save()
        } else if (msg.type === 'approve' || msg.type === 'reject') {
          const pending = this.members.pending.find((m) => m.id === msg.id) ?? (!msg.id && this.members.pending.length === 1 ? this.members.pending[0] : null)
          if (!pending || pending.until <= Date.now()) throw new Error('Join request expired')
          if (msg.type === 'approve') await this.admit(pending, this.guestAvailable() && pending.desired === 'guest' ? 'guest' : 'viewer')
          else {
            this.members.pending = this.members.pending.filter((m) => m !== pending)
            await this.save()
            this.closeToken(pending.hash, 'Join request declined')
          }
        } else if (msg.type === 'kick') {
          const target = [this.members.guest, ...this.members.viewers].find((m) => m?.id === msg.id)
          if (!target) throw new Error('Player not found')
          this.members.banned = [...this.members.banned, target.hash].slice(-32)
          if (target === this.members.guest) this.members.guest = null
          else this.members.viewers = this.members.viewers.filter((m) => m !== target)
          await this.save()
          this.closeToken(target.hash, 'Removed by the host')
        } else {
          const viewer = this.members.viewers.find((m) => m.id === msg.id)
          if (!viewer) throw new Error('Viewer not found')
          if (!this.guestAvailable()) throw new Error('Player two is already connected')
          this.members.viewers = this.members.viewers.filter((m) => m !== viewer)
          await this.admit(viewer, 'guest')
        }
        await this.nextAlarm()
        this.presence()
        return
      }
      if (msg.type === 'rename') {
        const name = cleanName(msg.name)
        if (!name) throw new Error('Enter a name')
        member.name = name
        await this.save()
        this.presence()
        return
      }
      if (msg.type === 'leave') {
        if (role === 'host') { await this.closeRoom(); return }
        if (role === 'guest') this.members.guest = null
        this.members.viewers = this.members.viewers.filter((m) => m !== member)
        this.members.pending = this.members.pending.filter((m) => m !== member)
        await this.save()
        await this.nextAlarm()
        ws.close(4003, 'Left room')
        this.presence()
        return
      }
      if (role === 'pending') throw new Error('Waiting for approval')
      if (msg.type === 'close') {
        if (role !== 'host') throw new Error('Not allowed')
        await this.closeRoom()
        return
      }
      const hostMessage = ['snapshot', 'ack', 'stop'].includes(msg.type)
      const otherMessage = msg.type === 'sync' || (msg.type === 'action' && role === 'guest')
      if ((hostMessage && role !== 'host') || (!hostMessage && !otherMessage)) throw new Error('Not allowed')
      if (msg.type === 'action' && (!validAction(msg.action) || !/^[a-f0-9]{32}$/.test(msg.id) || !Number.isSafeInteger(msg.revision))) throw new Error('Invalid action')
      if (msg.type === 'snapshot' && (!Number.isSafeInteger(msg.revision) || msg.protocol !== ROOM_PROTOCOL || !msg.state?.onlineHuman)) throw new Error('Invalid snapshot')
      const forwarded = msg.type === 'action' ? { ...msg, actorId: member.id, seatEpoch: member.epoch } : msg
      for (const peer of this.ctx.getWebSockets()) {
        const target = this.member(peer.deserializeAttachment()?.hash)
        if (!target) continue
        const targetRole = this.role(target)
        if (role === 'host' ? (msg.type === 'ack' ? targetRole === 'guest' : ['guest', 'viewer'].includes(targetRole)) : targetRole === 'host') this.send(peer, forwarded)
      }
    } catch (error) { this.send(ws, { type: 'error', error: error.message }) }
  }
  async webSocketClose(ws) {
    await this.ready
    if (this.members?.guest?.hash === ws.deserializeAttachment()?.hash && !this.connected(this.members.guest, ws)) {
      this.members.guest.reservedUntil = 0
      await this.save()
    }
    this.presence()
  }
  async webSocketError(ws) { ws.close(1011, 'Connection error') }
  async alarm() {
    await this.ready
    if (this.members && this.members.expires > Date.now()) {
      const expired = this.members.pending.filter((m) => m.until <= Date.now())
      this.members.pending = this.members.pending.filter((m) => m.until > Date.now())
      await this.save()
      for (const member of expired) this.closeToken(member.hash, 'Join request expired')
      await this.nextAlarm()
      this.presence()
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
