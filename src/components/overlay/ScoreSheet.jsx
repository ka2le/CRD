import { useLayoutEffect, useRef, useState } from 'react'
import './ScoreSheet.css'
import Sheet from './Sheet'
import { GameIcon } from '../ui/GameIcon'
import { AbilityBandsCard, AbilityLedgerCard, FlexibleBandsCard, FlexibleLedgerCard } from './AbilityCards'
import { ThresholdBandsCard, ThresholdLedgerCard } from './ThresholdCards'

const CARD_W = 315
const CARD_H = 440
const GAP = 20

const CARDS = [
  { key: 'threshold-ledger', Card: ThresholdLedgerCard },
  { key: 'threshold-bands', Card: ThresholdBandsCard },
  { key: 'ability-ledger', Card: AbilityLedgerCard },
  { key: 'ability-bands', Card: AbilityBandsCard },
  { key: 'flexible-ledger', Card: FlexibleLedgerCard },
  { key: 'flexible-bands', Card: FlexibleBandsCard },
]

// Cards are authored at 315×440 and scaled to fit, like a printed card.
// Pick the grid that shows every card at the largest size with no scrolling;
// if that would make them too small (phones), fall back to a one-card swipe carousel.
const MIN_GRID_SCALE = 0.7
const CHROME_H = 96 // sheet header, body and track padding

function useCardLayout(open) {
  const trackRef = useRef(null)
  const [fit, setFit] = useState({ scale: 1, columns: 2 })

  useLayoutEffect(() => {
    if (!open) return undefined
    const track = trackRef.current
    if (!track) return undefined

    function measure() {
      const width = track.clientWidth - 24
      const height = window.innerHeight - CHROME_H
      let best = { scale: 0, columns: 0 }
      for (let columns = 2; columns <= CARDS.length; columns += 1) {
        const rows = Math.ceil(CARDS.length / columns)
        const scale = Math.min(
          1.3,
          (width - GAP * (columns - 1)) / columns / CARD_W,
          (height - GAP * (rows - 1)) / rows / CARD_H,
        )
        if (scale > best.scale) best = { scale, columns }
      }
      if (best.scale >= MIN_GRID_SCALE) {
        setFit(best)
      } else {
        const dotsH = 24
        setFit({ scale: Math.min(1.3, (track.clientWidth * 0.86) / CARD_W, (height - dotsH) / CARD_H), columns: 0 })
      }
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(track)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [open])

  return [trackRef, fit]
}

export default function ScoreSheet({ open, onClose }) {
  const [trackRef, { scale, columns }] = useCardLayout(open)
  const sideBySide = columns > 0
  const [active, setActive] = useState(0)

  function handleScroll(event) {
    const track = event.currentTarget
    const progress = track.scrollLeft / Math.max(1, track.scrollWidth - track.clientWidth)
    const index = Math.round(progress * (CARDS.length - 1))
    if (index !== active) setActive(index)
  }

  function goTo(index) {
    const slide = trackRef.current?.children[index]
    slide?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }

  return (
    <Sheet open={open} onClose={onClose} title={<GameIcon name="star" />} className="score-sheet" placement="top">
      <div
        ref={trackRef}
        className={['score-sheet__track', sideBySide ? 'is-side' : 'is-carousel'].join(' ')}
        style={{ '--sc-gap': `${GAP}px`, '--sc-columns': columns || 1 }}
        onScroll={sideBySide ? undefined : handleScroll}
      >
        {CARDS.map(({ key, Card }) => (
          <div key={key} className="score-sheet__slot" style={{ width: CARD_W * scale, height: CARD_H * scale }}>
            <div className="score-sheet__scaler" style={{ transform: `scale(${scale})` }}>
              <Card />
            </div>
          </div>
        ))}
      </div>
      {!sideBySide ? (
        <div className="score-sheet__dots" role="tablist">
          {CARDS.map(({ key }, index) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active === index}
              aria-label={`Card ${index + 1}`}
              className={active === index ? 'is-on' : ''}
              onClick={() => goTo(index)}
            />
          ))}
        </div>
      ) : null}
    </Sheet>
  )
}
