import { useEffect } from 'react'
import { startDraftPickFlight, animateDraftRowDiscard, getDraftDiscardSequenceMs } from './draftMotion'

const DRAFT_AI_DELAY_MS = 800
const DRAFT_PRE_DISCARD_PAUSE_MS = 600
const DRAFT_POST_DISCARD_PAUSE_MS = 320

function createDraftTiming(overrides = {}) {
  return {
    aiDelayMs: overrides.aiDelayMs ?? DRAFT_AI_DELAY_MS,
    preDiscardPauseMs: overrides.preDiscardPauseMs ?? DRAFT_PRE_DISCARD_PAUSE_MS,
    postDiscardPauseMs: overrides.postDiscardPauseMs ?? DRAFT_POST_DISCARD_PAUSE_MS,
  }
}

export default function useDraftFlowEffects({
  game,
  resolveOpponentDraftPick,
  commitDraftDiscard,
  revealNextDraftPack,
  revealHandCard,
  getAnchorRect,
  animateCardMove,
  maskSlot,
  unmaskSlot,
  scheduleTimeout,
  clearSequenceTimeouts,
  timing = {},
}) {
  const draftTiming = createDraftTiming(timing)

  useEffect(() => {
    if (game.mode !== 'draft') return undefined

    if (game.phase === 'draft-opponent-thinking') {
      const timeoutId = window.setTimeout(() => {
        const pickedUid = game.pendingOpponentPickUid
        const pickedCard = game.draftRow.find((card) => card.uid === pickedUid)
        const sourceRect = pickedUid ? getAnchorRect('draft-row', pickedUid) : null

        resolveOpponentDraftPick()

        startDraftPickFlight({
          pickedCard,
          pickedUid,
          targetSection: 'opponent-hand',
          sourceRect,
          getAnchorRect,
          animateCardMove,
          maskSlot,
          scheduleTimeout,
          onFlightComplete: () => revealHandCard('opponent', pickedUid),
        })
      }, draftTiming.aiDelayMs)
      return () => window.clearTimeout(timeoutId)
    }

    if (game.phase === 'draft-pack-clearing') {
      const remainingCards = [...game.draftRow]
      let rowMasks = []

      const timeoutId = window.setTimeout(() => {
        rowMasks = remainingCards.map((card) => ({
          uid: card.uid,
          key: maskSlot('draft-row', card.uid),
        }))

        animateDraftRowDiscard({
          cards: remainingCards,
          getAnchorRect,
          animateCardMove,
          scheduleTimeout,
        })

        const discardSequenceMs = getDraftDiscardSequenceMs(remainingCards.length)

        scheduleTimeout(() => {
          commitDraftDiscard()
          rowMasks.forEach(({ uid }) => {
            unmaskSlot('draft-row', uid)
          })
        }, discardSequenceMs + draftTiming.postDiscardPauseMs)
      }, draftTiming.preDiscardPauseMs)

      return () => {
        window.clearTimeout(timeoutId)
        rowMasks.forEach(({ uid }) => {
          unmaskSlot('draft-row', uid)
        })
        clearSequenceTimeouts()
      }
    }

    if (game.phase === 'draft-pack-dealing') {
      revealNextDraftPack()
      return undefined
    }

    return undefined
  }, [
    animateCardMove,
    clearSequenceTimeouts,
    commitDraftDiscard,
    draftTiming.aiDelayMs,
    draftTiming.postDiscardPauseMs,
    draftTiming.preDiscardPauseMs,
    game,
    getAnchorRect,
    maskSlot,
    resolveOpponentDraftPick,
    revealHandCard,
    revealNextDraftPack,
    scheduleTimeout,
    unmaskSlot,
  ])
}
