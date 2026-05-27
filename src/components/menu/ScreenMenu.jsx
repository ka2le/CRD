import { useEffect, useRef, useState } from 'react'
import './ScreenMenu.css'

export default function ScreenMenu({ onNewGame, gameMode, onChangeGameMode, settings, onUpdateSettings }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    function handlePointerDown(event) {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false)
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  return (
    <div className="screen-menu" ref={menuRef}>
      <button
        type="button"
        className="screen-menu__trigger ui-button"
        aria-label="Open menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        ☰
      </button>

      {menuOpen && (
        <div className="screen-menu__popover ui-panel">
          <button type="button" className="ui-button" onClick={onNewGame}>New Game</button>

          <label className="screen-menu__select-row">
            <span>Mode</span>
            <select
              value={gameMode}
              onChange={(event) => onChangeGameMode(event.target.value)}
            >
              <option value="draft">Draft</option>
              <option value="five-hand-discard">5 Hand Discard</option>
            </select>
          </label>

          <label className="screen-menu__checkbox-row">
            <input
              type="checkbox"
              checked={settings.showOpponentCards}
              onChange={(event) => onUpdateSettings({ showOpponentCards: event.target.checked })}
            />
            <span>Show Opponent Cards</span>
          </label>

          <label className="screen-menu__checkbox-row">
            <input
              type="checkbox"
              checked={settings.wildDeck}
              onChange={(event) => onUpdateSettings({ wildDeck: event.target.checked })}
            />
            <span>Wild Deck</span>
          </label>
        </div>
      )}
    </div>
  )
}
