import readline from 'node:readline'
import {
  createHeadlessGame,
  createStepResponse,
  stepHeadlessGame,
} from '../src/game/headlessGame.js'

const sessions = new Map()

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
  if (request.command === 'ping') {
    return { ok: true, pong: true }
  }

  if (request.command === 'reset') {
    const sessionId = request.sessionId ?? 'default'
    const state = createHeadlessGame(request.config ?? {})
    sessions.set(sessionId, state)

    return {
      ok: true,
      sessionId,
      ...createStepResponse(state),
    }
  }

  if (request.command === 'step') {
    const sessionId = request.sessionId ?? 'default'
    const state = getSession(sessionId)
    const nextState = stepHeadlessGame(state, request.action)
    sessions.set(sessionId, nextState)

    return {
      ok: true,
      sessionId,
      ...createStepResponse(nextState),
    }
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
