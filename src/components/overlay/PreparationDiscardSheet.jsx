import Sheet from './Sheet'
import CardButton from '../card/CardButton'
import { useElementSize } from '../../hooks/useFitLayout'

export default function PreparationDiscardSheet({ pending, hand, onDiscard, onFinish }) {
  const [measureRef, size] = useElementSize()
  const columns = Math.max(3, Math.floor((size.width + 8) / 128))
  const cardWidth = size.width ? Math.floor((size.width - (columns - 1) * 8) / columns) : 100
  const damage = pending?.cardId === 'discard_for_damage'
  const source = hand.find((card) => card.uid === pending?.sourceUid)
  return <Sheet open={Boolean(pending)} accent="var(--special)"
    title={damage ? `Discard for Damage · ${source?.sacrificedPower ?? 0} power` : `Discard ${pending?.remaining ?? 0} more`}>
    <p>{damage ? 'Discard any other cards for +1 power each. Each choice is final; finish when you are ready.'
      : 'Your two cards have been drawn. Choose other cards to discard before using another special.'}</p>
    <div ref={measureRef} className="sheet-cards" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, '--card-w': `${cardWidth}px` }}>
      {hand.filter((card) => card.uid !== pending?.sourceUid).map((card) => <div key={card.uid} className="sheet-cards__slot">
        <CardButton card={card} onToggle={onDiscard} targetable inspectContextHand={hand} />
      </div>)}
    </div>
    {damage ? <button type="button" className="ui-button ui-button--primary" onClick={onFinish}>Finish discarding · {source?.sacrificedPower ?? 0} power</button> : null}
  </Sheet>
}
