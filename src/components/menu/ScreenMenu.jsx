import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import './ScreenMenu.css'
import { GameIcon, SvgIcon } from '../ui/GameIcon'
import { getOpponentAiOptions } from '../../game/opponentAi'

// Playable scoring modes. Abilities Prototype is intentionally hidden.
const BATTLE_RULES = [
  { value: false, label: 'Battle' },
  { value: 'threshold', label: 'Threshold' },
  { value: 'abilities-main', label: 'Abilities' },
]

export default function ScreenMenu({ onNewGame, gameMode, onChangeGameMode, settings, onUpdateSettings, battleAnimation = true, onBattleAnimation, onHelp, onScoreCard, onCollection, onTestDeck, onRoom, inRoom = false, canConfigure = true, humanOpponent = false }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const menuRef = useRef(null)
  const popoverRef = useRef(null)

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

  // Keep the popover inside the viewport; it scrolls when the screen is short (e.g. phone landscape).
  useLayoutEffect(() => {
    if (!menuOpen) return undefined
    function fit() {
      const popover = popoverRef.current
      if (!popover) return
      const top = popover.getBoundingClientRect().top
      popover.style.maxHeight = `${Math.max(120, window.innerHeight - top - 10)}px`
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [menuOpen])

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
        <div className="screen-menu__popover ui-panel" ref={popoverRef}>
          <button type="button" disabled={!canConfigure} className="screen-menu__item screen-menu__item--primary" onClick={() => run(onNewGame)}>
            <SvgIcon name="replay" />
            <span>New game</span>
          </button>

          <button type="button" className="screen-menu__item" onClick={() => run(onRoom)}><SvgIcon name="online" /><span>{inRoom ? 'Room & players' : 'Play online'}</span></button>
          <fieldset className="screen-menu__game-controls" disabled={!canConfigure}>
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

          <div className="screen-menu__group">
            <span className="screen-menu__select-label">Battle</span>
            <div className="screen-menu__segmented" role="radiogroup" aria-label="Battle rules">
              {BATTLE_RULES.map(({ value, label }) => (
                <button
                  key={label}
                  type="button"
                  role="radio"
                  aria-checked={(settings.tabletop || false) === value}
                  className={(settings.tabletop || false) === value ? 'is-on' : ''}
                  onClick={() => run(() => (settings.tabletop || false) !== value && onUpdateSettings({ tabletop: value }))}
                >
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>

          <label className="screen-menu__select">
            <span className="screen-menu__select-label">Opponent</span>
            <select
              value={humanOpponent ? 'human' : settings.opponentAi}
              disabled={humanOpponent}
              onChange={(event) => run(() => onUpdateSettings({ opponentAi: event.target.value }))}
              aria-label="Opponent"
            >
              {humanOpponent ? <option value="human">Player in room</option> : null}
              {getOpponentAiOptions(gameMode).map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
            <span className="screen-menu__select-chevron" aria-hidden="true" />
          </label>

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

          <label className="screen-menu__toggle">
            <input
              type="checkbox"
              checked={Boolean(settings.testing)}
              disabled={humanOpponent}
              onChange={(event) => onUpdateSettings({ testing: event.target.checked })}
            />
            <span className="screen-menu__switch" aria-hidden="true" />
            <SvgIcon name="flask" />
            <span>Testing</span>
          </label>

          {settings.testing ? (
            <button type="button" className="screen-menu__item" onClick={() => run(onTestDeck)}>
              <SvgIcon name="flask" />
              <span>Test deck</span>
            </button>
          ) : null}

          </fieldset>
          {/* Personal display preference: not a shared room setting, never deals a new game. */}
          <label className="screen-menu__toggle">
            <input
              type="checkbox"
              checked={battleAnimation}
              onChange={(event) => onBattleAnimation?.(event.target.checked)}
            />
            <span className="screen-menu__switch" aria-hidden="true" />
            <SvgIcon name="swords" />
            <span>Battle animation</span>
          </label>

          <div className="screen-menu__row screen-menu__row--split">
            <button type="button" className="screen-menu__item" onClick={() => run(onCollection)}>
              <SvgIcon name="collection" />
              <span>Collection</span>
            </button>
            <button type="button" className="screen-menu__item" onClick={() => run(onScoreCard)}>
              <GameIcon name="star" />
              <span>Score card</span>
            </button>
          </div>

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
