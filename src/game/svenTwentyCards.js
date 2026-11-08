import { createSeededRng, shuffle } from './cards.js'
import { getHandAverageDamage, getShieldAverage } from './cardEvaluator.js'
import { getHandStats } from './engine.js'
import { evaluateTabletopHand } from './tabletopAi.js'

export const SVEN_TWENTY_VERSION = 'sven20-exhaustive-disjoint-pair-v1'

export function scoreTwentyCardsHand(hand) {
  if (hand.some(card => card.tabletop)) return evaluateTabletopHand(hand)
  const pips = Object.values(getHandStats(hand)).reduce((sum, n) => sum + Math.sqrt(n), 0)
  const preparation = hand.reduce((sum, card) => sum + ({ draw_2_extra: 3, copy_card_in_hand: 3,
    recycle_card: 1.5, draw_all_new_1: .5 }[card.id] ?? 0), 0)
  return getHandAverageDamage(hand) * 10 + getShieldAverage(hand) * 5 + pips * 2 + preparation * 10
}

// Best five-card candidate in every subset, then one complement lookup per
// candidate. This searches all disjoint pairs without a quadratic pair loop.
export function strongestDisjointPair(candidates, cardCount) {
  if (cardCount < 1 || cardCount > 20) throw Error('Invalid combination pool size')
  const size = 1 << cardCount, full = size - 1
  const best = new Int32Array(size).fill(-1)
  const better = (a, b) => a >= 0 && (b < 0 || candidates[a].score > candidates[b].score)
  candidates.forEach((candidate, index) => { if (better(index, best[candidate.mask])) best[candidate.mask] = index })
  for (let bit = 1; bit < size; bit <<= 1) {
    for (let base = 0; base < size; base += 2 * bit) for (let offset = 0; offset < bit; offset++) {
      const to = base + bit + offset, from = best[base + offset]
      if (better(from, best[to])) best[to] = from
    }
  }
  let pair = null, floor = -Infinity, total = -Infinity
  candidates.forEach((first, i) => {
    const j = best[full ^ first.mask]
    if (j < 0) return
    const nextFloor = Math.min(first.score, candidates[j].score), nextTotal = first.score + candidates[j].score
    if (nextFloor > floor || (nextFloor === floor && nextTotal > total)) {
      pair = [i, j]; floor = nextFloor; total = nextTotal
    }
  })
  if (!pair) throw Error('No disjoint hands in the pool')
  return { pair, floor, total, best }
}

export function chooseSvenTwentyLineup(pool, { seed, rng = seed === undefined ? Math.random : createSeededRng(seed) } = {}) {
  if (pool.length !== 20 || new Set(pool.map(card => card.uid)).size !== 20) throw Error('Sven20Cards requires twenty distinct own cards')
  const cards = [...pool].sort((a, b) => a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0)
  const candidates = []
  for (let a = 0; a < 16; a++) for (let b = a + 1; b < 17; b++) for (let c = b + 1; c < 18; c++)
    for (let d = c + 1; d < 19; d++) for (let e = d + 1; e < 20; e++) {
      const indices = [a, b, c, d, e], hand = indices.map(i => cards[i])
      candidates.push({ indices, mask: indices.reduce((mask, i) => mask | (1 << i), 0), score: scoreTwentyCardsHand(hand) })
    }
  const { pair, floor, total, best } = strongestDisjointPair(candidates, 20)
  const unused = ((1 << 20) - 1) ^ candidates[pair[0]].mask ^ candidates[pair[1]].mask
  const third = best[unused]
  const order = shuffle([...pair, third], { rng })
  return { lineup: order.flatMap(index => candidates[index].indices.map(i => cards[i].uid)),
    scores: order.map(index => candidates[index].score), strongPairFloor: floor, strongPairTotal: total,
    combinations: candidates.length, version: SVEN_TWENTY_VERSION }
}
