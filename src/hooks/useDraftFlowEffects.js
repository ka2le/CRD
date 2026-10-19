import { useEffect, useRef } from 'react'
import { startDraftPickFlight, animateDraftRowDiscard, getDraftDiscardSequenceMs } from './draftMotion'
import { getPackDealMs } from './dealTiming'

const DRAFT_AI_DELAY_MS = 800
const DRAFT_PRE_DISCARD_PAUSE_MS = 600
const DRAFT_POST_DISCARD_PAUSE_MS = 320
// After a slow (searching) AI decides, still show its choice briefly before it picks.
const DRAFT_MIN_EYED_MS = 450

function createDraftTiming(overrides = {}) {
  return {
    aiDelayMs: overrides.aiDelayMs ?? DRAFT_AI_DELAY_MS,
    preDiscardPauseMs: overrides.preDiscardPauseMs ?? DRAFT_PRE_DISCARD_PAUSE_MS,
    postDiscardPauseMs: overrides.postDiscardPauseMs ?? DRAFT_POST_DISCARD_PAUSE_MS,
  }
}

export default function useDraftFlowEffects({
  game,
  waitingForOpponentPick = false,
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
  const thinkingRef = useRef({ key: null, startedAt: 0 })

  useEffect(() => {
    if (game.mode !== 'draft') return undefined

    if (game.phase === 'draft-opponent-thinking') {
      // Measure the AI delay from when this decision started, not from each re-render,
      // so time spent waiting for the Search AI counts towards it.
      const thinkingKey = `${game.packNumber}:${game.playerHand.length}:${game.opponentHand.length}:${game.draftRow.map((card) => card.uid).join(',')}`
      if (thinkingRef.current.key !== thinkingKey) {
        thinkingRef.current = { key: thinkingKey, startedAt: performance.now() }
      }
      // The Search AI has not decided yet; this effect re-runs once it has.
      if (waitingForOpponentPick) return undefined

      // A fresh pack is still being dealt: let it land before the AI picks.
      const dealLeadMs = game.picksThisPack === 0 ? getPackDealMs(game.draftRow.length, game.packNumber === 1) : 0
      const elapsedMs = performance.now() - thinkingRef.current.startedAt
      const delayMs = Math.max(draftTiming.aiDelayMs + dealLeadMs - elapsedMs, DRAFT_MIN_EYED_MS)
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
      }, delayMs)
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
    waitingForOpponentPick,
  ])
}
