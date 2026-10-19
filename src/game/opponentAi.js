// Opponent selection for the browser game, plus the Search AI request client.
import { searchDecision, searchSidePreparation } from './searchAi.js'
import { chooseDiscardIds, pickBestCardForHand } from './cardEvaluator.js'
import { completeOpponentPreBattle } from './preBattle.js'

export const OPPONENT_AI_OPTIONS = [
  { id: 'rules', label: 'Rules AI (Easy)' },
  { id: 'search', label: 'Search AI (Medium)' },
]

export const DEFAULT_OPPONENT_AI = 'rules'

export function normalizeOpponentAi(value) {
  return OPPONENT_AI_OPTIONS.some((option) => option.id === value) ? value : DEFAULT_OPPONENT_AI
}

// Worker budget: enough samples to clearly beat the Rules AI on desktop and phones.
const WORKER_OPTIONS = { minSamples: 16, maxSamples: 128, timeBudgetMs: 600 }
// Main-thread fallback (no worker support / offline before the worker was cached): keep it short.
const INLINE_OPTIONS = { minSamples: 8, maxSamples: 24, timeBudgetMs: 200 }
// Preparation: one search per step (activate which special / target, skip, finish).
const WORKER_PREPARATION_OPTIONS = { minSamples: 16, maxSamples: 96, timeBudgetMs: 250 }
const INLINE_PREPARATION_OPTIONS = { minSamples: 8, maxSamples: 16, timeBudgetMs: 80 }
const PREPARATION_KEYS = ['playerHand', 'opponentHand', 'deck', 'playerDiscard', 'opponentDiscard',
  'playerActivated', 'opponentActivated', 'playerFinished', 'opponentFinished', 'playerDrawnCount', 'opponentDrawnCount']
const WORKER_TIMEOUT_MS = 5000

let worker = null
let workerBroken = false
let nextRequestId = 1
const pending = new Map()

function failAllPending(reason) {
  pending.forEach(({ reject }) => reject(new Error(reason)))
  pending.clear()
}

function getWorker() {
  if (workerBroken || typeof Worker === 'undefined') return null
  if (worker) return worker
  try {
    worker = new Worker(new URL('./searchAi.worker.js', import.meta.url), { type: 'module' })
    worker.onmessage = (event) => {
      const { id, ok, action, preparation, error } = event.data ?? {}
      const request = pending.get(id)
      if (!request) return
      pending.delete(id)
      if (ok) request.resolve(preparation ?? action)
      else request.reject(new Error(error ?? 'Search worker failed'))
    }
    worker.onerror = (event) => {
      event.preventDefault?.()
      workerBroken = true
      worker?.terminate()
      worker = null
      failAllPending('Search worker unavailable')
    }
    return worker
  } catch {
    workerBroken = true
    return null
  }
}

// Strip UI bookkeeping so the snapshot is small and structured-clone safe.
function snapshotGame(game) {
  const snapshot = { ...game }
  delete snapshot.recentMoves
  delete snapshot.opponentDebug
  return snapshot
}

function rulesFallback(game) {
  if (game.mode === 'draft') {
    return { type: 'draft-pick', uid: pickBestCardForHand(game.draftRow, game.opponentHand)?.uid }
  }
  return { type: 'discard', selectedIds: chooseDiscardIds(game.opponentHand, { discardCount: 2 }) }
}

function inlineSearch(game) {
  try {
    return searchDecision(game, 'opponent', INLINE_OPTIONS).action
  } catch {
    return rulesFallback(game)
  }
}

function requestFromWorker(game, message = { game: snapshotGame(game), side: 'opponent', options: WORKER_OPTIONS }) {
  const instance = getWorker()
  if (!instance) return Promise.reject(new Error('No search worker'))
  const id = nextRequestId++
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      if (!pending.has(id)) return
      pending.delete(id)
      reject(new Error('Search worker timed out'))
    }, WORKER_TIMEOUT_MS)
    pending.set(id, {
      resolve: (action) => { clearTimeout(timeoutId); resolve(action) },
      reject: (error) => { clearTimeout(timeoutId); reject(error) },
    })
    instance.postMessage({ id, ...message })
  })
}

/**
 * Ask the Search AI for the opponent's draft pick or discard selection.
 * Always resolves: worker → short main-thread search → Rules AI choice.
 */
export function requestOpponentSearchAction(game) {
  return requestFromWorker(game).catch(() => new Promise((resolve) => {
    // Yield first so a pending animation frame can paint before the inline search.
    setTimeout(() => resolve(inlineSearch(game)), 0)
  }))
}

// Only the shared preparation fields (no UI bookkeeping) cross into the worker.
function snapshotPreparation(preBattle) {
  return Object.fromEntries(PREPARATION_KEYS.map((key) => [key, preBattle[key]]))
}

function opponentPreparationPatch(preparation) {
  return {
    opponentHand: preparation.opponentHand,
    opponentDiscard: preparation.opponentDiscard,
    opponentActivated: preparation.opponentActivated,
    opponentFinished: preparation.opponentFinished,
    opponentDrawnCount: preparation.opponentDrawnCount,
    deck: preparation.deck,
  }
}

function inlinePreparation(preparation, game) {
  try {
    return searchSidePreparation(preparation, game, 'opponent', INLINE_PREPARATION_OPTIONS).preparation
  } catch {
    return completeOpponentPreBattle(preparation)
  }
}

/**
 * Ask the Search AI to play the opponent's whole pre-battle preparation (order, targets,
 * skip/finish), searched step by step. Resolves with the opponent's preparation fields.
 * Always resolves: worker → short main-thread search → Rules AI preparation.
 */
export function requestOpponentPreparation(preBattle, game) {
  const preparation = snapshotPreparation(preBattle)
  const message = { kind: 'preparation', preparation, game: snapshotGame(game), side: 'opponent',
    options: WORKER_PREPARATION_OPTIONS }
  return requestFromWorker(game, message)
    .catch(() => new Promise((resolve) => {
      setTimeout(() => resolve(inlinePreparation(preparation, game)), 0)
    }))
    .then(opponentPreparationPatch)
}
