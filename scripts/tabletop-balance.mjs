// Actual browser search self-play, with fixed simulation budgets and durable evidence.
// node scripts/tabletop-balance.mjs <rules> <draft|five-hand-discard> [games=500] [samples=16] [seed=21000000] [normal|wild] [output]
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { createHeadlessGame, stepHeadlessGame, getLegalActions } from '../src/game/headlessGame.js'
import { searchDecision, SEARCH_AI_VERSION } from '../src/game/searchAi.js'
import { TABLETOP_THRESHOLDS, PROTOTYPE_ABILITY_RULES, MAIN_ABILITY_RULES, MAIN_ABILITY_SHIELD_COST as TABLETOP_SHIELD_COST } from '../src/game/tabletop.js'
import { getCoreCards, getExpandedCoreDeck } from '../src/game/cards.js'
import { simulateBattle } from '../src/game/engine.js'
import { configureBalanceVariant, battleAnalysisProfile } from './balance-variants.mjs'
import { chooseResearchAiDecision, getResearchAiProfile } from '../src/game/researchAi.js'

const [variantName = 'abilities-main', mode = 'draft', gamesArg = '500', samplesArg = '16', seedArg = '31000000', deck = 'normal', output = '.ai-runs/normal-balance-2026-10-21', label = ''] = process.argv.slice(2)
if (deck !== 'normal') throw new Error('Balance studies require Normal Deck. Wild is an unbalanced fun mode; old Wild evidence is archival only.')
const variant = configureBalanceVariant(variantName)
const { rules } = variant
const games = Number(gamesArg), samples = Number(samplesArg), seed = Number(seedArg)
if (!['draft', 'five-hand-discard'].includes(mode)
  || !['normal', 'wild'].includes(deck) || !Number.isInteger(games) || games < 1
  || !Number.isInteger(samples) || samples < 1 || samples > 256 || !Number.isSafeInteger(seed)) throw new Error('Invalid study arguments')
if (!/^[a-z0-9-]*$/.test(label)) throw new Error('Invalid run label')
const dir = path.join(output, `${variantName}-${mode}-${deck}-${samples}${label ? `-${label}` : ''}`)
fs.mkdirSync(dir, { recursive: true })
if (fs.existsSync(path.join(dir, 'games.jsonl'))) throw new Error(`Refusing to overwrite evidence: ${dir}`)
const gameFile = fs.openSync(path.join(dir, 'games.jsonl'), 'wx')
const decisionFile = fs.openSync(path.join(dir, 'decisions.jsonl'), 'wx')
const sourceFiles = [...fs.readdirSync('src/game').filter((f) => f.endsWith('.js')).map((f) => `src/game/${f}`),
  'data/cards.json', 'data/tabletop-cards.json', 'data/dan-opening.json', 'data/dan-pairs.json', 'data/dan-round3-net.json', 'data/david-opponents.json', 'data/david-opponents.meta.json',
  'scripts/tabletop-balance.mjs', 'scripts/balance-variants.mjs'].sort()
const sourceHashes = Object.fromEntries(sourceFiles.map((file) => [file, createHash('sha256').update(fs.readFileSync(file)).digest('hex')]))
const sourceHash = createHash('sha256').update(JSON.stringify(sourceHashes)).digest('hex')
const pool = getExpandedCoreDeck({ tabletop: rules, wildDeck: false })
const poolCounts = Object.fromEntries(getCoreCards({ tabletop: rules }).map((c) => [c.id, pool.filter((p) => p.id === c.id).length]))
assert.ok(getCoreCards({ tabletop: rules }).every((c) => poolCounts[c.id] === c.copies))
const manifest = { variant: variantName, title: variant.title, rules, mode, games, samples, seed, deck, label, searchVersion: SEARCH_AI_VERSION, sourceHash, sourceHashes,
  poolSize: pool.length, poolCounts,
  thresholds: TABLETOP_THRESHOLDS, abilities: PROTOTYPE_ABILITY_RULES, flexible: MAIN_ABILITY_RULES, shieldCosts: TABLETOP_SHIELD_COST,
  policy: mode === 'five-hand-discard' ? 'both seats: DavidBot Discard, adaptive probability preparation' : 'both seats: DanBot Draft, frozen opening/scalar pair ranking, subset net pick3, search128 picks4–5, adaptive probability preparation',
  researchAi: getResearchAiProfile(mode), samplesArgumentApplies: false,
  startedAt: new Date().toISOString() }
fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2))
const options = { minSamples: samples, maxSamples: samples, timeBudgetMs: 1e12, rollout: 'prep-lookahead' }
const definitions = new Map(getCoreCards().map((card) => [card.id, card]))
const compact = (cards) => cards.map(({ id, uid }) => ({ id, uid }))
let roots = 0, simulations = 0, ties = 0
const examples = []
const started = Date.now()
for (let game = 0; game < games; game++) {
  let state = createHeadlessGame({ tabletop: rules, mode, wildDeck: deck === 'wild', control: 'both', seed: seed + game,
    firstPicker: game % 2 ? 'opponent' : 'player' })
  const initialCards = [...state.game.playerHand, ...state.game.opponentHand, ...(state.game.draftRow ?? []), ...state.game.deck]
  assert.equal(initialCards.length, pool.length)
  assert.equal(new Set(initialCards.map((c) => c.uid)).size, pool.length)
  for (const [id, copies] of Object.entries(poolCounts)) assert.equal(initialCards.filter((c) => c.id === id).length, copies)
  const initialDealHash = createHash('sha256').update(JSON.stringify(compact(initialCards))).digest('hex')
  let step = 0
  while (!state.terminal) {
    if (++step > 200) throw new Error('Study decision guard exceeded')
    const planningSeed = seed + 100000000 + game * 1009 + step * 7919
    const report = await chooseResearchAiDecision(state, { seed: planningSeed })
    roots++
    simulations += report.simulations ?? 0
    const legal = getLegalActions(state)
    const record = { game, step, actor: state.actor, phase: state.preparation ? 'preparation' : state.game.phase,
      hand: compact((state.preparation ?? state.game)[`${state.actor}Hand`]),
      row: compact(state.game.draftRow ?? []), actions: legal.map(({ card, ...action }) => ({ ...action, ...(card ? { cardId: card.id } : {}) })),
      planningSeed, ...report }
    delete record.elapsedMs
    fs.writeSync(decisionFile, `${JSON.stringify(record)}\n`)
    const gap = (report.values[report.chosenIndex] ?? 0) - (report.values[report.baselineIndex] ?? 0)
    if (gap > 0 && !state.preparation) {
      examples.push({ gap, record, state })
      examples.sort((a, b) => b.gap - a.gap)
      examples.splice(3)
    }
    state = stepHeadlessGame(state, report.action)
  }
  const result = state.battleResult
  ties += Number(result.winner === 'tie')
  const hands = [result.playerHand, result.opponentHand]
  // Battle is a reference on the original printed cards; tabletop-only cards have no digital counterpart.
  const comparable = hands.flat().every((card) => definitions.has(card.id))
  const digital = comparable ? simulateBattle(...hands.map((cards) => cards.map((card) => ({ ...definitions.get(card.id), uid: card.uid })))).winner : null
  fs.writeSync(gameFile, `${JSON.stringify({ game, seed: seed + game, initialDealHash, firstPicker: game % 2 ? 'opponent' : 'player', winner: result.winner,
    reason: result.reason, digitalWinner: digital, playerHand: compact(result.playerHand), opponentHand: compact(result.opponentHand),
    player: result.player ?? battleAnalysisProfile(result.playerHand), opponent: result.opponent ?? battleAnalysisProfile(result.opponentHand),
    ...(!rules ? { battleRounds: result.rounds.length, playerTotalDamageDealt: result.playerTotalDamageDealt, opponentTotalDamageDealt: result.opponentTotalDamageDealt } : {}) })}\n`)
  if ((game + 1) % 25 === 0 || game + 1 === games) {
    const progress = { completed: game + 1, games, roots, simulations, ties, seconds: (Date.now() - started) / 1000 }
    fs.writeFileSync(path.join(dir, 'progress.json'), JSON.stringify(progress, null, 2))
    console.log(JSON.stringify({ variant: variantName, rules, mode, deck, samples, ...progress }))
  }
}
fs.closeSync(gameFile)
fs.closeSync(decisionFile)
// Recheck the largest departures from the heuristic with independent 256-world searches.
// Selection is deliberately diagnostic: these are not an unbiased policy-strength sample.
const decisions = examples.map(({ gap, record, state }, index) => ({ gap, original: record,
  confirmation: searchDecision(state.game, state.actor, { ...options, minSamples: 256, maxSamples: 256, seed: seed + 800000000 + index }),
  root: state.game }))
fs.writeFileSync(path.join(dir, 'decision-probes.json'), JSON.stringify(decisions, null, 2))
fs.writeFileSync(path.join(dir, 'complete.json'), JSON.stringify({ ...manifest, roots, simulations, ties, seconds: (Date.now() - started) / 1000 }, null, 2))
