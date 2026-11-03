import { useState } from 'react'
import './PackArea.css'
import CardButton from '../card/CardButton'
import { MotionAnchor, useCardMotion } from '../animation/CardMotionContext'
import { computeGridFit, useElementSize } from '../../hooks/useFitLayout'
import { formatDelta, getDamageDelta } from '../card/cardMeta'
import { DEAL_STAGGER_MS } from '../../hooks/dealTiming'

const PACK_SIZE = 5

// Cards keep their slot when neighbours are picked, like a real table.
function usePackSlots(packKey, row) {
  const [slots, setSlots] = useState({ key: null, uids: [] })
  const rowUids = row.map((card) => card.uid)
  const hasUnknown = rowUids.some((uid) => !slots.uids.includes(uid))

  if ((slots.key !== packKey || hasUnknown) && rowUids.length) {
    const next = { key: packKey, uids: rowUids }
    setSlots(next)
    return next.uids
  }

  return slots.uids
}

export default function PackArea({
  packKey,
  row = [],
  onPick,
  canPick = false,
  eyedUid = null,
  eyedDelayMs = 0,
  playerHand = [],
  dealDelayMs = 0,
  turn = null,
}) {
  const [measureRef, size] = useElementSize()
  const { hiddenSlots } = useCardMotion()
  const slotUids = usePackSlots(packKey, row)
  const byUid = new Map(row.map((card) => [card.uid, card]))
  const gap = size.width < 520 ? 6 : 12
  const fit = computeGridFit({ width: size.width, height: size.height, count: PACK_SIZE, gap, maxCardHeight: 520 })
  const cardWidth = fit.cardWidth
  const maxWidth = (fit.cols * cardWidth) + ((fit.cols - 1) * gap) + 1
  const slotCount = Math.max(PACK_SIZE, slotUids.length)

  return (
    <section
      ref={measureRef}
      className={['pack-area', turn ? `pack-area--turn-${turn}` : ''].filter(Boolean).join(' ')}
    >
      {cardWidth > 0 ? (
        <div className="pack-area__grid" style={{ '--card-w': `${cardWidth}px`, gap: `${gap}px`, maxWidth: `${maxWidth}px` }}>
          {Array.from({ length: slotCount }).map((_, index) => {
            const uid = slotUids[index]
            const card = uid ? byUid.get(uid) : null

            if (!card) {
              return <div key={`empty-${index}`} className="pack-area__slot pack-area__slot--empty" style={{ width: `${cardWidth}px` }} />
            }

            const masked = (hiddenSlots[`draft-row::${card.uid}`] ?? 0) > 0
            const dealing = card.draftAnimation === 'dealing'
            const delta = getDamageDelta(card, playerHand)

            return (
              <MotionAnchor
                key={card.uid}
                section="draft-row"
                slot={card.uid}
                className="pack-area__slot"
                style={{ width: `${cardWidth}px` }}
              >
                <CardButton
                  card={card}
                  onToggle={onPick}
                  disabled={!canPick}
                  masked={masked}
                  eyed={eyedUid === card.uid}
                  eyedDelayMs={eyedDelayMs}
                  dimmed={Boolean(eyedUid) && eyedUid !== card.uid}
                  enterFrom={dealing ? { section: 'draft-deck', delayMs: dealDelayMs + (index * DEAL_STAGGER_MS) } : null}
                  hint={delta === null ? null : formatDelta(delta)}
                  inspectContextHand={playerHand}
                />
              </MotionAnchor>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}
