import { pickBestCardForHand } from './cardEvaluator.js'

export function hasCopyCard(hand = []) {
  return hand.some((card) => card.id === 'copy_card_in_hand')
}

export function getCopyTargetCandidates(hand = []) {
  return hand.filter((card) => card.id !== 'copy_card_in_hand')
}

export function pickAiCopyTarget(hand = []) {
  const candidates = getCopyTargetCandidates(hand)
  if (!candidates.length) return null

  return pickBestCardForHand(candidates, hand.filter((card) => card.id !== 'copy_card_in_hand')) ?? candidates[0] ?? null
}

export function applyCopySelection(hand = [], sourceUid = null, targetUid = null) {
  if (!sourceUid || !targetUid) return hand

  const sourceCard = hand.find((card) => card.uid === sourceUid)
  const targetCard = hand.find((card) => card.uid === targetUid)
  if (!sourceCard || !targetCard) return hand

  return hand.map((card) => {
    if (card.uid !== sourceUid) return card

    return {
      ...targetCard,
      uid: `${sourceCard.uid}__copy__${targetCard.uid}`,
      copiedFromUid: targetCard.uid,
      copyOverlayImage: sourceCard.images?.[sourceCard.imageIndex ?? 0] ?? sourceCard.images?.[0] ?? null,
      copySourceCardId: sourceCard.id,
      sourceCopyUid: sourceCard.uid,
      isCopiedCard: true,
    }
  })
}
