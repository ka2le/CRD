// Recheck a saved diagnostic root with actual search on BOTH continuations.
// Usage: node scripts/replay-tabletop-probe.mjs <run-directory> [probe-index=0] [samples=64]
import fs from 'node:fs'
import path from 'node:path'
import { stepHeadlessGame } from '../src/game/headlessGame.js'
import { searchDecision, searchPreparationDecision } from '../src/game/searchAi.js'
const [dir, indexArg = '0', samplesArg = '64'] = process.argv.slice(2)
const probe = JSON.parse(fs.readFileSync(path.join(dir, 'decision-probes.json'), 'utf8'))[Number(indexArg)]
if (!probe) throw new Error('Probe not found')
const samples = Number(samplesArg)
const options = { minSamples: samples, maxSamples: samples, timeBudgetMs: 1e12, rollout: 'prep-lookahead' }
const results = {}
for (const [label, action] of Object.entries({ baseline: probe.original.actions[probe.original.baselineIndex], confirmed: probe.confirmation.action })) {
  let state = { config: { mode: probe.root.mode, control: 'both', wildDeck: true }, game: structuredClone(probe.root),
    history: [], decisions: { player: 0, opponent: 0 }, actor: probe.original.actor, preparation: null, terminal: false, battleResult: null }
  state = stepHeadlessGame(state, action.type === 'draft-pick' ? { type: action.type, uid: action.uid } : action)
  const trace = [{ actor: probe.original.actor, action }]
  for (let step = 0; !state.terminal; step++) {
    if (step > 100) throw new Error('Continuation guard exceeded')
    const seed = 900000000 + Number(indexArg) * 1000 + step
    const report = state.preparation ? searchPreparationDecision(state.preparation, state.game, state.actor, { ...options, seed })
      : searchDecision(state.game, state.actor, { ...options, seed })
    const cards = [...(state.preparation ?? state.game)[`${state.actor}Hand`], ...(state.preparation?.[`${state.actor}Discard`] ?? []), ...(state.game.draftRow ?? [])]
    trace.push({ actor: state.actor, action: report.action,
      source: cards.find((c) => c.uid === report.action.sourceUid)?.id,
      target: cards.find((c) => c.uid === report.action.targetUid)?.id,
      samples: report.samples, values: report.values })
    state = stepHeadlessGame(state, report.action)
  }
  const r = state.battleResult
  results[label] = { winner: r.winner, reason: r.reason, player: r.player, opponent: r.opponent,
    playerHand: r.playerHand.map((c) => c.id), opponentHand: r.opponentHand.map((c) => c.id), trace }
}
const output = path.join(dir, `searched-replay-${indexArg}.json`)
fs.writeFileSync(output, JSON.stringify({ game: probe.original.game, rootActor: probe.original.actor, samples,
  note: 'One actual saved root/deal, fixed-budget searched continuations for both players. Diagnostic only; not an unbiased strength estimate.', results }, null, 2))
console.log(JSON.stringify({ output, game: probe.original.game, rootActor: probe.original.actor,
  baseline: { winner: results.baseline.winner, scores: [results.baseline.player.score, results.baseline.opponent.score] },
  confirmed: { winner: results.confirmed.winner, scores: [results.confirmed.player.score, results.confirmed.opponent.score] } }))
