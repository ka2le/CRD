import readline from 'node:readline'
import { createHash } from 'node:crypto'
import {
  createHeadlessGame,
  createStepResponse,
  stepHeadlessGame,
  getHeadlessSpec,
  chooseHeadlessBaselineAction,
} from '../src/game/headlessGame.js'
import { evaluateRolloutActions, sampleHeadlessWorld } from '../src/game/rolloutSearch.js'

const sessions = new Map()

function describe(config = {}) {
  const spec = getHeadlessSpec(config)
  return { ...spec, cardDataHash: createHash('sha256').update(JSON.stringify(spec.cardTypes)).digest('hex') }
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

function getSession(id) {
  const session = sessions.get(id)
  if (!session) {
    throw new Error(`Unknown session ${id}`)
  }
  return session
}

function handleRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('Request must be an object')
  if (request.command === 'ping') {
    return { ok: true, pong: true }
  }

  if (request.command === 'describe') return { ok: true, spec: describe(request.config) }

  // Stateless inference: no access to a live session or its hidden deck/seed.
  if (request.command === 'evaluate') {
    return { ok: true, evaluation: evaluateRolloutActions(request.observation, request.spec, request.options) }
  }

  if (request.command === 'sample') {
    if (typeof request.targetSessionId !== 'string' || !request.targetSessionId || sessions.has(request.targetSessionId)) {
      throw new Error('sample needs a new nonempty targetSessionId')
    }
    const sampled = sampleHeadlessWorld(request.observation, request.spec, request.options)
    sessions.set(request.targetSessionId, sampled.state)
    return { ok: true, sessionId: request.targetSessionId, attempts: sampled.attempts,
      ...createStepResponse(sampled.state, request.observation.side) }
  }

  if (request.command === 'reset') {
    const sessionId = request.sessionId ?? 'default'
    const state = createHeadlessGame(request.config ?? {})
    sessions.set(sessionId, state)

    return {
      ok: true,
      sessionId,
      spec: describe(request.config),
      ...createStepResponse(state),
    }
  }

  if (request.command === 'step') {
    const sessionId = request.sessionId ?? 'default'
    const state = getSession(sessionId)
    if (request.actor !== undefined && request.actor !== state.actor) throw new Error('Wrong actor')
    const nextState = stepHeadlessGame(state, request.action)
    sessions.set(sessionId, nextState)

    return {
      ok: true,
      sessionId,
      ...createStepResponse(nextState),
    }
  }

  if (request.command === 'observe') {
    return { ok: true, sessionId: request.sessionId ?? 'default',
      ...createStepResponse(getSession(request.sessionId ?? 'default'), request.side) }
  }

  if (request.command === 'baseline') {
    const state = getSession(request.sessionId ?? 'default')
    if (state.terminal) throw new Error('No baseline action after terminal')
    return { ok: true, action: chooseHeadlessBaselineAction(state) }
  }

  // Privileged host operation. It does not resample hidden worlds and is NOT fair search.
  // Branches share immutable state until step replaces one session's value.
  if (request.command === 'fork') {
    if (typeof request.targetSessionId !== 'string' || !request.targetSessionId || sessions.has(request.targetSessionId)) {
      throw new Error('fork needs a new nonempty targetSessionId')
    }
    const state = getSession(request.sessionId ?? 'default')
    sessions.set(request.targetSessionId, state)
    return { ok: true, sessionId: request.targetSessionId, ...createStepResponse(state) }
  }

  if (request.command === 'close') {
    const sessionId = request.sessionId ?? 'default'
    sessions.delete(sessionId)
    return { ok: true, sessionId }
  }

  throw new Error(`Unknown command ${request.command}`)
}

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
})

rl.on('line', (line) => {
  if (!line.trim()) return

  let request = null
  try {
    request = JSON.parse(line)
    const response = handleRequest(request)
    send({
      id: request.id ?? null,
      ...response,
    })
  } catch (error) {
    send({
      id: request?.id ?? null,
      ok: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    })
  }
})
