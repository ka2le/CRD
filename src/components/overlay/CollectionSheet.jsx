import { useMemo, useState } from 'react'
import './CollectionSheet.css'
import Sheet from './Sheet'
import CardButton from '../card/CardButton'
import { useCardInspect } from './inspectContext'
import { SvgIcon } from '../ui/GameIcon'
import { CARD_GROUPS as GROUPS, getCardGroup as getGroup } from '../card/cardMeta'
import { getCoreCards } from '../../game/cards'
import { toTabletopCard } from '../../game/tabletop'
import { useElementSize } from '../../hooks/useFitLayout'
import DeckViewTabs from './DeckViewTabs'

const CLASS_ORDER = ['critter', 'robot', 'dragon']

function classRank(card) {
  const classes = card.type === 'stat' ? (card.stats ?? []) : [card.effect?.dmgType].filter(Boolean)
  if (!classes.length) return 99
  // Pure single-class cards first, then mixed/multi-stat cards.
  const first = Math.min(...classes.map((key) => CLASS_ORDER.indexOf(key)))
  return first * 10 + classes.length
}

function getCopies(card, wildDeck) {
  if (!wildDeck) return card.copies
  return card.copies > 1 ? card.copies : 3
}

// Every unique card in the core deck, grouped; tap one to read about it.
export default function CollectionSheet({ open, onClose, onSwitch = null, tabletop = false, wildDeck = false }) {
  const inspect = useCardInspect()
  const [measureRef, size] = useElementSize()
  const [filter, setFilter] = useState('all')
  const columns = Math.max(3, Math.floor((size.width + 8) / 128))
  const cardWidth = size.width ? Math.floor((size.width - ((columns - 1) * 8)) / columns) : 100

  const groups = useMemo(() => {
    // One entry per artwork, so every illustration of a card is shown.
    const cards = getCoreCards({ tabletop }).flatMap((card) => {
      const base = tabletop ? toTabletopCard(card, tabletop) : card
      const imageCount = Math.max(card.images?.length ?? 1, 1)
      return Array.from({ length: imageCount }, (_, imageIndex) => ({
        ...base,
        uid: `collection__${card.id}__${imageIndex}`,
        imageIndex,
        collectionCopies: imageIndex === 0 ? getCopies(card, wildDeck) : null,
      }))
    })
    return GROUPS.map((group) => ({
      ...group,
      cards: cards
        .filter((card) => getGroup(card) === group.key)
        .sort((a, b) => classRank(a) - classRank(b)
          || (b.copies - a.copies)
          || a.id.localeCompare(b.id)
          || a.imageIndex - b.imageIndex),
    }))
  }, [tabletop, wildDeck])

  const total = groups.reduce((sum, group) => sum + group.cards.length, 0)
  const visible = filter === 'all' ? groups : groups.filter((group) => group.key === filter)
  const byUid = useMemo(() => Object.fromEntries(groups.flatMap((group) => group.cards).map((card) => [card.uid, card])), [groups])

  return (
    <Sheet
      open={open}
      onClose={onClose}
      className="collection-sheet"
      title={onSwitch ? <DeckViewTabs active="collection" count={total} onSwitch={onSwitch} /> : (
        <>
          <SvgIcon name="collection" />
          <span>Collection</span>
          <span className="collection__count">{total}</span>
        </>
      )}
    >
      <div className="collection__filters" role="tablist" aria-label="Card type">
        {[{ key: 'all', label: 'All' }, ...GROUPS].map((option) => (
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

      <div ref={measureRef} className="collection">
        {visible.map((group) => (
          <section key={group.key} className="collection__group">
            <h3 className="collection__heading">
              <span>{group.label}</span>
              <span className="collection__heading-count">{group.cards.length}</span>
            </h3>
            <div
              className="sheet-cards"
              style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, '--card-w': `${cardWidth}px` }}
            >
              {group.cards.map((card) => (
                <div key={card.uid} className="sheet-cards__slot collection__slot">
                  <CardButton card={card} onToggle={(uid) => inspect?.(byUid[uid] ?? card, [])} />
                  {card.collectionCopies ? (
                    <span className="collection__copies" aria-label={`${card.collectionCopies} in deck`}>
                      ×{card.collectionCopies}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Sheet>
  )
}
