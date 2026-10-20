import { useRef, useState } from 'react'
import { SvgIcon } from '../ui/GameIcon'

// Name shown as plain text; tapping it (when editable) swaps in a focused input.
// Enter or leaving the field saves, Escape cancels.
export function NameEditor({ name, onRename, label = 'Your online name', className = '' }) {
  const [editing, setEditing] = useState(false)
  const done = useRef(false)
  if (!editing) {
    return <button type="button" className={`name-editor ${className}`} title="Change your name" aria-label={`${label}: ${name}. Change`}
      onClick={() => { done.current = false; setEditing(true) }}>
      <span className="name-editor__text">{name}</span>
      <SvgIcon name="edit" className="name-editor__pen" />
    </button>
  }
  function finish(event, save) {
    if (done.current) return
    done.current = true
    const value = event.currentTarget.value.trim()
    setEditing(false)
    if (save && value && value !== name) onRename(value)
  }
  return <input className={`name-editor name-editor--editing ${className}`} aria-label={label} defaultValue={name} maxLength={24}
    autoFocus onFocus={(event) => event.target.select()} enterKeyHint="done" autoComplete="off" spellCheck={false}
    onBlur={(event) => finish(event, true)}
    onKeyDown={(event) => {
      if (event.key === 'Enter') finish(event, true)
      else if (event.key === 'Escape') { event.stopPropagation(); finish(event, false) }
    }} />
}

export default function PlayerIdentity({ name, wins = null, connected = true, editable = false, onRename, label }) {
  return <div className="player-identity">
    <span className={`player-identity__dot${connected ? ' is-online' : ''}`} title={connected ? 'Online' : 'Offline'} />
    {editable ? <NameEditor name={name} onRename={onRename} label={label} /> : <strong>{name}</strong>}
    {wins !== null ? <span className="player-identity__wins" title="Wins in this room">{wins} {wins === 1 ? 'win' : 'wins'}</span> : null}
  </div>
}
