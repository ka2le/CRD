import { useEffect, useRef, useState } from 'react'
import './Emotes.css'
import { EMOTES, getEmote } from '../../network/emotes'

function SmileIcon() {
  return (
    <svg viewBox="0 0 24 24" className="svg-icon" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M8.3 14.2c1 1.4 2.2 2 3.7 2s2.7-.6 3.7-2" />
        <circle cx="9" cy="10" r=".6" fill="currentColor" />
        <circle cx="15" cy="10" r=".6" fill="currentColor" />
      </g>
    </svg>
  )
}

// Emote picker for online rooms: a small button that opens a grid of emotes above it.
export function EmotePicker({ onSend, disabled = false }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    function close(event) {
      if (event.type === 'keydown' ? event.key === 'Escape' : !rootRef.current?.contains(event.target)) setOpen(false)
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', close)
    }
  }, [open])

  return (
    <span ref={rootRef} className="emote-picker">
      <button type="button" className={['emote-picker__toggle', open ? 'is-open' : ''].filter(Boolean).join(' ')}
        disabled={disabled} aria-label="Send an emote" aria-expanded={open} title="Emotes"
        onClick={() => setOpen((value) => !value)}>
        <SmileIcon />
      </button>
      {open ? (
        <span className="emote-picker__grid" role="menu" aria-label="Emotes">
          {EMOTES.map((emote) => (
            <button key={emote.id} type="button" role="menuitem" title={emote.label} aria-label={emote.label}
              className={['emote-picker__item', emote.text ? 'emote-picker__item--text' : ''].filter(Boolean).join(' ')}
              onClick={() => { if (onSend(emote.id) !== false) setOpen(false) }}>
              {emote.glyph}
            </button>
          ))}
        </span>
      ) : null}
    </span>
  )
}

const BUBBLE_MS = 2600

// The latest emote from one side, popping out of that side's rail for a moment.
export function EmoteBubble({ emote, side }) {
  const [shownKey, setShownKey] = useState(null)
  useEffect(() => {
    if (!emote?.key) return undefined
    const showId = window.setTimeout(() => setShownKey(emote.key), 0)
    const hideId = window.setTimeout(() => setShownKey((key) => (key === emote.key ? null : key)), BUBBLE_MS)
    return () => {
      window.clearTimeout(showId)
      window.clearTimeout(hideId)
    }
  }, [emote?.key])
  const data = emote && shownKey === emote.key ? getEmote(emote.id) : null
  if (!data) return null
  return (
    <span key={emote.key} className={['emote-bubble', `emote-bubble--${side}`, data.text ? 'emote-bubble--text' : ''].filter(Boolean).join(' ')}
      role="status" aria-label={data.label}>
      {data.glyph}
    </span>
  )
}
