// Design experiment only. Does not change game rules or the browser.
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { getCoreCards, expandCardPool, createSeededRng } from '../src/game/cards.js'
import { simulateBattle, getHandStats, getActionDamage, doesCardTrigger } from '../src/game/engine.js'

const cards = getCoreCards()
const byId = new Map(cards.map(card => [card.id, card]))
const hand = ids => ids.map((id, index) => ({ ...byId.get(id), uid: `${id}-${index}` }))
const gcd = (a, b) => b ? gcd(b, a % b) : a
const lcm = (a, b) => a * b / gcd(a, b)
const shieldOf = h => h.reduce((sum, c) => sum + (c.effect?.shield ?? 0), 0)

// A compiled, repeating damage profile. Current hands/stats never change in combat.
function profile(h, enemyShield = 0) {
  const stats = getHandStats(h)
  const cycle = h.reduce((period, c) => c.type === 'action' && c.cd > 0 ? lcm(period, c.cd) : period, 1)
  const damage = Array.from({ length: cycle }, (_, i) => {
    const r = i + 1
    const triggered = h.filter(c => doesCardTrigger(c, r))
    const shield = triggered.reduce((s, c) => s + (c.effect?.shield ?? 0), 0)
    const multiplier = 2 ** triggered.filter(c => c.id === 'double_dmg').length
    return Math.max(0, h.reduce((s, c) => s + getActionDamage(c, stats, r, { shieldTotal: shield }), 0) * multiplier - enemyShield)
  })
  return { damage, cycle, average: damage.reduce((a, b) => a + b, 0) / cycle }
}

function finish(p) {
  let total = 0
  for (let r = 1; r <= 50; r++) {
    total += p.damage[(r - 1) % p.cycle]
    if (total >= 21 - 1e-9) return { round: r, total }
  }
  return { round: Infinity, total }
}

function winner(a, b) {
  if (a.round !== b.round) return a.round < b.round ? 'player' : 'opponent'
  if (a.round === Infinity || Math.abs(a.total - b.total) < 1e-8) return 'tie'
  return a.total > b.total ? 'player' : 'opponent'
}

function exact(a, b) {
  const fa = finish(profile(a, shieldOf(b)))
  const fb = finish(profile(b, shieldOf(a)))
  return { winner: winner(fa, fb), a: fa, b: fb }
}

// Diagnostic: compress every source into the largest source rhythm, retaining
// true long-run raw damage (including punch synchronization). Fractional hits
// are intentional here: this is an optimistic accuracy test, not final rules.
function collapsedProfile(h, enemyShield = 0) {
  const stats = getHandStats(h)
  const ownShield = shieldOf(h)
  const raw = profile(h)
  const contributions = new Map()
  for (const c of h) {
    if (c.cd <= 0 || c.type !== 'action' || c.id === 'double_dmg') continue
    let sum = 0
    for (let r = 1; r <= raw.cycle; r++) {
      const mult = 2 ** h.filter(d => d.id === 'double_dmg' && doesCardTrigger(d, r)).length
      sum += getActionDamage(c, stats, r, { shieldTotal: ownShield }) * mult
    }
    contributions.set(c.cd, (contributions.get(c.cd) ?? 0) + sum / raw.cycle)
  }
  const rhythm = [...contributions].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 1
  const hit = Math.max(0, raw.average * rhythm - enemyShield)
  return { damage: Array.from({ length: rhythm }, (_, i) => i === rhythm - 1 ? hit : 0), cycle: rhythm }
}

const examples = [
  ['Robots win on 4 at equal raw average', ['robot1','robot1','robot1','robot_attack','robot_attack'], ['dragon1','dragon1','dragon1','dragons_breath','dragons_breath']],
  ['Critters win on 5 at equal raw average', ['rabbit2','rabbit2','critter1','swarm','draw_2_extra'], ['dragon2','dragon2','dragon1','dragons_breath','draw_2_extra']],
  ['Lower power Critters beat higher power Dragons', ['rabbit2','rabbit2','critter1','swarm','draw_2_extra'], ['dragon1','dragon1','dragon1','dragons_breath','dragons_breath']],
  ['Shield reverses focused Critter/Dragon race', ['critter1','critter1','swarm','swarm','shield2'], ['dragon1','dragon1','dragons_breath','dragons_breath','shield2']],
  ['Bite lets Dragons beat Critters on 4', ['dragon2','dragon2','dragon1','dragons_breath','bite'], ['rabbit2','rabbit2','critter1','swarm','robot1']],
  ['Moving support onto Dragon rhythm evades shields', ['dragon2','dragon1','dragons_breath','bite','shield2'], ['robot1','robot1','robot_attack','robot_attack','shield2']],
  ['Mixed timing cannot be inherited from lead', ['critter1','swarm','dragon1','dragons_breath','shield2'], ['critter1','critter1','swarm','swarm','shield2']],
]

const exampleResults = examples.map(([name, idsA, idsB]) => {
  const a = hand(idsA), b = hand(idsB)
  const old = simulateBattle(a, b)
  const compiled = exact(a, b)
  assert.equal(compiled.winner, old.winner)
  const ca = finish(collapsedProfile(a, shieldOf(b)))
  const cb = finish(collapsedProfile(b, shieldOf(a)))
  return { name, idsA, idsB, rawAverage: [profile(a).average, profile(b).average], exact: compiled, battleRound: old.rounds.length, battleTotals: [old.playerTotalDamageDealt, old.opponentTotalDamageDealt], collapsed: { winner: winner(ca, cb), a: ca, b: cb } }
})

