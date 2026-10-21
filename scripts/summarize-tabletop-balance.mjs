import fs from 'node:fs'
import path from 'node:path'
import { getCoreCards } from '../src/game/cards.js'
import { toTabletopCard, scoreTabletopHand, chooseTabletopType } from '../src/game/tabletop.js'

const [root = '.ai-runs/tabletop-confirmed-2026-10-21', destination = 'docs/TABLETOP_BALANCE_RESULTS.md'] = process.argv.slice(2)
const classes = ['critter', 'robot', 'dragon']
const pct = (n) => `${(100 * n).toFixed(1)}%`
const mean = (xs) => xs.reduce((sum, n) => sum + n, 0) / xs.length
function summary(xs) {
  if (!xs.length) return { n: 0, score: null, interval: null }
  const score = mean(xs)
  const se = xs.length > 1 ? Math.sqrt(xs.reduce((sum, x) => sum + (x - score) ** 2, 0) / (xs.length * (xs.length - 1))) : 0
  return { n: xs.length, score, interval: [Math.max(0, score - 1.96 * se), Math.min(1, score + 1.96 * se)] }
}
const reports = []
for (const name of fs.readdirSync(root).sort()) {
  const dir = path.join(root, name)
  if (!fs.existsSync(path.join(dir, 'complete.json'))) continue
  const run = JSON.parse(fs.readFileSync(path.join(dir, 'complete.json'), 'utf8'))
  const games = fs.readFileSync(path.join(dir, 'games.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
  if (games.length !== run.games) throw new Error(`Incomplete data: ${name}`)
  const value = (g, side) => g.winner === 'tie' ? 0.5 : Number(g.winner === side)
  const hands = games.flatMap((g) => ['player', 'opponent'].map((side) => ({ ...g[side],
    cards: g[`${side}Hand`], value: value(g, side), rival: g[side === 'player' ? 'opponent' : 'player'].damageType })))
  const factions = Object.fromEntries(classes.map((type) => {
    const all = hands.filter((h) => h.damageType === type)
    const nonmirror = all.filter((h) => classes.includes(h.rival) && h.rival !== type)
    return [type, { appearances: all.length, share: all.length / hands.length, averagePower: mean(all.map((h) => h.base)),
      averageScore: mean(all.map((h) => h.score)), ...summary(nonmirror.map((h) => h.value)),
      noEnemyShield: summary(nonmirror.filter((h) => h.enemyShields === 0).map((h) => h.value)),
      enemyShield: summary(nonmirror.filter((h) => h.enemyShields > 0).map((h) => h.value)),
      naturalMain: summary(nonmirror.filter((h) => h.dominantTypes.includes(type)).map((h) => h.value)),
      wins: nonmirror.filter((h) => h.value === 1).length, draws: nonmirror.filter((h) => h.value === 0.5).length,
      losses: nonmirror.filter((h) => h.value === 0).length }]
  }))
  const matchups = Object.fromEntries(classes.flatMap((a, i) => classes.slice(i + 1).map((b) => {
    const xs = hands.filter((h) => h.damageType === a && h.rival === b).map((h) => h.value)
    return [`${a} vs ${b}`, { ...summary(xs), wins: xs.filter((x) => x === 1).length, draws: xs.filter((x) => x === 0.5).length, losses: xs.filter((x) => x === 0).length }]
  })))
  const strategies = Object.fromEntries([
    ['Adapt', (h) => Boolean(h.adaptedUid)],
    ['Reconfigure stat→attack', (h) => h.reconfigured?.direction === 'stat-to-attack'],
    ['Reconfigure attack→stat', (h) => h.reconfigured?.direction === 'attack-to-stat'],
    ['Perfect Balance earned', (h) => h.rules === 'abilities' && h.bonus > 0],
    ['Overwhelming earned', (h) => Boolean(h.overwhelming)],
    ['Chameleon', (h) => h.hasChameleon],
    ['Shortcut', (h) => h.shortcuts > 0],
    ['Draw 2 in final hand', (h) => h.cards.some((c) => c.id === 'draw_2_extra')],
    ['6+ final cards', (h) => h.cards.length >= 6],
  ].map(([label, filter]) => {
    const selected = hands.filter(filter)
    return [label, { n: selected.length, share: selected.length / hands.length, score: selected.length ? mean(selected.map((h) => h.value)) : null }]
  }))
  const comparable = games.filter((g) => g.digitalWinner !== null)
  let dragonBonusCounterfactual = null
  if (run.rules === 'abilitiesv2') {
    let changedWinners = 0
    const affected = []
    for (const g of games) {
      const p = g.player.score - g.player.bonus, o = g.opponent.score - g.opponent.bonus
      const winner = p === o ? (Boolean(g.player.winsTies) === Boolean(g.opponent.winsTies) ? 'tie' : g.player.winsTies ? 'player' : 'opponent')
        : p > o ? 'player' : 'opponent'
      changedWinners += Number(winner !== g.winner)
      for (const side of ['player', 'opponent']) if (g[side].overwhelming) affected.push(winner === 'tie' ? 0.5 : Number(winner === side))
    }
    dragonBonusCounterfactual = { changedWinners, affectedHands: affected.length, scoreWithoutBonus: mean(affected) }
  }
  const choices = { searchedRoots: 0, departures: 0, discardCounts: {}, draftPicks: {}, preparation: {} }
  for (const line of fs.readFileSync(path.join(dir, 'decisions.jsonl'), 'utf8').trim().split('\n')) {
    const d = JSON.parse(line)
    if (d.samples > 0) {
      choices.searchedRoots++
      choices.departures += Number(d.chosenIndex !== d.baselineIndex)
    }
    const a = d.action
    if (a.type === 'discard') choices.discardCounts[a.selectedIds.length] = (choices.discardCounts[a.selectedIds.length] ?? 0) + 1
    if (a.type === 'draft-pick') choices.draftPicks[a.card.id] = (choices.draftPicks[a.card.id] ?? 0) + 1
    if (a.type === 'prepare') choices.preparation[a.cardId] = (choices.preparation[a.cardId] ?? 0) + 1
  }
  const probes = JSON.parse(fs.readFileSync(path.join(dir, 'decision-probes.json'), 'utf8')).map((probe) => {
    const { original: o, confirmation: c } = probe
    const rank = o.actions.map((action, i) => ({ action, originalValue: o.values[i], confirmationValue: c.values[i], counts: c.counts[i] }))
      .sort((a, b) => b.confirmationValue - a.confirmationValue)
    return { game: o.game, phase: o.phase, hand: o.hand.map((x) => x.id), row: o.row.map((x) => x.id), originalChoice: o.action,
      confirmedChoice: c.action, baseline: o.actions[o.baselineIndex], pairedSE: c.pairedBaselineStdErr,
      chosenGap: c.values[c.chosenIndex] - c.values[c.baselineIndex], rank }
  })
  reports.push({ ...run, name, drawRate: games.filter((g) => g.winner === 'tie').length / games.length,
    critterTiebreaks: games.filter((g) => g.reason === 'critter-tiebreak').length,
    zeroScoreTiebreaks: games.filter((g) => g.reason === 'critter-tiebreak' && g.player.score === 0).length,
    playerScore: mean(games.map((g) => value(g, 'player'))),
    firstPickerScore: run.mode === 'draft' ? mean(games.map((g) => value(g, g.firstPicker))) : null,
    digitalComparable: comparable.length, digitalAgreement: comparable.length ? comparable.filter((g) => g.winner === g.digitalWinner).length / comparable.length : null,
    untypedHands: hands.filter((h) => !h.damageType).length, factions, matchups, strategies, dragonBonusCounterfactual, choices, probes })
}
fs.writeFileSync(path.join(root, 'summary.json'), JSON.stringify(reports, null, 2))
const lines = ['# Tabletop balance study — 2026-10-21', '',
  'Search self-play using the actual browser search and mode-specific decks. This is an initial observational balance study, not proof of optimal play or a measurement of fun.', '',
  'Confirmed rules: ordinary attacks 1/stat; ultimates 2/stat; Bite 1. Threshold: 1/4/7 power → +1/+2/+4 after shields. Abilities: Adapt, Robot-main Perfect Balance +3, Dragon power 7+ → +1 stat. Abilities v2: Critter-main wins ties, Robot Reconfigure, Dragon power 7+ → +4. Shield costs remain 2/1/0; unit-valued hybrid/shield attacks retain their whole-number formulas.', '',
  '## Method', '',
  '- Both seats use browser search, including preparation, with fixed samples per candidate and prep-lookahead completions. No neural training. Actual decks include Chameleon; only Threshold includes Shortcut and 2×.',
  '- Distinct deal seeds per game; Draft first picker alternates. The same seed ranges are reused across rules, but different decks can produce different deals. Discard follows the existing sequential browser AI flow with hidden rival hands, not the simultaneous online submission flow.',
  '- Faction means chosen main damage type after preparation, including Chameleon/Devour overrides. Faction share is descriptive. Non-mirror score = wins + half draws divided by games against other main factions (untyped rivals excluded); it is not a causal estimate of choosing that faction.',
  '- Approximate 95% intervals use per-game non-mirror outcomes (one hand of a given faction per such game). Mirror hands are excluded from faction score to avoid double counting. Strategy groups overlap and can include both hands, so their scores are descriptive without independent-sample confidence claims.',
  '- Search rollouts are correlated counterfactual continuations, not independent played games. The three largest search departures from the heuristic per run are rechecked with independent 256-world searches; selection makes these diagnostic examples, not strength evidence.',
  '- Battle agreement compares the same final original printed cards using digital rounds. Games containing tabletop-only cards are excluded. Different winners are acceptable and do not measure strategic balance.', '',
  '## Overall results', '', '| Rules | Building | Deck | Samples | Games | Draws | Critter tie wins | P1 score |', '|---|---|---|---:|---:|---:|---:|---:|']
for (const r of reports) lines.push(`| ${r.rules} | ${r.mode} | ${r.deck} | ${r.samples} | ${r.games} | ${pct(r.drawRate)} | ${r.critterTiebreaks} | ${pct(r.playerScore)} |`)
for (const r of reports) {
  lines.push('', `## ${r.rules} / ${r.mode} / ${r.deck} / ${r.samples} samples`, '',
    `${r.games} games; ${r.roots.toLocaleString('en-US')} actual decision roots; ${r.simulations.toLocaleString('en-US')} root-candidate completions (nested preparation lookaheads are additional). ${r.firstPickerScore !== null ? `First-picker score: ${pct(r.firstPickerScore)}. ` : ''}Battle agreement: ${pct(r.digitalAgreement ?? 0)} of ${r.digitalComparable} comparable games.`, '',
    '| Main faction | Hand share | Non-mirror W/D/L | Score | Approx. 95% interval | Mean power |', '|---|---:|---:|---:|---:|---:|')
  for (const [f, s] of Object.entries(r.factions)) lines.push(`| ${f} | ${pct(s.share)} | ${s.wins}/${s.draws}/${s.losses} | ${s.n ? pct(s.score) : '—'} | ${s.n ? s.interval.map(pct).join('–') : '—'} | ${(s.averagePower ?? 0).toFixed(2)} |`)
  lines.push('', `Untyped hands: ${r.untypedHands} of ${2 * r.games}.`, '', '| Faction | No opposing shield: score (n) | Opposing shield: score (n) | Natural main type: score (n) |', '|---|---:|---:|---:|')
  for (const [f, s] of Object.entries(r.factions)) lines.push(`| ${f} | ${[s.noEnemyShield, s.enemyShield, s.naturalMain].map((x) => x.n ? `${pct(x.score)} (${x.n})` : '—').join(' | ')} |`)
  lines.push('', '| Matchup | W/D/L for first faction | Score |', '|---|---:|---:|')
  for (const [m, s] of Object.entries(r.matchups)) lines.push(`| ${m} | ${s.wins}/${s.draws}/${s.losses} | ${s.n ? pct(s.score) : '—'} |`)
  lines.push('', '| Mechanism / hand feature | Hands | Share | Descriptive score |', '|---|---:|---:|---:|')
  for (const [m, s] of Object.entries(r.strategies)) if (s.n) lines.push(`| ${m} | ${s.n} | ${pct(s.share)} | ${pct(s.score)} |`)
  if (r.dragonBonusCounterfactual) lines.push('', `Holding these final hands and main-type choices fixed, removing only the v2 Dragon bonus from both sides changes ${r.dragonBonusCounterfactual.changedWinners}/${r.games} winners. The ${r.dragonBonusCounterfactual.affectedHands} Overwhelming hands score ${pct(r.dragonBonusCounterfactual.scoreWithoutBonus)} without that bonus, versus ${pct(r.strategies['Overwhelming earned'].score)} with it. This is a mechanical comparison, not a new-policy tournament. Critter tiebreaks at zero score: ${r.zeroScoreTiebreaks}.`)
  lines.push('', `Search departed from the heuristic at ${r.choices.departures}/${r.choices.searchedRoots} searched roots (${pct(r.choices.departures / r.choices.searchedRoots)}).`)
  if (r.mode === 'five-hand-discard') lines.push(`Discard size frequencies (number discarded: decisions): ${Object.entries(r.choices.discardCounts).map(([size, n]) => `${size}: ${n}`).join('; ')}.`)
  else lines.push(`Most frequent draft picks: ${Object.entries(r.choices.draftPicks).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, n]) => `${id} (${n})`).join(', ')}. These counts also reflect card availability.`)
  lines.push('', 'Decision probes (values are P(win) − P(loss), conditional on the search completion policy):', '')
  for (const p of r.probes) lines.push(`- Game ${p.game}, ${p.phase}; hand: ${p.hand.join(', ')}. Baseline ${JSON.stringify(p.baseline)}. Independent search chooses ${JSON.stringify(p.confirmedChoice)}; advantage ${p.chosenGap.toFixed(3)} ± ${(1.96 * p.pairedSE).toFixed(3)} (approx. 95% paired Monte Carlo interval).`)
}
const definitions = new Map(getCoreCards().map((c) => [c.id, c]))
lines.push('', '## Matched-deal search-budget check', '', 'Additional Abilities v2 games compare 16 versus 32 sampled worlds on the same fresh starting deals. Both seats use the budget under test. This checks outcome stability, not head-to-head AI strength. Subsequent hands can diverge because the policies make different choices.', '',
  '| Building | Paired deals | Draws at 16 | Draws at 32 | Draw-rate change, approximate paired 95% interval |', '|---|---:|---:|---:|---:|')
for (const high of reports.filter((r) => r.samples === 32)) {
  const low = reports.find((r) => r.samples === 16 && r.mode === high.mode && r.seed === high.seed && r.games === high.games)
  if (!low) continue
  const read = (r) => fs.readFileSync(path.join(root, r.name, 'games.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
  const lo = read(low), hi = read(high)
  const delta = hi.map((g, i) => {
    if (g.seed !== lo[i].seed) throw new Error('Budget check deals are not paired')
    return Number(g.winner === 'tie') - Number(lo[i].winner === 'tie')
  })
  const change = mean(delta)
  const error = 1.96 * Math.sqrt(delta.reduce((sum, x) => sum + (x - change) ** 2, 0) / (delta.length * (delta.length - 1)))
  lines.push(`| ${high.mode} | ${hi.length} | ${pct(low.drawRate)} | ${pct(high.drawRate)} | ${(100 * change).toFixed(1)} pp (${(100 * (change - error)).toFixed(1)} to ${(100 * (change + error)).toFixed(1)}) |`)
}
const ordinary = { critter: 'swarm', robot: 'robot_attack', dragon: 'dragons_breath' }
const ultimates = { critter: 'murder_rabbit', robot: 'robot_ulti', dragon: 'dragon_ulti' }
const doubleStats = { critter: 'rabbit2', robot: 'robot2', dragon: 'dragon2' }
lines.push('', '## Engine examples', '', 'Unshielded pure engines, calculated with the same resolver. These isolate the rule mechanics, not the difficulty of drafting the cards. Equal v2 scores favor Critters against the other factions.', '',
  '| Engine | Rules | Critter score | Robot score | Dragon score |', '|---|---|---:|---:|---:|')
for (const [label, stats, attacks, ultimate] of [['4 single stats + 1 attack', 4, 1, false], ['1 stat + 4 attacks', 1, 4, false], ['3 stats + 2 attacks', 3, 2, false], ['Two double-stat cards + ultimate', 2, 1, true]]) {
  for (const rules of ['threshold', 'abilities', 'abilitiesv2']) {
    const scores = classes.map((type) => {
      const ids = [...Array(stats).fill(ultimate ? doubleStats[type] : `${type}1`), ...Array(attacks).fill(ultimate ? ultimates[type] : ordinary[type])]
      const hand = ids.map((id, i) => toTabletopCard({ ...definitions.get(id), uid: `${id}-${i}` }, rules))
      return scoreTabletopHand(hand, 0, chooseTabletopType(hand)).score
    })
    lines.push(`| ${label} | ${rules} | ${scores.join(' | ')} |`)
  }
}
lines.push('', '## Evidence and reproduction', '',
  `Local raw evidence: \`${root}\`. Each run saves manifest/rules/source hash, every game and final scoring breakdown, every decision and candidate values/WDL, progress, and complete root snapshots for decision probes. Summary: \`${root}/summary.json\`. Pilot/interrupted runs in other directories are excluded.`, '',
  '```powershell', 'node scripts/tabletop-balance.mjs abilitiesv2 draft 500 16 21000000 wild .ai-runs/new-study',
  'node scripts/summarize-tabletop-balance.mjs .ai-runs/new-study docs/TABLETOP_BALANCE_RESULTS.md', '```', '')
const interpretation = path.join(root, 'interpretation.md')
if (fs.existsSync(interpretation)) lines.splice(lines.indexOf('## Method'), 0, fs.readFileSync(interpretation, 'utf8').trim(), '')
fs.writeFileSync(destination, lines.join('\n'))
console.log(JSON.stringify({ completedRuns: reports.length, games: reports.reduce((n, r) => n + r.games, 0), destination }))
