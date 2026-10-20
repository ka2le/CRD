export default function PlayerIdentity({ name, wins = null, connected = true, editable = false, onRename, label }) {
  return <div className="player-identity">
    <span className={`player-identity__dot${connected ? ' is-online' : ''}`} title={connected ? 'Online' : 'Offline'} />
    {editable ? <input key={name} aria-label={label ?? 'Your online name'} title="Edit your name" defaultValue={name} maxLength={24}
      onBlur={(event) => onRename(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} />
      : <strong>{name}</strong>}
    {wins !== null ? <span className="player-identity__wins" title="Wins in this room">{wins} {wins === 1 ? 'win' : 'wins'}</span> : null}
  </div>
}
