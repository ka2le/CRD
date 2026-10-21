import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { getCoreCards, getExpandedCoreDeck } from '../src/game/cards.js'

const [root = '.ai-runs/tabletop-confirmed-2026-10-21', destination = 'docs/TABLETOP_CARD_ANALYSIS.md'] = process.argv.slice(2)
const labels = {
  critter1: 'Critter stat ×1', rabbit2: 'Critter stat ×2', swarm: 'Basic Critter attack (all art)', murder_rabbit: 'Murder Rabbit',
  robot1: 'Robot stat ×1', robot2: 'Robot stat ×2', robot_attack: 'Basic Robot attack', robot_ulti: 'Robot Ultimate',
  dragon1: 'Dragon stat ×1', dragon2: 'Dragon stat ×2', dragons_breath: 'Dragon Breath', dragon_ulti: 'Dragon Ultimate', devour: 'Devour',
  robot_critter: 'Robot + Critter stat', robot_dragon: 'Robot + Dragon stat', dragon_rabbit: 'Dragon + Critter stat', joker: 'Joker (all three stats)',
  one_off_each: 'One of Each (C × R × D)', any_off_each: 'Any of Each (C + R + D)', shield2: 'Shield ×2', shield_is_dmg: 'Shield Is Damage',
  bite: 'Bite', chameleon: 'Chameleon', draw_2_extra: 'Draw 2', draw_all_new_1: 'Redraw', copy_card_in_hand: 'Copy', recycle_card: 'Recycle',
  shortcut: 'Shortcut', double_dmg: '2× bonus',
}
const prepIds = ['copy_card_in_hand', 'draw_2_extra', 'draw_all_new_1', 'recycle_card']
const pct = (v) => v === null ? '—' : `${(v * 100).toFixed(1)}%`
const ratio = (a, b) => b ? a / b : null
const readLines = (p) => fs.readFileSync(p, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse)
function tally(hands) {
  const wins = hands.filter((h) => h.outcome === 'win').length
  const losses = hands.filter((h) => h.outcome === 'loss').length
  const draws = hands.length - wins - losses
  return { hands: hands.length, wins, draws, losses, winRate: ratio(wins, hands.length), score: ratio(wins + draws / 2, hands.length) }
}
function summarize(hands, ids, games) {
  const total = tally(hands)
  const cards = Object.fromEntries(ids.map((id) => {
    const stages = Object.fromEntries(['final', 'ready', 'activated'].map((stage) => {
      const selected = hands.filter((h) => h[stage].includes(id))
      const s = tally(selected)
      return [stage, { ...s, presence: ratio(s.hands, total.hands), inWinners: ratio(s.wins, total.wins), inLosers: ratio(s.losses, total.losses),
        inDraws: ratio(s.draws, total.draws), winnerLoserGap: ratio(s.wins - s.losses, total.wins),
        copies: hands.reduce((n, h) => n + h[stage].filter((x) => x === id).length, 0) }]
    }))
    // Pair each winner with its own loser. Equal presence on both sides cancels.
    const decisive = games.filter((g) => g.winner !== 'tie')
    const differences = decisive.map((g) => {
      const winner = g[`${g.winner}Hand`], loser = g[`${g.winner === 'player' ? 'opponent' : 'player'}Hand`]
      return Number(winner.some((c) => c.id === id)) - Number(loser.some((c) => c.id === id))
    })
    const mean = differences.reduce((a, b) => a + b, 0) / differences.length
    const se = Math.sqrt(differences.reduce((n, x) => n + (x - mean) ** 2, 0) / (differences.length * (differences.length - 1)))
    assert.ok(Math.abs(stages.final.winnerLoserGap - mean) < 1e-12)
    return [id, { label: labels[id] ?? id, ...stages, pairedGapInterval: [mean - 1.96 * se, mean + 1.96 * se] }]
  }))
  const factions = Object.fromEntries(['critter', 'robot', 'dragon', 'untyped'].map((f) => {
    const selected = hands.filter((h) => h.faction === f)
    const t = tally(selected)
    const nonmirror = tally(selected.filter((h) => h.rival !== f && h.rival !== 'untyped' && f !== 'untyped'))
    return [f, { ...t, presence: t.hands / total.hands, shareOfWins: ratio(t.wins, total.wins), nonmirror }]
  }))
  assert.equal(Object.values(factions).reduce((n, x) => n + x.wins, 0), total.wins)
  assert.equal(total.wins, total.losses)
  const features = Object.fromEntries([
    ['Joker + One of Each', (h) => h.final.includes('joker') && h.final.includes('one_off_each')],
    ['Joker without One of Each', (h) => h.final.includes('joker') && !h.final.includes('one_off_each')],
    ['One of Each without Joker', (h) => !h.final.includes('joker') && h.final.includes('one_off_each')],
    ['Neither Joker nor One of Each', (h) => !h.final.includes('joker') && !h.final.includes('one_off_each')],
    ['Dragon ×2 + Dragon Ultimate/Devour', (h) => h.final.includes('dragon2') && h.final.some((id) => ['dragon_ulti', 'devour'].includes(id))],
    ['Exactly five final cards', (h) => h.final.length === 5],
    ['Six or more final cards', (h) => h.final.length >= 6],
  ].map(([label, predicate]) => [label, tally(hands.filter(predicate))]))
  return { games: games.length, ...total, factions, cards, features }
}
const reports = [], raw = []
for (const rules of ['threshold', 'abilities', 'abilitiesv2']) for (const mode of ['draft', 'five-hand-discard']) {
  const name = `${rules}-${mode}-wild-16`, dir = path.join(root, name)
  const run = JSON.parse(fs.readFileSync(path.join(dir, 'complete.json'), 'utf8'))
  assert.equal(run.games, 500); assert.equal(run.samples, 16)
  const games = readLines(path.join(dir, 'games.jsonl'))
  assert.equal(games.length, run.games)
  const decisions = readLines(path.join(dir, 'decisions.jsonl'))
  const ready = new Map(), activated = new Map()
  for (const d of decisions) {
    const key = `${d.game}/${d.actor}`
    if (d.phase === 'preparation' && !ready.has(key)) ready.set(key, d.hand.map((c) => c.id))
    if (d.action.type === 'prepare') activated.set(key, [...(activated.get(key) ?? []), d.action.cardId])
  }
  const hands = games.flatMap((g) => ['player', 'opponent'].map((actor) => {
    const key = `${g.game}/${actor}`
    assert.ok(ready.has(key), `Missing preparation entry ${name}/${key}`)
    return { outcome: g.winner === 'tie' ? 'draw' : g.winner === actor ? 'win' : 'loss', faction: g[actor].damageType || 'untyped',
      rival: g[actor === 'player' ? 'opponent' : 'player'].damageType || 'untyped', final: g[`${actor}Hand`].map((c) => c.id),
      ready: ready.get(key), activated: activated.get(key) ?? [] }
  }))
  const definitions = getCoreCards({ tabletop: rules }), ids = definitions.map((c) => c.id)
  for (const h of hands) for (const id of [...h.final, ...h.ready, ...h.activated]) assert.ok(ids.includes(id), `Unknown card ${id}`)
  const report = { name, rules, mode, ...summarize(hands, ids, games) }
  report.deckCopies = Object.fromEntries(definitions.map((c) => [c.id, c.copies > 1 ? c.copies : 3]))
  reports.push(report); raw.push({ rules, games, hands, ids })
}
const v2 = raw.filter((r) => r.rules === 'abilitiesv2')
const pooledV2 = summarize(v2.flatMap((r) => r.hands), v2[0].ids, v2.flatMap((r) => r.games))
const deckComposition = [false, true].map((wildDeck) => {
  const deck = getExpandedCoreDeck({ tabletop: 'abilitiesv2', wildDeck })
  return { deck: wildDeck ? 'Wild' : 'Normal', cards: deck.length,
    printedStatPips: Object.fromEntries(['critter', 'robot', 'dragon'].map((f) => [f, deck.reduce((n, c) => n + c.stats.filter((s) => s === f).length, 0)])),
    ultimateCards: Object.fromEntries([['critter', ['murder_rabbit']], ['robot', ['robot_ulti']], ['dragon', ['dragon_ulti', 'devour']]]
      .map(([f, ids]) => [f, deck.filter((c) => ids.includes(c.id)).length])) }
})
fs.writeFileSync(path.join(root, 'card-analysis.json'), JSON.stringify({ reports, pooledV2, deckComposition }, null, 2))
const lines = ['# Tabletop faction and card analysis — 2026-10-21', '',
  '> ARCHIVAL WILD-DECK ANALYSIS. Wild is an intentionally unbalanced fun mode, not the balance baseline. Use the new Normal Deck comparison for tuning decisions.', '',
  'Reanalysis of the six main Wild Deck arms: 500 games per ruleset/building mode, both players using the in-game search with 16 samples per candidate. 3,000 games / 6,000 final hands. The extra 400 budget-check games are excluded, avoiding repeated deals and mixed search budgets.', '',
  '## Verdict', '',
  'Abilities v2 is promising for low draws and more frequent Critter play, but these games do not establish balance. Dragons have the most wins in both building modes; their advantage against other factions is clearest in Discard. Robots remain competitive in Draft. Critters are improved as a frequently played fallback, but still lose more often than they win. That can fit the intended identity; it does not show whether switching to Critters was the best available decision.', '',
  'Joker has the largest winner-versus-loser presence gap in both v2 modes. One of Each, double Dragon stats, Dragon ultimates, and preparation resources also stand out. Basic Dragon Breath is more frequent among losers despite Dragon faction success: completing a strong engine matters more than simply holding a Dragon attack. Low single-Robot-stat results do not demonstrate that Reconfigure is weak; it can rescue a hand that would otherwise be even worse.', '',
  'The deck is a material caveat: the tested Wild pool reverses the intended Critter advantage in stat availability. Normal contains 16/14/12 printed C/R/D stat pips; Wild contains 18/22/20. Wild increases single-copy cards to three copies, while two-copy cards stay at two. Dragons also have two ultimate-strength definitions (Dragon Ultimate and Devour). This is a reason to test Normal before adjusting the class abilities from these results alone.', '',
  '## How to read the numbers', '',
  '- Faction is the chosen main damage class after preparation, including Chameleon/Devour overrides. Mixed hands still receive one main label. Faction wins include mirror matches; share of wins is different from win rate when that faction is played.',
  '- Card presence counts a hand once if it contains at least one copy. All artwork/copies of the basic Critter attack are grouped as Swarm; ultimates and Bite remain separate. Copies per 100 hands also shows duplication. Stats ×2 means two stat pips on one card.',
  '- All = percentage of all final hands containing the card. Winners / Losers / Draws = percentage within those outcome groups containing it. Win when held = wins divided by all hands holding it, with draws counted as non-wins. These are associations, not the result of replacing another card with this one.',
  '- Ready-hand presence is measured at each player’s first preparation decision, after Draft/Discard. Activated means the card’s preparation action was actually selected at least once, including copies and cards drawn during preparation. Copy transforms and Redraw replaces a hand, so final-hand presence is especially misleading for those cards.',
  '- Deck availability, AI preferences, hand size, combos, and fallback choices affect these results. Both hands in a game are related. JSON includes paired approximate 95% intervals for winner-minus-loser final-card presence; these are exploratory and not corrected for testing many cards.',
  '- No claim of optimal play, Normal Deck balance, human fun, or causal faction strength. Discard uses the existing sequential local AI flow. The pooled v2 table weights Draft and Discard equally; separate tables below are preferable when their patterns differ.', '',
  '## Faction outcomes', '', '| Rules | Building | Main faction | Hands | Wins / draws / losses | Share of all wins | Win when played | Non-mirror score* |',
  '|---|---|---|---:|---:|---:|---:|---:|']
