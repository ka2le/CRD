import { useState } from 'react'
import Sheet from './Sheet'
import './CollectionSheet.css'
import './TestDeckSheet.css'
import CardButton from '../card/CardButton'
import { SvgIcon } from '../ui/GameIcon'
import { CARD_GROUPS, getCardGroup } from '../card/cardMeta'
import { useElementSize } from '../../hooks/useFitLayout'

// Testing: every card in the game, grouped by where it is. Tap a card, then
// tap another to swap them, or send it to the top of the deck.
export default function TestDeckSheet({ open, zones = [], editable = false, onSwap, onToTop, onClose, contextHand = [] }) {
  const [selectedUid, setSelectedUid] = useState(null)
  const [filter, setFilter] = useState('all')
  const [measureRef, size] = useElementSize()
  const columns = Math.max(4, Math.floor((size.width + 6) / 92))
  const cardWidth = size.width ? Math.floor((size.width - ((columns - 1) * 6)) / columns) : 80
  const allUids = new Set(zones.flatMap((zone) => zone.cards.map((card) => card.uid)))
  const selected = editable && allUids.has(selectedUid) ? selectedUid : null
  const selectedZone = selected ? zones.find((zone) => zone.cards.some((card) => card.uid === selected)) : null
  const total = zones.reduce((sum, zone) => sum + zone.cards.length, 0)

  function handleTap(uid) {
    if (!editable) return
    if (!selected) setSelectedUid(uid)
    else if (selected === uid) setSelectedUid(null)
    else {
      onSwap?.(selected, uid)
      setSelectedUid(null)
    }
  }

  function handleToTop() {
    if (!selected) return
    onToTop?.(selected)
    setSelectedUid(null)
  }

  function handleClose() {
    setSelectedUid(null)
    onClose?.()
  }

  return (
    <Sheet
      open={open}
      onClose={handleClose}
      className="test-deck"
      accent="var(--special)"
      title={(
        <>
          <SvgIcon name="flask" />
          <span>Test deck</span>
          <span className="test-deck__total">{total}</span>
        </>
      )}
    >
      <p className={['test-deck__hint', editable ? '' : 'test-deck__hint--locked'].filter(Boolean).join(' ')}>
        {!editable
          ? 'View only. Rearranging works on your turn (pick, discard or preparation).'
          : (selected
            ? 'Tap another card to swap places with it, or send it to the top of the deck.'
            : 'Tap a card to select it. Hold to inspect.')}
      </p>
      <div className="collection__filters" role="tablist" aria-label="Card type">
        {[{ key: 'all', label: 'All' }, ...CARD_GROUPS].map((option) => (
          <button
            key={option.key}
            type="button"
            role="tab"
            aria-selected={filter === option.key}
            className={filter === option.key ? 'is-on' : ''}
            onClick={() => setFilter(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div ref={measureRef} className="test-deck__zones" style={{ '--card-w': `${cardWidth}px` }}>
        {zones.map((zone) => {
          // Keep each card's real position (deck order) while filtering.
          const shown = zone.cards
            .map((card, index) => ({ card, index }))
            .filter(({ card }) => filter === 'all' || getCardGroup(card) === filter)
          return (
          <section key={zone.key} className="test-deck__zone">
            <h3 className="test-deck__zone-title">
              <span>{zone.label}</span>
              <span className="test-deck__count">{filter === 'all' ? zone.cards.length : `${shown.length} / ${zone.cards.length}`}</span>
            </h3>
            {shown.length ? (
              <div className="test-deck__grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
                {shown.map(({ card, index }) => (
                  <div key={`${zone.key}-${card.uid}`} className="test-deck__slot">
                    <CardButton
                      card={card}
                      onToggle={editable ? handleTap : undefined}
                      disabled={!editable}
                      selected={card.uid === selected}
                      inspectContextHand={contextHand}
                    />
                    {zone.key === 'deck' ? <span className="test-deck__order">{index + 1}</span> : null}
                  </div>
                ))}
              </div>
            ) : <p className="test-deck__empty">{zone.cards.length ? 'None of this type' : 'Empty'}</p>}
          </section>
          )
        })}
      </div>
      {selected ? (
        <div className="test-deck__actions">
          <button type="button" className="ui-button ui-button--primary" onClick={handleToTop}
            disabled={selectedZone?.key === 'deck' && selectedZone.cards[0]?.uid === selected}>
            <SvgIcon name="top" />
            <span>Draw next</span>
          </button>
          <button type="button" className="ui-button" onClick={() => setSelectedUid(null)}>
            <SvgIcon name="close" />
            <span>Cancel</span>
          </button>
        </div>
      ) : null}
    </Sheet>
  )
}
