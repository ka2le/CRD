// Exact empirical W-L against all opponents. Group by the shield value that
// affects our score, then query sorted enemy scores instead of comparing each.
function bound(values, target, inclusive) {
  let lo = 0, hi = values.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (values[mid] < target || (inclusive && values[mid] === target)) lo = mid + 1
    else hi = mid
  }
  return lo
}

export function createOpponentScoreEvaluator(tt, enemies) {
  const grouped = new Map()
  for (const enemy of enemies) {
    if (!grouped.has(enemy.shields)) grouped.set(enemy.shields, { shields: enemy.shields, enemies: [], cache: new Map() })
    grouped.get(enemy.shields).enemies.push(enemy)
  }
  const stats = { groups: grouped.size, queries: 0 }
  function evaluate(hand) {
    const type = tt.chooseTabletopType(hand), shield = tt.getTabletopProfile(hand).shields
    let value = 0
    for (const group of grouped.values()) {
      if (!group.cache.has(shield)) {
        const scores = [[], []]
        for (const enemy of group.enemies) {
          const result = tt.scoreTabletopHand(enemy.hand, shield, enemy.type)
          scores[Number(Boolean(result.winsTies))].push(result.score)
        }
        scores.forEach((list) => list.sort((a, b) => a - b))
        group.cache.set(shield, { scores, values: [new Map(), new Map()] })
      }
      const own = tt.scoreTabletopHand(hand, group.shields, type)
      const bucket = group.cache.get(shield), values = bucket.values[Number(Boolean(own.winsTies))]
      if (!values.has(own.score)) {
        let result = 0
        for (const [winsTies, list] of bucket.scores.entries()) {
          const lower = bound(list, own.score, false), upper = bound(list, own.score, true)
          result += lower - (list.length - upper)
          if (Boolean(own.winsTies) !== Boolean(winsTies)) result += (upper - lower) * (own.winsTies ? 1 : -1)
        }
        values.set(own.score, result)
      }
      value += values.get(own.score)
      stats.queries++
    }
    return value / enemies.length
  }
  return { evaluate, stats }
}
