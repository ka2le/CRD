import { useLayoutEffect, useRef, useState } from 'react'
import './ScoreSheet.css'
import Sheet from './Sheet'
import { GameIcon } from '../ui/GameIcon'

// Reference for the optional tabletop battle mode.
// Bonuses are drawn as damage icons: the total bonus from that power upward.
// Robots and Dragons share the 11 threshold.
const CLASSES = [
  { key: 'critter', shield: '−2', tiers: [['1+', 1]] },
  { key: 'robot', shield: '−1', tiers: [['7+', 2], ['11+', 3]] },
  { key: 'dragon', shield: '0', tiers: [['11+', 4], ['14+', 6]] },
]

const CARD_W = 315
const CARD_H = 440
const GAP = 20

function ScoreEquation({ className }) {
  return (
    <div className={className}>
      <GameIcon name="damage" className="sc-damage" />
      <span className="sc-op">−</span>
      <GameIcon name="shield" className="sc-shield" />
      <span className="sc-op">+</span>
      <GameIcon name="star" className="sc-star" />
    </div>
  )
}

// n damage icons, packed 1–3 per row (4 → 2×2, 6 → 3×2).
function Hearts({ count, className = '' }) {
  if (!count) return null
  const cols = count <= 3 ? count : count === 4 ? 2 : 3
  return (
    <span className={['sc-hearts', className].filter(Boolean).join(' ')} style={{ '--cols': cols }} aria-label={`+${count}`}>
      {Array.from({ length: count }, (_, index) => <GameIcon key={index} name="damage" />)}
    </span>
  )
}

function Tier({ at, bonus }) {
  return (
    <span className="sc-tier">
      <em>{at}</em>
      <Hearts count={bonus} />
    </span>
  )
}

function LedgerCard() {
  return (
    <div className="sc-card sc-ledger" aria-label="Score card: ledger">
      <ScoreEquation className="sc-ledger__eq" />
      <div className="sc-ledger__power">
        <GameIcon name="damage" className="sc-damage" />
        <span>stats</span><i>×</i><span>attacks</span><i>×</i><span>2</span>
      </div>
      <div className="sc-ledger__table">
        <div />
        <div className="sc-ledger__head sc-shield"><GameIcon name="shield" /></div>
        <div className="sc-ledger__head sc-ledger__head--tiers sc-star"><GameIcon name="star" /></div>
        {CLASSES.map((cls) => (
          <div key={cls.key} className="sc-ledger__row">
            <div className={`sc-ledger__cell sc-ledger__cls sc-${cls.key}`}><GameIcon name={cls.key} /></div>
            <div className={['sc-ledger__cell', 'sc-ledger__sh', cls.shield === '0' ? 'is-zero' : ''].filter(Boolean).join(' ')}>{cls.shield}</div>
            <div className="sc-ledger__cell sc-ledger__tiers">
              {cls.tiers.map(([at, bonus]) => <Tier key={at} at={at} bonus={bonus} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function HandCard() {
  return (
    <div className="sc-card sc-hand" aria-label="Score card: hand of three">
      <ScoreEquation className="sc-hand__eq" />
      <div className="sc-hand__fan">
        {CLASSES.map((cls) => (
          <div key={cls.key} className={`sc-hand__mini sc-hand__mini--${cls.key}`}>
            <GameIcon name={cls.key} className="sc-hand__icon" />
            <div className="sc-hand__tiers">
              {cls.tiers.map(([at, bonus]) => <Tier key={at} at={at} bonus={bonus} />)}
            </div>
            <div className={['sc-hand__sh', cls.shield === '0' ? 'is-zero' : ''].filter(Boolean).join(' ')}>
              <GameIcon name="shield" />{cls.shield}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const CARDS = [
  { key: 'ledger', Card: LedgerCard },
  { key: 'hand', Card: HandCard },
]

// Cards are authored at 315×440 and scaled to fit, like a printed card.
function useCardScale(open) {
  const trackRef = useRef(null)
  const [fit, setFit] = useState({ scale: 1, sideBySide: true })

  useLayoutEffect(() => {
    if (!open) return undefined
    const track = trackRef.current
    if (!track) return undefined

    function measure() {
      const width = track.clientWidth
      const maxHeight = Math.max(240, window.innerHeight * 0.82 - 120)
      const byHeight = maxHeight / CARD_H
      const sideBySide = width >= (CARD_W * 2 + GAP) * 0.9
      const byWidth = sideBySide ? (width - GAP - 32) / 2 / CARD_W : (width * 0.86) / CARD_W
      setFit({ scale: Math.min(1.3, byWidth, byHeight), sideBySide })
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
  const [trackRef, { scale, sideBySide }] = useCardScale(open)
  const [active, setActive] = useState(0)

  function handleScroll(event) {
    const track = event.currentTarget
    const index = Math.round(track.scrollLeft / Math.max(1, track.scrollWidth - track.clientWidth))
    if (index !== active) setActive(index)
  }

  function goTo(index) {
    const slide = trackRef.current?.children[index]
    slide?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }

  return (
    <Sheet open={open} onClose={onClose} title={<GameIcon name="star" />} className="score-sheet">
      <div
        ref={trackRef}
        className={['score-sheet__track', sideBySide ? 'is-side' : 'is-carousel'].join(' ')}
        style={{ '--sc-gap': `${GAP}px` }}
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
