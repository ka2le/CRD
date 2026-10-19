import { useEffect, useRef, useState } from 'react'
import './ScreenMenu.css'
import { GameIcon, SvgIcon } from '../ui/GameIcon'

export default function ScreenMenu({ onNewGame, gameMode, onChangeGameMode, settings, onUpdateSettings, onHelp }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    function handlePointerDown(event) {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false)
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  useEffect(() => {
    function handleFullscreenChange() {
      setFullscreen(Boolean(document.fullscreenElement))
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    handleFullscreenChange()
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await document.documentElement.requestFullscreen()
      }
    } catch {
      // Browser/fullscreen permission failures should not break the menu.
    }
  }

  function run(action) {
    setMenuOpen(false)
    action?.()
  }

  return (
    <div className="screen-menu" ref={menuRef}>
      <button
        type="button"
        className="screen-menu__trigger ui-button ui-button--icon"
        aria-label="Open menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <SvgIcon name={menuOpen ? 'close' : 'menu'} />
      </button>

      {menuOpen && (
        <div className="screen-menu__popover ui-panel">
          <button type="button" className="screen-menu__item screen-menu__item--primary" onClick={() => run(onNewGame)}>
            <SvgIcon name="replay" />
            <span>New game</span>
          </button>

          <div className="screen-menu__segmented" role="radiogroup" aria-label="Mode">
            <button
              type="button"
              role="radio"
              aria-checked={gameMode === 'draft'}
              className={gameMode === 'draft' ? 'is-on' : ''}
              onClick={() => run(() => gameMode !== 'draft' && onChangeGameMode('draft'))}
            >
              <GameIcon name="copy" />
              <span>Draft</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={gameMode === 'five-hand-discard'}
              className={gameMode === 'five-hand-discard' ? 'is-on' : ''}
              onClick={() => run(() => gameMode !== 'five-hand-discard' && onChangeGameMode('five-hand-discard'))}
            >
              <GameIcon name="redraw" />
              <span>Discard</span>
            </button>
          </div>

          <label className="screen-menu__toggle">
            <input
              type="checkbox"
              checked={settings.showOpponentCards}
              onChange={(event) => onUpdateSettings({ showOpponentCards: event.target.checked })}
            />
            <span className="screen-menu__switch" aria-hidden="true" />
            <SvgIcon name="eye" />
            <span>Opponent cards</span>
          </label>

          <label className="screen-menu__toggle">
            <input
              type="checkbox"
              checked={settings.wildDeck}
              onChange={(event) => onUpdateSettings({ wildDeck: event.target.checked })}
            />
            <span className="screen-menu__switch" aria-hidden="true" />
            <GameIcon name="star" />
            <span>Wild deck</span>
          </label>

          <div className="screen-menu__row">
            <button type="button" className="screen-menu__item" onClick={() => run(onHelp)}>
              <SvgIcon name="help" />
              <span>How to play</span>
            </button>
            <button type="button" className="screen-menu__item screen-menu__item--square" onClick={() => run(toggleFullscreen)} aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
              <SvgIcon name="fullscreen" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
