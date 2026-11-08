import { useMemo, useState } from 'react'
import './CollectionSheet.css'
import MonsterDeckEditor from './MonsterDeckEditor'
import Sheet from './Sheet'
import CardButton from '../card/CardButton'
import { useCardInspect } from './inspectContext'
import { SvgIcon } from '../ui/GameIcon'
import { CARD_GROUPS as GROUPS, getCardGroup as getGroup } from '../card/cardMeta'
import { getExpandedCoreDeck } from '../../game/cards'
import { useElementSize } from '../../hooks/useFitLayout'
import DeckViewTabs from './DeckViewTabs'

const CLASS_ORDER = ['critter', 'robot', 'dragon', 'monster']

function classRank(card) {
  const classes = card.type === 'stat' ? (card.stats ?? []) : [card.effect?.dmgType].filter(Boolean)
  if (!classes.length) return 99
  // Pure single-class cards first, then mixed/multi-stat cards.
  const first = Math.min(...classes.map((key) => CLASS_ORDER.indexOf(key)))
  return first * 10 + classes.length
}

// Every physical copy in the selected deck, grouped; tap one to read about it.
export default function CollectionSheet({ open, onClose, onSwitch = null, tabletop = false, wildDeck = false, testing = false, monsterDeck, onUpdateSettings }) {
  const inspect = useCardInspect()
  const [measureRef, size] = useElementSize()
  const [editing, setEditing] = useState(false)
  const canEdit = tabletop === 'monsters' && testing && Boolean(onUpdateSettings)
  const [filter, setFilter] = useState('all')
  const columns = Math.max(3, Math.floor((size.width + 8) / 128))
  const cardWidth = size.width ? Math.floor((size.width - ((columns - 1) * 8)) / columns) : 100

  const groups = useMemo(() => {
    // Use the same copies and artwork rotation as dealing the actual deck.
    const deck = getExpandedCoreDeck({ tabletop, wildDeck, monsterDeck })
    const copies = new Map()
    for (const card of deck) copies.set(card.id, (copies.get(card.id) ?? 0) + 1)
    const seen = new Set()
    const cards = deck.map((card) => {
      const collectionCopies = seen.has(card.id) ? null : copies.get(card.id)
      seen.add(card.id)
      return { ...card, uid: `collection__${card.uid}`, collectionCopies }
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
  }, [tabletop, wildDeck, monsterDeck])

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
      {canEdit ? <button type="button" className="ui-button monster-editor__toggle" aria-pressed={editing} onClick={() => setEditing(!editing)}>{editing ? 'View collection' : 'Edit deck counts'}</button> : null}
      {canEdit && editing ? <MonsterDeckEditor key={`${wildDeck}-${JSON.stringify(monsterDeck)}`} monsterDeck={monsterDeck} wildDeck={wildDeck} onApply={onUpdateSettings} /> : <>
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
      </>}
    </Sheet>
  )
}
