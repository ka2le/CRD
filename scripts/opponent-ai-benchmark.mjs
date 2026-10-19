// Plays Search AI (opponent seat) against Rules AI (player seat) on seeded deals and
// reports the Search AI's score plus per-decision timing.
// Usage: node scripts/opponent-ai-benchmark.mjs [mode] [games] [maxSamples] [timeBudgetMs] [firstSeed] [prep]
//   prep: "search" (default, current browser Search AI) or "rules" (Rules AI preparation)
import { createHeadlessGame, stepHeadlessGame, chooseHeadlessBaselineAction } from '../src/game/headlessGame.js'
import { searchDecision, searchPreparationDecision } from '../src/game/searchAi.js'

const mode = process.argv[2] ?? 'draft'
const games = Number(process.argv[3] ?? 50)
const maxSamples = Number(process.argv[4] ?? 48)
const timeBudgetMs = Number(process.argv[5] ?? 650)
const firstSeed = Number(process.argv[6] ?? 900000)
const prepMode = process.argv[7] ?? 'search'

let wins = 0
let draws = 0
let losses = 0
const times = []
const prepTimes = []
const samples = []
let differs = 0
let prepDiffers = 0
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
    } else if (state.actor === 'opponent' && prepMode === 'search') {
      const result = searchPreparationDecision(state.preparation, state.game, 'opponent', { seed: firstSeed * 13 + game * 101 + decisions })
      decisions += 1
      if (result.samples) {
        prepTimes.push(result.elapsedMs)
        if (result.chosenIndex !== result.baselineIndex) prepDiffers += 1
      }
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
const p95 = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length * 0.95)] ?? 0
const sorted = [...times].sort((a, b) => a - b)
const score = (wins + draws / 2) / games
console.log(JSON.stringify({
  mode, games, maxSamples, timeBudgetMs, prep: prepMode,
  searchWins: wins, draws, searchLosses: losses,
  searchScore: Number(score.toFixed(4)),
  stdErr: Number(Math.sqrt(score * (1 - score) / games).toFixed(4)),
  handBuildingDecisions: times.length, changedFromRules: differs,
  msMean: Number(mean(times).toFixed(1)), msP95: Number(p95(times).toFixed(1)),
  msMax: Number((sorted.at(-1) ?? 0).toFixed(1)),
  samplesMean: Number(mean(samples).toFixed(1)),
  prepSearches: prepTimes.length, prepChangedFromRules: prepDiffers,
  prepMsMean: Number(mean(prepTimes).toFixed(1)), prepMsP95: Number(p95(prepTimes).toFixed(1)),
}))