const singleAttackTables = Array.from({ length: 12 }, (_, index) => {
  const power = index + 1
  return { power, shield0: [1,2,3].map(cd => finish({ cycle: cd, damage: Array.from({ length: cd }, (_, i) => i === cd - 1 ? power * cd : 0) })), shield1: [1,2,3].map(cd => finish({ cycle: cd, damage: Array.from({ length: cd }, (_, i) => i === cd - 1 ? Math.max(0, power * cd - 2) : 0) })) }
})

const coreIds = new Set(['critter1','robot1','dragon1','rabbit2','robot2','dragon2','robot_critter','robot_dragon','dragon_rabbit','joker','swarm','robot_attack','dragons_breath','shield2'])
function study(wild, coreOnly, n = 10000) {
  const pool = expandCardPool(cards.filter(c => (c.type === 'stat' || c.cd > 0) && (!coreOnly || coreIds.has(c.id))), { wildDeck: wild })
  const rng = createSeededRng(20261018 + Number(wild) + 10 * Number(coreOnly))
  const counts = { tested: 0, collapsedMismatch: 0, averageMismatch: 0, focused: 0, focusedMismatch: 0, mixed: 0, mixedMismatch: 0, withPunch: 0, withPunchMismatch: 0, exactTie: 0, collapsedTie: 0 }
  const failures = []
  const signature = h => {
    const stats = getHandStats(h)
    return new Set(h.filter(c => c.cd > 0 && getActionDamage(c, stats, c.cd, { shieldTotal: shieldOf(h) }) > 0).map(c => c.cd)).size
  }
  while (counts.tested < n) {
    const copy = [...pool]
    for (let i = 0; i < 10; i++) {
      const j = i + Math.floor(rng() * (copy.length - i))
      ;[copy[i], copy[j]] = [copy[j], copy[i]]
    }
    const a = copy.slice(0, 5), b = copy.slice(5, 10)
    if (!profile(a).average || !profile(b).average) continue
    const result = exact(a, b)
    const pa = profile(a, shieldOf(b)), pb = profile(b, shieldOf(a))
    const fa = finish(collapsedProfile(a, shieldOf(b))), fb = finish(collapsedProfile(b, shieldOf(a)))
    const cw = winner(fa, fb)
    // Optimistic average comparator: uses exact post-shield average, ties stay ties.
    const aw = Math.abs(pa.average - pb.average) < 1e-9 ? 'tie' : pa.average > pb.average ? 'player' : 'opponent'
    const mismatch = cw !== result.winner
    counts.tested++
    counts.collapsedMismatch += Number(mismatch)
    counts.averageMismatch += Number(aw !== result.winner)
    const kind = signature(a) === 1 && signature(b) === 1 ? 'focused' : 'mixed'
    counts[kind]++
    counts[`${kind}Mismatch`] += Number(mismatch)
    if ([...a, ...b].some(c => c.id === 'double_dmg')) {
      counts.withPunch++
      counts.withPunchMismatch += Number(mismatch)
    }
    counts.exactTie += Number(result.winner === 'tie')
    counts.collapsedTie += Number(cw === 'tie')
    if (mismatch && failures.length < 5) failures.push({ a: a.map(c=>c.id), b: b.map(c=>c.id), exact: result, collapsed: { winner: cw, a: fa, b: fb } })
    if (counts.tested <= 1000) {
      const engine = simulateBattle(a,b)
      assert.equal(result.winner, engine.winner)
      assert.equal(Math.min(result.a.round, result.b.round, 50), engine.rounds.length)
    }
  }
  return { wild, coreOnly, ...counts, failures }
}

const studies = [study(false,true), study(true,true), study(false,false), study(true,false)]

// Estimate the footprint of a physical exact lookup for five-card hands. Each
// signature is the actual burst in CD1/2/3/4 groups, plus number of Punch cards.
function enumerateSignatures(coreOnly) {
  const pool = cards.filter(c => (c.type === 'stat' || c.cd > 0) && (!coreOnly || coreIds.has(c.id)))
  const signatures = new Set()
  let legalMultisets = 0
  function visit(start, h, used) {
    if (h.length === 5) {
      legalMultisets++
      const stats = getHandStats(h), shield = shieldOf(h)
      const bursts = [1,2,3,4].map(cd => h.filter(c => c.cd === cd && c.id !== 'double_dmg').reduce((s,c) => s + getActionDamage(c, stats, cd, { shieldTotal: shield }), 0))
      signatures.add([...bursts, h.filter(c=>c.id==='double_dmg').length].join(','))
      return
    }
    for (let i = start; i < pool.length; i++) {
      const copies = pool[i].copies === 1 ? 3 : pool[i].copies
      if ((used[i] ?? 0) >= copies) continue
      used[i] = (used[i] ?? 0) + 1
      visit(i, [...h, pool[i]], used)
      used[i]--
    }
  }
  visit(0, [], {})
  return { coreOnly, wild: true, handSize: 5, legalMultisets, signatures: signatures.size }
}

const lookupFootprint = [enumerateSignatures(true), enumerateSignatures(false)]
const report = { date: '2026-10-18', description: 'Random physical five-card combat-only deals conditioned on both hands having raw damage. No draft/discard policies or preparation. Diagnostic agreement, not win rates or balance validation.', examples: exampleResults, singleAttackTables, studies, lookupFootprint }
writeFileSync(new URL('../docs/tabletop-combat-study.json', import.meta.url), JSON.stringify(report, (_, value) => value === Infinity ? 'never' : value, 2) + '\n')
console.log(JSON.stringify({ examples: exampleResults.map(({name,exact,collapsed})=>({name,exact,collapsed})), studies: studies.map(({failures,...rest})=>rest), lookupFootprint }, (_, value) => value === Infinity ? 'never' : value, 2))
