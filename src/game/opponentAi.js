// Opponent selection for the browser game, plus the Search AI request client.
import { searchDecision, searchSidePreparation } from './searchAi.js'
import { chooseDiscardIds, pickBestCardForHand } from './cardEvaluator.js'
import { completeOpponentPreBattle } from './preBattle.js'
import { requestDavidAction } from './davidBotClient.js'
import { chooseDanDecision } from './danBot.js'
import { chooseFelixDecision } from './felixBot.js'
import { completeFastPreparation } from './fastPreparation.js'

// Ids stay 'rules' / 'search' so saved settings keep working; the names are what players see.
export const OPPONENT_AI_OPTIONS = [
  { id: 'rules', name: 'RolfBot', label: 'RolfBot (Easy)' },
  { id: 'shallow', name: 'IngaBot', label: 'IngaBot (Medium)' },
  { id: 'search', name: 'SvenBot', label: 'SvenBot (Hard)' },
  { id: 'dan', name: 'DanBot', label: 'DanBot (Hard)' },
  { id: 'felix', name: 'FelixBot', label: 'FelixBot (Hard)' },
  { id: 'david', name: 'DavidBot', label: 'DavidBot (Very Hard)' },
]

export function getOpponentAiOptions(mode) {
  return OPPONENT_AI_OPTIONS.filter(option => mode === 'five-hand-discard' ? !['dan', 'felix'].includes(option.id) : option.id !== 'david')
}

export const DEFAULT_OPPONENT_AI = 'dan'

export function normalizeOpponentAi(value) {
  return OPPONENT_AI_OPTIONS.some((option) => option.id === value) ? value : DEFAULT_OPPONENT_AI
}

// Dan/David are one linked choice; common bots (including Sven) follow the player
// across modes. Keep the per-mode storage fields compatible with older saves.
export function normalizeOpponentSettings(current, patch = {}) {
  const next = { ...current, ...patch }
  const active = current.opponentAi ?? (current.gameMode === 'five-hand-discard' ? current.discardOpponentAi : current.draftOpponentAi)
  const selected = normalizeOpponentAi(Object.hasOwn(patch, 'opponentAi') ? patch.opponentAi : active)
  const linked = selected === 'dan' || selected === 'david'
  const keepFelix = !Object.hasOwn(patch, 'opponentAi') && current.draftOpponentAi === 'felix' && selected === 'david'
  next.discardOpponentAi = linked || selected === 'felix' ? 'david' : selected
  next.draftOpponentAi = keepFelix ? 'felix' : linked ? 'dan' : selected
  next.opponentAi = next.gameMode === 'five-hand-discard' ? next.discardOpponentAi : next.draftOpponentAi
  return next
}

export function getOpponentAiName(id) {
  return (OPPONENT_AI_OPTIONS.find((option) => option.id === id) ?? OPPONENT_AI_OPTIONS[0]).name
}

// Bots that search (everything except RolfBot, which plays the Rules AI directly).
export function isSearchOpponentAi(id) {
  return id === 'dan' || id === 'felix' || id === 'david' || Boolean(BOT_SEARCH_PROFILES[id])
}

// Search budgets per bot. `decision` covers draft picks / discard passes, `preparation` each
// pre-battle step (null = Rules AI preparation). `inline` is the short main-thread fallback.
//   SvenBot: many samples, rollouts look one preparation step ahead.
//   IngaBot: a shallow search - a handful of samples, Rules AI plays every rollout, Rules AI
//            preparation; discard passes keep the Rules AI choice unless clearly beaten.
//            Sits between RolfBot and SvenBot (measure with scripts/bot-ladder.mjs).
// `decision` may be split per mode: { draft, discard }.
export const BOT_SEARCH_PROFILES = {
  search: {
    decision: { minSamples: 16, maxSamples: 128, timeBudgetMs: 600 },
    inline: { minSamples: 8, maxSamples: 24, timeBudgetMs: 200 },
    preparation: { minSamples: 16, maxSamples: 96, timeBudgetMs: 250 },
    inlinePreparation: { minSamples: 8, maxSamples: 16, timeBudgetMs: 80 },
  },
  shallow: {
    decision: {
      draft: { minSamples: 4, maxSamples: 4, timeBudgetMs: 0, rollout: 'rules' },
      discard: { minSamples: 8, maxSamples: 8, timeBudgetMs: 0, rollout: 'rules', margin: 0.25 },
    },
    inline: {
      draft: { minSamples: 4, maxSamples: 4, timeBudgetMs: 0, rollout: 'rules' },
      discard: { minSamples: 8, maxSamples: 8, timeBudgetMs: 0, rollout: 'rules', margin: 0.25 },
    },
    preparation: null,
    inlinePreparation: null,
  },
}
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

