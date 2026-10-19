import Sheet from './Sheet'
import CardButton from '../card/CardButton'
import { GameIcon, SvgIcon } from '../ui/GameIcon'
import { useElementSize } from '../../hooks/useFitLayout'

// Browse a pile, or pick one card from it (recycle).
export default function PileSheet({ open, cards = [], onClose, onPick = null, contextHand = [] }) {
  const [measureRef, size] = useElementSize()
  const columns = Math.max(3, Math.floor((size.width + 8) / 128))
  const cardWidth = size.width ? Math.floor((size.width - ((columns - 1) * 8)) / columns) : 100
  const picking = Boolean(onPick)

  return (
    <Sheet
      open={open}
      onClose={onClose}
      accent={picking ? 'var(--special)' : null}
      title={(
        <>
          {picking ? <GameIcon name="recycle" style={{ color: 'var(--special)' }} /> : <SvgIcon name="trash" />}
          <span>{cards.length}</span>
        </>
      )}
    >
      <div ref={measureRef} className="sheet-cards" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, '--card-w': `${cardWidth}px` }}>
        {cards.map((card) => (
          <div key={card.uid} className="sheet-cards__slot">
            <CardButton
              card={card}
              onToggle={onPick ?? undefined}
              disabled={!picking}
              targetable={picking}
              inspectContextHand={contextHand}
            />
          </div>
        ))}
      </div>
    </Sheet>
  )
}
