import { pickBestCardForHand } from './cardEvaluator.js'

export function pickRandomDraftCardIndex(cards) {
  if (!cards.length) return -1
  return Math.floor(Math.random() * cards.length)
}

export function pickBestDraftCardIndex(cards, hand = []) {
  if (!cards.length) return -1

  const pickedCard = pickBestCardForHand(cards, hand)
  if (!pickedCard) return 0

  return cards.findIndex((card) => card.uid === pickedCard.uid)
}

export function pickDraftCard(cards, options = {}) {
  const { hand = [], strategy = null } = options
  const index = typeof strategy === 'function'
    ? strategy(cards, hand)
    : pickBestDraftCardIndex(cards, hand)

  if (index < 0 || index >= cards.length) return cards[0] ?? null
  return cards[index]
}
