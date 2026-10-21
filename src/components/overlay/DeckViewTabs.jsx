import { useEffect } from 'react'
import { SvgIcon } from '../ui/GameIcon'

const VIEWS = [
  { key: 'collection', icon: 'collection', label: 'Collection' },
  { key: 'test', icon: 'flask', label: 'Test deck' },
]

// Testing: the Collection and Test deck sheets share one title switch.
// Arrow keys or Tab flip to the other view.
export default function DeckViewTabs({ active, count, onSwitch }) {
  const other = active === 'collection' ? 'test' : 'collection'
  useEffect(() => {
    function handleKey(event) {
      if (event.altKey || event.ctrlKey || event.metaKey) return
      if (!['ArrowLeft', 'ArrowRight', 'Tab'].includes(event.key)) return
      if (event.target?.closest?.('input, select, textarea')) return
      event.preventDefault()
      onSwitch(other)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [other, onSwitch])

  return (
    <span className="deck-tabs" role="tablist" aria-label="Deck view">
      {VIEWS.map((view) => (
        <button
          key={view.key}
          type="button"
          role="tab"
          aria-selected={active === view.key}
          className={['deck-tabs__tab', active === view.key ? 'is-on' : ''].filter(Boolean).join(' ')}
          onClick={() => active !== view.key && onSwitch(view.key)}
        >
          <SvgIcon name={view.icon} />
          <span>{view.label}</span>
          {active === view.key && count !== undefined ? <span className="deck-tabs__count">{count}</span> : null}
        </button>
      ))}
    </span>
  )
}
