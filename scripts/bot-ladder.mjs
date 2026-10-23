// Plays two browser opponents against each other on seeded tabletop (or digital) deals.
// Usage: node scripts/bot-ladder.mjs <botA> <botB> [mode] [games] [rules] [firstSeed]
//   bots: rolf | inga | sven | david ; David falls back to Sven in Draft.
//   INGA_SAMPLES / INGA_MARGIN override IngaBot's budget for calibration runs.
import { createHeadlessGame, stepHeadlessGame, chooseHeadlessBaselineAction } from '../src/game/headlessGame.js'
import { searchDecision, searchPreparationDecision } from '../src/game/searchAi.js'
import { BOT_SEARCH_PROFILES, getDecisionOptions } from '../src/game/opponentAi.js'
import { searchDavidDecision } from '../src/game/davidBot.js'

const [botA = 'inga', botB = 'rolf', mode = 'draft', gamesArg = '100', rules = 'abilities-main', seedArg = '700000'] = process.argv.slice(2)
const games = Number(gamesArg)
const firstSeed = Number(seedArg)
if (![botA, botB].every((bot) => ['rolf', 'inga', 'sven', 'david'].includes(bot))) throw new Error('Unknown bot')
const override = process.env.INGA_SAMPLES ? Number(process.env.INGA_SAMPLES) : null
const profile = (bot) => {
  if (bot === 'rolf') return null
  const base = BOT_SEARCH_PROFILES[bot === 'sven' || bot === 'david' ? 'search' : 'shallow']
  const decision = getDecisionOptions(base.decision, mode)
  if (bot !== 'inga' || !override) return { ...base, decision }
  return { ...base, decision: { ...decision, minSamples: override, maxSamples: override, ...(process.env.INGA_MARGIN ? { margin: Number(process.env.INGA_MARGIN) } : {}) } }
}

let scoreA = 0
let decisions = 0
for (let game = 0; game < games; game += 1) {
  // Swap seats every other game so seat/first-picker effects cancel.
  const aSeat = game % 2 ? 'player' : 'opponent'
  let state = createHeadlessGame({ mode, control: 'both', tabletop: rules === 'digital' ? false : rules,
    seed: firstSeed + Math.floor(game / 2), firstPicker: Math.floor(game / 2) % 2 ? 'opponent' : 'player' })
  while (!state.terminal) {
    const bot = state.actor === aSeat ? botA : botB
    const config = profile(bot)
    let action = chooseHeadlessBaselineAction(state)
    decisions += 1
    if (bot === 'david' && !state.preparation && mode === 'five-hand-discard') {
      action = (await searchDavidDecision(state)).action
    } else if (config && !state.preparation) {
      action = searchDecision(state.game, state.actor, { ...config.decision, seed: firstSeed * 7 + decisions }).action
    } else if (config && state.preparation && config.preparation) {
      action = searchPreparationDecision(state.preparation, state.game, state.actor, { ...config.preparation, seed: firstSeed * 13 + decisions }).action
    }
    state = stepHeadlessGame(state, action)
  }
  const { winner } = state.battleResult
  scoreA += winner === 'tie' ? 0.5 : (winner === aSeat ? 1 : 0)
}
const score = scoreA / games
console.log(JSON.stringify({ botA, botB, mode, rules, games, scoreA: Number(score.toFixed(4)), stdErr: Number(Math.sqrt(score * (1 - score) / games).toFixed(4)) }))
