import { useCallback, useEffect, useState } from 'react'
import './CardInspect.css'
import CardVisual from '../card/CardVisual'
import { getAccentStyle, getCardSummary, getDamageDelta, formatDelta } from '../card/cardMeta'
import { InspectContext } from './inspectContext'
import { GameIcon } from '../ui/GameIcon'

function CardInspectOverlay({ entry, onClose }) {
  useEffect(() => {
    function handleKey(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const { card, hand } = entry
  const summary = getCardSummary(card)
  const delta = getDamageDelta(card, hand)
  const cd = typeof card.cd === 'number' ? card.cd : 0

  return (
    <div className="card-inspect" onClick={onClose} onContextMenu={(event) => { event.preventDefault(); onClose() }}>
      <div className="card-inspect__stage" style={getAccentStyle(card)}>
        <div className="card-inspect__card">
          <CardVisual card={card} />
          <span className="card-inspect__frame" />
        </div>
        <div className="card-inspect__info">
          <div className="card-inspect__timing">
            {cd > 0 ? (
              <span className="card-inspect__hourglasses">
                {Array.from({ length: cd }).map((_, index) => <GameIcon key={index} name="cd" />)}
              </span>
            ) : null}
            <span>{summary.timing}</span>
          </div>
          {summary.text ? <p className="card-inspect__text">{summary.text}</p> : null}
          {delta !== null && hand.length > 0 ? (
            <div className={['card-inspect__delta', delta < 0 ? 'card-inspect__delta--neg' : ''].filter(Boolean).join(' ')}>
              <span>{formatDelta(delta)}</span>
              <GameIcon name="damage" />
              <span className="card-inspect__delta-unit">{card.tabletop ? 'power for your hand' : '/ round for your hand'}</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default function CardInspectProvider({ children }) {
  const [entry, setEntry] = useState(null)
  const inspect = useCallback((card, hand = []) => {
    if (!card) return
    setEntry({ card, hand })
  }, [])
  const close = useCallback(() => setEntry(null), [])

  return (
    <InspectContext.Provider value={inspect}>
      {children}
      {entry ? <CardInspectOverlay entry={entry} onClose={close} /> : null}
    </InspectContext.Provider>
  )
}
