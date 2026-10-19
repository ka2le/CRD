// Shared pacing for shuffle + deal so game flow waits for the cards to land.
export const SHUFFLE_LEAD_MS = 780
export const DEAL_STAGGER_MS = 110
export const DEAL_DURATION_MS = 520

export function getPackDealMs(cardCount = 5, withShuffle = false) {
  return (withShuffle ? SHUFFLE_LEAD_MS : 0) + (Math.max(0, cardCount - 1) * DEAL_STAGGER_MS) + DEAL_DURATION_MS
}
