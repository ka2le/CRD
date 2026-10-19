import { useEffect, useState } from 'react'
import './Pile.css'
import { MotionAnchor } from '../animation/CardMotionContext'
import CardVisual, { CardBack } from '../card/CardVisual'
import { getAccentStyle } from '../card/cardMeta'

const SHUFFLE_MS = 760

// A small physical stack. Deck shows backs; discard shows the top card face up.
export default function Pile({
  kind = 'deck',
  sections,
  count = 0,
  topCard = null,
  shuffleKey = null,
  pulse = false,
  onOpen = null,
  label,
}) {
  const [shufflingKey, setShufflingKey] = useState(null)

  useEffect(() => {
    if (shuffleKey === null || shuffleKey === undefined) return undefined
    const startId = window.setTimeout(() => setShufflingKey(shuffleKey), 0)
    const endId = window.setTimeout(() => setShufflingKey(null), SHUFFLE_MS + 40)
    return () => {
      window.clearTimeout(startId)
      window.clearTimeout(endId)
    }
  }, [shuffleKey])

  const depth = Math.min(4, Math.max(count > 0 ? 1 : 0, Math.ceil(count / 12)))
  const isShuffling = shufflingKey !== null && shufflingKey === shuffleKey
  const Tag = onOpen ? 'button' : 'div'

  return (
    <Tag
      type={onOpen ? 'button' : undefined}
      className={[
        'pile',
        `pile--${kind}`,
        count === 0 ? 'pile--empty' : '',
        pulse ? 'pile--pulse' : '',
        isShuffling ? 'pile--shuffling' : '',
        onOpen ? 'pile--clickable' : '',
      ].filter(Boolean).join(' ')}
      onClick={onOpen ?? undefined}
      aria-label={label ? `${label}: ${count}` : undefined}
    >
      <MotionAnchor section={sections} className="pile__anchor">
        <span className="pile__stack" aria-hidden="true">
          {Array.from({ length: depth }).map((_, index) => (
            <span key={`under-${index}`} className="pile__card pile__card--under" style={{ '--i': depth - index }}>
              <CardBack />
            </span>
          ))}
          {kind === 'discard' && topCard ? (
            <span className="pile__card pile__card--top" style={getAccentStyle(topCard)} key={topCard.uid}>
              <CardVisual card={topCard} />
            </span>
          ) : null}
          {kind === 'deck' && isShuffling ? (
            <>
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <span key={`riffle-${index}`} className="pile__card pile__card--riffle" style={{ '--r': index }}>
                  <CardBack />
                </span>
              ))}
            </>
          ) : null}
        </span>
      </MotionAnchor>
      <span className="pile__count">{count}</span>
    </Tag>
  )
}
