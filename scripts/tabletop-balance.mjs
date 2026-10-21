// Actual browser search self-play, with fixed simulation budgets and durable evidence.
// node scripts/tabletop-balance.mjs <rules> <draft|five-hand-discard> [games=500] [samples=16] [seed=21000000] [normal|wild] [output]
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createHeadlessGame, stepHeadlessGame, getLegalActions } from '../src/game/headlessGame.js'
import { searchDecision, searchPreparationDecision, SEARCH_AI_VERSION } from '../src/game/searchAi.js'
import { TABLETOP_RULES, TABLETOP_THRESHOLDS, ABILITY_RULES, FLEXIBLE_RULES } from '../src/game/tabletop.js'
import { getCoreCards } from '../src/game/cards.js'
import { simulateBattle } from '../src/game/engine.js'

const [rules = 'abilitiesv2', mode = 'draft', gamesArg = '500', samplesArg = '16', seedArg = '21000000', deck = 'wild', output = '.ai-runs/tabletop-2026-10-21', label = ''] = process.argv.slice(2)
const games = Number(gamesArg), samples = Number(samplesArg), seed = Number(seedArg)
if (!TABLETOP_RULES.includes(rules) || !['draft', 'five-hand-discard'].includes(mode)
  || !['normal', 'wild'].includes(deck) || !Number.isInteger(games) || games < 1
  || !Number.isInteger(samples) || samples < 1 || samples > 256 || !Number.isSafeInteger(seed)) throw new Error('Invalid study arguments')
if (!/^[a-z0-9-]*$/.test(label)) throw new Error('Invalid run label')
const dir = path.join(output, `${rules}-${mode}-${deck}-${samples}${label ? `-${label}` : ''}`)
fs.mkdirSync(dir, { recursive: true })
if (fs.existsSync(path.join(dir, 'games.jsonl'))) throw new Error(`Refusing to overwrite evidence: ${dir}`)
const gameFile = fs.openSync(path.join(dir, 'games.jsonl'), 'wx')
const decisionFile = fs.openSync(path.join(dir, 'decisions.jsonl'), 'wx')
const sourceHash = createHash('sha256').update(['tabletop.js', 'tabletopAi.js', 'searchAi.js', 'headlessGame.js', 'cards.js', 'preparationState.js']
  .map((file) => fs.readFileSync(new URL(`../src/game/${file}`, import.meta.url))).reduce((a, b) => Buffer.concat([a, b]), Buffer.alloc(0))).digest('hex')
const manifest = { rules, mode, games, samples, seed, deck, label, searchVersion: SEARCH_AI_VERSION, sourceHash,
  thresholds: TABLETOP_THRESHOLDS, abilities: ABILITY_RULES, flexible: FLEXIBLE_RULES,
  policy: 'both seats: browser search, prep-lookahead, fixed samples; baseline tie preference',
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
  let step = 0
  while (!state.terminal) {
    if (++step > 200) throw new Error('Study decision guard exceeded')
    const planningSeed = seed + 100000000 + game * 1009 + step * 7919
    const report = state.preparation
      ? searchPreparationDecision(state.preparation, state.game, state.actor, { ...options, seed: planningSeed })
      : searchDecision(state.game, state.actor, { ...options, seed: planningSeed })
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
  fs.writeSync(gameFile, `${JSON.stringify({ game, seed: seed + game, firstPicker: game % 2 ? 'opponent' : 'player', winner: result.winner,
    reason: result.reason, digitalWinner: digital, playerHand: compact(result.playerHand), opponentHand: compact(result.opponentHand),
    player: result.player, opponent: result.opponent })}\n`)
  if ((game + 1) % 25 === 0 || game + 1 === games) {
    const progress = { completed: game + 1, games, roots, simulations, ties, seconds: (Date.now() - started) / 1000 }
    fs.writeFileSync(path.join(dir, 'progress.json'), JSON.stringify(progress, null, 2))
    console.log(JSON.stringify({ rules, mode, deck, samples, ...progress }))
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
