const FACTIONS = ['critter', 'robot', 'dragon', 'monster']

function poolSortKey(card) {
  // Shields stay with shield specials even when they also supply a stat.
  if (card.effect?.shield || card.id === 'shield_is_dmg') return [9, 0, card.id]
  if (card.type === 'stat') {
    const factions = [...new Set(card.stats ?? [])]
    const faction = factions.length === 1 ? FACTIONS.indexOf(factions[0]) : -1
    return faction >= 0 ? [faction * 2, card.stats.length, card.id] : [8, 0, card.id]
  }
  const faction = FACTIONS.indexOf(card.effect?.dmgType)
  if (faction >= 0) return [faction * 2 + 1, card.effect?.dmg ?? 0, card.id]
  return [10, 0, card.id]
}

// Each faction's stats (single and double), then attacks (including ultimates),
// followed by combined stats, shield specials, and other specials.
export function sortTwentyPool(pool) {
  return [...pool].sort((a, b) => {
    const left = poolSortKey(a)
    const right = poolSortKey(b)
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1
    }
    return 0
  })
}
