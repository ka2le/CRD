// Plays Search AI (opponent seat) against Rules AI (player seat) on seeded deals and
// reports the Search AI's score plus per-decision timing.
// Usage: node scripts/opponent-ai-benchmark.mjs [mode] [games] [maxSamples] [timeBudgetMs]
import { createHeadlessGame, stepHeadlessGame, chooseHeadlessBaselineAction } from '../src/game/headlessGame.js'
import { searchDecision } from '../src/game/searchAi.js'

const mode = process.argv[2] ?? 'draft'
const games = Number(process.argv[3] ?? 50)
const maxSamples = Number(process.argv[4] ?? 48)
const timeBudgetMs = Number(process.argv[5] ?? 650)
const firstSeed = Number(process.argv[6] ?? 900000)

let wins = 0
let draws = 0
let losses = 0
const times = []
const samples = []
let differs = 0
let decisions = 0

for (let game = 0; game < games; game += 1) {
  let state = createHeadlessGame({
    mode, control: 'both', seed: firstSeed + game, firstPicker: game % 2 ? 'opponent' : 'player',
  })
  while (!state.terminal) {
    let action = chooseHeadlessBaselineAction(state)
    if (state.actor === 'opponent' && !state.preparation) {
      const result = searchDecision(state.game, 'opponent', { maxSamples, timeBudgetMs, seed: firstSeed * 7 + game * 101 + decisions })
      times.push(result.elapsedMs)
      samples.push(result.samples)
      decisions += 1
      if (result.chosenIndex !== result.baselineIndex) differs += 1
      action = result.action
    }
    state = stepHeadlessGame(state, action)
  }
  const winner = state.battleResult.winner
  if (winner === 'opponent') wins += 1
  else if (winner === 'tie') draws += 1
  else losses += 1
}

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1)
const sorted = [...times].sort((a, b) => a - b)
const score = (wins + draws / 2) / games
console.log(JSON.stringify({
  mode, games, maxSamples, timeBudgetMs,
  searchWins: wins, draws, searchLosses: losses,
  searchScore: Number(score.toFixed(4)),
  stdErr: Number(Math.sqrt(score * (1 - score) / games).toFixed(4)),
  decisions, changedFromRules: differs,
  msMean: Number(mean(times).toFixed(1)), msP95: Number((sorted[Math.floor(sorted.length * 0.95)] ?? 0).toFixed(1)),
  msMax: Number((sorted.at(-1) ?? 0).toFixed(1)),
  samplesMean: Number(mean(samples).toFixed(1)),
}))
