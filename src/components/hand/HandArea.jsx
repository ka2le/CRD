import { useState } from 'react'
import './HandArea.css'
import CardButton from '../card/CardButton'
import { MotionAnchor, useCardMotion } from '../animation/CardMotionContext'
import { CARD_ASPECT, computeGridFit, computeRowFit, useElementSize } from '../../hooks/useFitLayout'
import { getCardCharge } from '../card/cardMeta'

const ENTER_STAGGER_MS = 85
const EMPTY = []

export default function HandArea({
  hand = EMPTY,
  side = 'player',
  layout = 'row',
  slots = 5,
  maxCardHeight = Infinity,
  hidden = false,
  selectedIds = EMPTY,
  discardIds = EMPTY,
  onToggle,
  className = '',
  activeCardIds = EMPTY,
  activationKey = 0,
  readyIds = EMPTY,
  dimmedIds = EMPTY,
  defeated = false,
  animateOnMount = true,
  enterFromSection = null,
  enterBaseDelayMs = 0,
  cardsDisabled = false,
  motionSection = '',
  suppressedIds = EMPTY,
  targetableIds = EMPTY,
  battleValuesById = null,
  battleRound = null,
  inspectContextHand = null,
  hintFor = null,
  showEmptySlots = false,
}) {
  const [measureRef, size] = useElementSize()
  const { hiddenSlots } = useCardMotion()
  // Cards mounting with the hand are the opening deal; later mounts are newcomers.
  const [mountedAt] = useState(() => performance.now())

  const activeIds = new Set(activeCardIds)
  const suppressedSet = new Set(suppressedIds)
  const targetableSet = new Set(targetableIds)
  const readySet = new Set(readyIds)
  const dimmedSet = new Set(dimmedIds)
  const selectedSet = new Set(selectedIds)
  const discardSet = new Set(discardIds)
  const gap = size.width < 520 ? 5 : 8

  let cardWidth = 0
  let step = 0
  let gridCols = 1

  if (layout === 'grid') {
    const fit = computeGridFit({
      width: size.width,
      height: size.height,
      count: Math.max(hand.length, slots),
      gap,
      maxCardHeight,
    })
    cardWidth = fit.cardWidth
    gridCols = fit.cols
  } else {
    const fit = computeRowFit({ width: size.width, count: hand.length, slots, gap, maxCardHeight })
    cardWidth = fit.cardWidth
    step = fit.step
  }

  const cardHeight = Math.round(cardWidth / CARD_ASPECT)
  const overlap = layout === 'row' && step < cardWidth + gap - 0.5
  const contextHand = inspectContextHand ?? hand

  const rowStyle = layout === 'grid'
    ? { '--card-w': `${cardWidth}px`, '--hand-gap': `${gap}px`, maxWidth: `${(gridCols * cardWidth) + ((gridCols - 1) * gap) + 1}px` }
    : { '--card-w': `${cardWidth}px`, '--hand-gap': `${gap}px`, height: `${cardHeight}px` }

  return (
    <section
      ref={measureRef}
      className={[
        'hand-area',
        `hand-area--${layout}`,
        `hand-area--${side}`,
        className,
      ].filter(Boolean).join(' ')}
      style={layout === 'row' ? { minHeight: `${cardHeight}px` } : undefined}
    >
      {cardWidth > 0 ? (
        <div className={['hand-area__row', overlap ? 'hand-area__row--overlap' : ''].filter(Boolean).join(' ')} style={rowStyle}>
          {hand.map((card, index) => {
            const slotKey = motionSection ? `${motionSection}::${card.uid}` : ''
            const isSuppressed = suppressedSet.has(card.uid)
            const isMasked = isSuppressed || Boolean(slotKey && (hiddenSlots[slotKey] ?? 0) > 0)
            const enterFrom = enterFromSection
              ? {
                section: enterFromSection,
                delayMs: index * ENTER_STAGGER_MS,
                leadMs: enterBaseDelayMs,
                mountedAt,
                animateOnMount,
                flip: !hidden,
              }
              : null
            const slotStyle = {
              width: `${cardWidth}px`,
              marginLeft: layout === 'row' && index > 0 ? `${step - cardWidth}px` : undefined,
              zIndex: overlap ? index + 1 : undefined,
            }

            const button = (
              <CardButton
                card={card}
                hidden={hidden}
                selected={selectedSet.has(card.uid)}
                discardMarked={discardSet.has(card.uid)}
                active={activeIds.has(card.uid)}
                activationKey={activationKey}
                lungeDirection={side === 'player' ? -1 : 1}
                ready={readySet.has(card.uid)}
                dimmed={dimmedSet.has(card.uid)}
                defeated={defeated}
                masked={isMasked}
                onToggle={onToggle}
                disabled={cardsDisabled}
                targetable={targetableSet.has(card.uid)}
                battleValue={battleValuesById?.[card.uid] ?? 0}
                charge={battleRound === null ? null : getCardCharge(card, battleRound)}
                hint={hintFor ? hintFor(card) : null}
                enterFrom={enterFrom}
                inspectContextHand={contextHand}
              />
            )

            if (!motionSection) {
              return <div key={card.uid} className="hand-area__slot" style={slotStyle}>{button}</div>
            }

            return (
              <MotionAnchor
                key={card.uid}
                section={motionSection}
                slot={card.uid}
                className="hand-area__slot"
                style={slotStyle}
              >
                {button}
              </MotionAnchor>
            )
          })}
          {showEmptySlots && hand.length < slots ? Array.from({ length: slots - hand.length }).map((_, index) => (
            <div
              key={`empty-${index}`}
              className="hand-area__slot hand-area__slot--empty"
              style={{ width: `${cardWidth}px`, marginLeft: layout === 'row' && (hand.length + index) > 0 ? `${gap}px` : undefined }}
            />
          )) : null}
        </div>
      ) : null}
    </section>
  )
}