for (const r of reports) for (const [f, s] of Object.entries(r.factions)) lines.push(`| ${r.rules} | ${r.mode === 'draft' ? 'Draft' : 'Discard'} | ${f} | ${s.hands} | ${s.wins} / ${s.draws} / ${s.losses} | ${pct(s.shareOfWins)} | ${pct(s.winRate)} | ${pct(s.nonmirror.score)} |`)
lines.push('', '*Non-mirror score counts a draw as half a win and excludes untyped opponents. Unlike win-when-played, it removes same-faction matchups.', '')
lines.push('## Printed deck composition', '', 'Counts include every printed stat pip, including mixed cards and Joker; preparation and automatic class conversions are excluded. Two-damage attack counts exclude unit-formula specials.', '',
  '| Deck | Cards | Critter stat pips | Robot stat pips | Dragon stat pips | Critter / Robot / Dragon ultimate-strength cards |', '|---|---:|---:|---:|---:|---:|')
for (const d of deckComposition) lines.push(`| ${d.deck} | ${d.cards} | ${d.printedStatPips.critter} | ${d.printedStatPips.robot} | ${d.printedStatPips.dragon} | ${Object.values(d.ultimateCards).join(' / ')} |`)
lines.push('', '## V2 combination and hand-size associations', '', '| Building | Feature | Hands | Wins / draws / losses | Win rate |', '|---|---|---:|---:|---:|')
for (const r of reports.filter((r) => r.rules === 'abilitiesv2')) for (const [label, s] of Object.entries(r.features)) {
  lines.push(`| ${r.mode === 'draft' ? 'Draft' : 'Discard'} | ${label} | ${s.hands} | ${s.wins} / ${s.draws} / ${s.losses} | ${pct(s.winRate)} |`)
}
lines.push('', 'Feature groups overlap except the four mutually exclusive Joker/One of Each groups. These are selected final hands, not controlled tests of adding a card.', '')
function cardTable(r) {
  lines.push('| Card | Present hands | All | Winners | Losers | Draws | Win when held | Copies / 100 hands |', '|---|---:|---:|---:|---:|---:|---:|---:|')
  for (const id of Object.keys(labels)) if (r.cards[id]) {
    const c = r.cards[id], s = c.final
    lines.push(`| ${c.label} | ${s.hands} | ${pct(s.presence)} | ${pct(s.inWinners)} | ${pct(s.inLosers)} | ${pct(s.inDraws)} | ${pct(s.winRate)} | ${(100 * s.copies / r.hands).toFixed(1)} |`)
  }
}
lines.push('## Abilities v2 combined overview', '', `${pooledV2.games} games; ${pooledV2.hands} hands; ${pooledV2.wins} winning hands, ${pooledV2.losses} losing hands, ${pooledV2.draws} drawn hands. Final-hand presence:`, '')
cardTable(pooledV2)
for (const r of reports) {
  lines.push('', `## ${r.rules} — ${r.mode === 'draft' ? 'Draft' : 'Discard'}`, '',
    `${r.games} games / ${r.hands} hands: ${r.wins} winners, ${r.losses} losers, ${r.draws} drawn hands (${r.draws / 2} drawn games).`, '')
  cardTable(r)
  lines.push('', '### Preparation cards: entering preparation and actual use', '',
    '| Card | Ready hands | Ready: winners / losers | Ready: win when held | Activated hands | Activated: wins / draws / losses | Win when activated |',
    '|---|---:|---:|---:|---:|---:|---:|')
  for (const id of prepIds) {
    const c = r.cards[id], s = c.ready, a = c.activated
    lines.push(`| ${c.label} | ${s.hands} (${pct(s.presence)}) | ${pct(s.inWinners)} / ${pct(s.inLosers)} | ${pct(s.winRate)} | ${a.hands} | ${a.wins} / ${a.draws} / ${a.losses} | ${pct(a.winRate)} |`)
  }
  lines.push('', '### All cards entering preparation', '', '| Card | Deck copies | Ready presence | Ready: winners | Ready: losers |', '|---|---:|---:|---:|---:|')
  for (const id of Object.keys(labels)) if (r.cards[id]) {
    const c = r.cards[id], s = c.ready
    lines.push(`| ${c.label} | ${r.deckCopies[id]} | ${pct(s.presence)} | ${pct(s.inWinners)} | ${pct(s.inLosers)} |`)
  }
}
lines.push('', '## Reproduce', '', '```powershell', `node scripts/analyze-tabletop-cards.mjs ${root} ${destination}`, '```', '',
  `Machine-readable counts, rates, and paired intervals: \`${root}/card-analysis.json\`. Original games and decision logs remain unchanged.`, '')
fs.writeFileSync(destination, lines.join('\n'))
console.log(JSON.stringify({ destination, games: reports.reduce((n, r) => n + r.games, 0), v2Factions: reports.filter((r) => r.rules === 'abilitiesv2').map((r) => ({ mode: r.mode, factions: r.factions })) }, null, 2))
