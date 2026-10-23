import { simulateBattle } from './engine.js'

// Ready Battle hands repeat on their cooldown cycle. Compile using the official
// resolver, then compare numeric cycles without allocating fifty battle logs.
export function compileCombatCycle(hand) {
  const period = hand.every((card) => !card.cd || (Number.isInteger(card.cd) && 6 % card.cd === 0)) ? 6 : 50
  const { rounds } = simulateBattle(hand, [], { maxRounds: period, damageToWin: Number.MAX_SAFE_INTEGER })
  return { damage: rounds.map((r) => r.playerOutgoingDamage), shield: rounds.map((r) => r.playerShield) }
}

export function compareCombatCycles(a, b) {
  let dealt = 0, taken = 0
  for (let round = 0; round < 50; round++) {
    const i = round % a.damage.length, j = round % b.damage.length
    dealt += Math.max(a.damage[i] - b.shield[j], 0)
    taken += Math.max(b.damage[j] - a.shield[i], 0)
    if (dealt >= 21 || taken >= 21) return dealt > taken ? 1 : dealt < taken ? -1 : 0
  }
  return 0
}
