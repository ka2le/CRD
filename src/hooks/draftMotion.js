const DRAFT_POST_PICK_PAUSE_MS = 180
const DRAFT_DISCARD_STAGGER_MS = 110
const DRAFT_DISCARD_DURATION_MS = 320
const PICK_MOVE_DURATION_MS = 360

export function startDraftPickFlight({
  pickedCard,
  pickedUid,
  targetSection,
  sourceRect,
  getAnchorRect,
  animateCardMove,
  maskSlot,
  scheduleTimeout,
  onFlightComplete,
}) {
  if (!pickedCard || !pickedUid || !sourceRect) return

  maskSlot(targetSection, pickedUid)

  scheduleTimeout(() => {
    window.requestAnimationFrame(() => {
      const targetRect = getAnchorRect(targetSection, pickedUid)
      if (!targetRect) return

      animateCardMove({
        card: pickedCard,
        from: { section: 'draft-row', slot: pickedUid },
        to: { section: targetSection, slot: pickedUid },
        fromRect: sourceRect,
        toRect: targetRect,
        face: 'up',
        durationMs: PICK_MOVE_DURATION_MS,
        hideSource: true,
        hideDestinationUntilEnd: true,
        destinationAlreadyHidden: true,
      })

      if (onFlightComplete) {
        scheduleTimeout(() => onFlightComplete(), PICK_MOVE_DURATION_MS + 80)
      }
    })
  }, DRAFT_POST_PICK_PAUSE_MS)
}

export function animateDraftRowDiscard({
  cards,
  getAnchorRect,
  animateCardMove,
  scheduleTimeout,
}) {
  cards.forEach((card, index) => {
    const fromRect = getAnchorRect('draft-row', card.uid)
    if (!fromRect) return

    scheduleTimeout(() => {
      const discardRect = getAnchorRect('draft-discard', 'default')
      if (!discardRect) return

      animateCardMove({
        card,
        from: { section: 'draft-row', slot: card.uid },
        to: { section: 'draft-discard', slot: 'default' },
        fromRect,
        toRect: discardRect,
        face: 'up',
        durationMs: DRAFT_DISCARD_DURATION_MS,
        rotateDeg: 10,
        scaleTo: 0.72,
        fadeOut: true,
        hideSource: true,
        hideDestinationUntilEnd: false,
      })
    }, index * DRAFT_DISCARD_STAGGER_MS)
  })
}

export function getDraftDiscardSequenceMs(cardCount) {
  return Math.max(0, (cardCount - 1) * DRAFT_DISCARD_STAGGER_MS) + DRAFT_DISCARD_DURATION_MS
}
