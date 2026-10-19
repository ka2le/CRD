import { getTabletopProfile, scoreTabletopHand, chooseTabletopType } from './tabletop.js'

export function evaluateTabletopHand(hand) {
  const profile = getTabletopProfile(hand)
  const score = scoreTabletopHand(hand, 0, chooseTabletopType(hand)).score
  // Modest unfinished-engine value keeps stats/attacks useful before a pair exists.
  const potential = Object.entries(profile.stats).reduce((sum, [type, count]) => sum + Math.sqrt(count)
    + hand.filter((card) => card.effect?.dmgType === type).length * 0.6, 0)
  const preparation = hand.reduce((sum, card) => sum + ({ draw_2_extra: 3, copy_card_in_hand: 3, recycle_card: 1.5, draw_all_new_1: 0.5 }[card.id] ?? 0), 0)
  return score * 10 + potential * 2 + profile.shields * 5 + preparation * 10
}

export function chooseTabletopDiscards(hand, discardCount = 2) {
  const keepCount = Math.max(0, hand.length - discardCount)
  let best = [], bestScore = -Infinity
  function visit(index, kept) {
    if (kept.length === keepCount) {
      const score = evaluateTabletopHand(kept)
      if (score > bestScore) { best = kept; bestScore = score }
      return
    }
    if (index >= hand.length || kept.length + hand.length - index < keepCount) return
    visit(index + 1, [...kept, hand[index]])
    visit(index + 1, kept)
  }
  visit(0, [])
  const keptIds = new Set(best.map((card) => card.uid))
  return hand.filter((card) => !keptIds.has(card.uid)).map((card) => card.uid)
}