// Search options for this decision: a profile entry is either one option set or { draft, discard }.
export function getDecisionOptions(options, mode) {
  if (!options?.draft && !options?.discard) return options
  return mode === 'draft' ? options.draft : options.discard
}

function inlineSearch(game, profile) {
  try {
    return searchDecision(game, 'opponent', getDecisionOptions(profile.inline, game.mode)).action
  } catch {
    return rulesFallback(game)
  }
}

function requestFromWorker(game, message) {
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
 * Sven/Inga resolve through their existing fallback. David errors are surfaced
 * to the player for retry; a slow David turn must never silently become Sven.
 */
export function requestOpponentSearchAction(game, bot = 'search', options = {}) {
  if (bot === 'david' && game.mode === 'five-hand-discard') return requestDavidAction(snapshotGame(game), options)
  if ((bot === 'dan' || bot === 'felix') && game.mode === 'draft') {
    const choose = bot === 'felix' ? chooseFelixDecision : chooseDanDecision
    return requestFromWorker(game, { game: snapshotGame(game), side: 'opponent', bot })
      .catch(() => new Promise((resolve, reject) => setTimeout(() => {
        try { resolve(choose(game).action) } catch (error) { reject(error) }
      }, 0)))
  }
  const profile = BOT_SEARCH_PROFILES[bot] ?? BOT_SEARCH_PROFILES.search
  const message = { game: snapshotGame(game), side: 'opponent', options: getDecisionOptions(profile.decision, game.mode) }
  return requestFromWorker(game, message).catch(() => new Promise((resolve) => {
    // Yield first so a pending animation frame can paint before the inline search.
    setTimeout(() => resolve(inlineSearch(game, profile)), 0)
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

function inlinePreparation(preparation, game, profile) {
  if (!profile.inlinePreparation) return completeOpponentPreBattle(preparation)
  try {
    return searchSidePreparation(preparation, game, 'opponent', profile.inlinePreparation).preparation
  } catch {
    return completeOpponentPreBattle(preparation)
  }
}

/**
 * Ask the Search AI to play the opponent's whole pre-battle preparation (order, targets,
 * skip/finish), searched step by step. Resolves with the opponent's preparation fields.
 * Always resolves: worker → short main-thread search → Rules AI preparation.
 */
export function requestOpponentPreparation(preBattle, game, bot = 'search') {
  if (bot === 'dan' || bot === 'felix' || bot === 'david') {
    const preparation = snapshotPreparation(preBattle)
    const options = bot === 'felix' ? { discardSixLookup: false } : {}
    return requestFromWorker(game, { kind: 'fast-preparation', preparation, game: snapshotGame(game), side: 'opponent', options })
      .catch(() => completeFastPreparation(preparation, game, 'opponent', options).then(r => r.preparation))
      .then(opponentPreparationPatch)
  }
  const profile = BOT_SEARCH_PROFILES[bot] ?? BOT_SEARCH_PROFILES.search
  const preparation = snapshotPreparation(preBattle)
  if (!profile.preparation) {
    // Rules AI preparation (IngaBot): instant, but still async like the searching bots.
    return Promise.resolve(opponentPreparationPatch(completeOpponentPreBattle(preparation)))
  }
  const message = { kind: 'preparation', preparation, game: snapshotGame(game), side: 'opponent',
    options: profile.preparation }
  return requestFromWorker(game, message)
    .catch(() => new Promise((resolve) => {
      setTimeout(() => resolve(inlinePreparation(preparation, game, profile)), 0)
    }))
    .then(opponentPreparationPatch)
}
