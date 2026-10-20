import { useState } from 'react'
import Sheet from './Sheet'
import { NameEditor } from '../hud/PlayerIdentity'
import { SvgIcon } from '../ui/GameIcon'
import { DEFAULT_RELAY_URL, normalizeRelay, readRoomInvite, RELAY_STORAGE_KEY } from '../../network/RoomClient'
import './RoomSheet.css'

const ROLE_LABELS = { host: 'Host', guest: 'Player two', viewer: 'Watching', pending: 'Waiting for approval' }

function winsLabel(wins) { return `${wins} ${wins === 1 ? 'win' : 'wins'}` }

function Member({ member, you, detail, onRename, children }) {
  return <li className={`room-member${member.connected ? '' : ' is-offline'}`}>
    <span className={`player-identity__dot${member.connected ? ' is-online' : ''}`} title={member.connected ? 'Online' : 'Offline'} />
    <span className="room-member__info">
      {you && onRename ? <NameEditor name={member.name} onRename={onRename} /> : <strong>{member.name}</strong>}
      <small>{you ? 'You · ' : ''}{detail}{member.connected ? '' : ' · offline'}</small>
    </span>
    {children ? <span className="room-member__actions">{children}</span> : null}
  </li>
}

function AdvancedJoin({ room, onClose }) {
  const [code, setCode] = useState('')
  const [endpoint, setEndpoint] = useState(() => {
    try { return room.client.storage.getItem(RELAY_STORAGE_KEY) || DEFAULT_RELAY_URL } catch { return DEFAULT_RELAY_URL }
  })
  function join() {
    const invite = code.includes('#') ? readRoomInvite(code) : { id: code.trim(), endpoint }
    room.client.requestEntry(invite.id, invite.endpoint || endpoint)
    onClose()
  }
  function changeRelay() {
    try { room.client.storage.setItem(RELAY_STORAGE_KEY, normalizeRelay(endpoint)) }
    catch (error) { room.client.emit({ error: error.message }) }
  }
  return <details className="room-sheet__advanced">
    <summary>Join with a code</summary>
    <div className="room-sheet__field">
      <input aria-label="Room code or invite link" placeholder="Paste a code or invite link" value={code} onChange={(event) => setCode(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter' && code.trim()) join() }} />
      <button type="button" className="ui-button" disabled={!code.trim()} onClick={join}>Join</button>
    </div>
    <label className="room-sheet__label">Room service
      <input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} onBlur={changeRelay} spellCheck={false} />
    </label>
  </details>
}

export default function RoomSheet({ open, onClose, room }) {
  const record = room.record
  const presence = room.presence ?? record?.roster
  const role = record?.role
  const host = role === 'host'
  const connected = room.connection === 'connected'
  const requests = room.presence?.pending ?? []
  const scores = record?.scores ?? {}
  const rename = (name) => room.client.rename(name)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const link = record ? room.client.invitation() : ''

  return <Sheet open={open} onClose={onClose} title={record ? 'Room' : 'Play online'}>
    <div className="room-sheet">
      {room.error ? <p role="alert" className="room-sheet__notice">{room.error}</p> : null}
      {record ? <>
        <p className="room-sheet__status">
          <span className={`player-identity__dot${connected ? ' is-online' : ''}`} />
          {connected ? 'Connected' : 'Reconnecting…'} · {ROLE_LABELS[role] ?? 'In room'}
        </p>

        {requests.length && host ? <section className="room-sheet__requests" aria-label="Join requests">
          {requests.map((person) => <div className="room-request" key={person.id}>
            <span><strong>{person.name}</strong> wants to {person.desired === 'viewer' ? 'watch' : 'play'}</span>
            <span className="room-member__actions">
              <button type="button" className="ui-button ui-button--primary" onClick={() => room.client.approve(true, person.id)}>Let in</button>
              <button type="button" className="ui-button" onClick={() => room.client.approve(false, person.id)}>No</button>
            </span>
          </div>)}
        </section> : null}

        <section className="room-sheet__invite">
          <span className="room-sheet__label">Invite link</span>
          <div className="room-sheet__field">
            <input readOnly value={link} aria-label="Invite link" onFocus={(event) => event.target.select()} />
            <button type="button" className={`ui-button ui-button--primary${room.copied ? ' is-copied' : ''}`} onClick={() => room.client.copyInvite()}>
              <SvgIcon name={room.copied ? 'check' : 'link'} />{room.copied ? 'Copied' : 'Copy'}
            </button>
            {canShare ? <button type="button" className="ui-button ui-button--icon" aria-label="Share invite link" title="Share"
              onClick={() => navigator.share({ title: 'Play CRD with me', url: link }).catch(() => {})}><SvgIcon name="share" /></button> : null}
          </div>
          <small>Anyone with the link joins straight into a game{presence?.private ? ' once you let them in' : ''}.</small>
        </section>

        <section>
          <span className="room-sheet__label">Players</span>
          <ul className="room-sheet__members">
            {presence?.host ? <Member member={presence.host} you={role === 'host'} onRename={rename}
              detail={`Host · ${winsLabel(scores[presence.host.id] ?? 0)}`} /> : null}
            {presence?.guest ? <Member member={presence.guest} you={role === 'guest'} onRename={rename}
              detail={`Player two · ${winsLabel(scores[presence.guest.id] ?? 0)}`}>
              {host ? <button type="button" className="ui-button" onClick={() => room.client.kick(presence.guest.id)}>Remove</button> : null}
            </Member> : <li className="room-member room-member--empty">Waiting for a friend to open the invite…</li>}
            {presence?.viewers?.map((member) => <Member key={member.id} member={member} you={member.id === record.playerId}
              onRename={rename} detail="Watching">
              {host ? <>
                {!presence.guest?.connected ? <button type="button" className="ui-button" onClick={() => room.client.promote(member.id)}>Let play</button> : null}
                <button type="button" className="ui-button" onClick={() => room.client.kick(member.id)}>Remove</button>
              </> : null}
            </Member>)}
          </ul>
        </section>

        {host ? <label className="room-sheet__toggle">
          <input type="checkbox" checked={presence?.private ?? false} disabled={!connected}
            onChange={(event) => room.client.setPrivate(event.target.checked)} />
          <span className="room-switch" aria-hidden="true" />
          <span className="room-sheet__toggle-text"><strong>Ask before people join</strong><small>New arrivals wait until you let them in.</small></span>
        </label> : null}

        <button type="button" className="ui-button room-sheet__leave" onClick={() => { room.client.leave(); onClose() }}>
          {host ? 'Close room' : 'Leave room'}
        </button>
        <p className="room-sheet__fine">{host
          ? 'Ends the room for everyone. Extra visitors can watch, and player two can reopen the link to continue on another device.'
          : role === 'guest' ? 'Ends this match and takes you back to your own AI game.' : 'Takes you back to your own AI game.'}</p>
      </> : <>
        <p className="room-sheet__lead">Send a link to a friend. When they open it you both jump straight into a fresh game. Your AI game keeps going until they arrive.</p>
        <button type="button" className="ui-button ui-button--primary room-sheet__cta" disabled={Boolean(room.entry)}
          onClick={() => room.client.requestEntry()}>
          <SvgIcon name="invite" />{room.entry ? 'Creating link…' : 'Invite a friend'}
        </button>
        <small className="room-sheet__hint">The invite link is copied as soon as the room is ready.</small>
        <div className="room-sheet__name">
          <span className="room-sheet__label">Your name</span>
          <NameEditor name={room.profile.name} onRename={rename} />
        </div>
        <AdvancedJoin room={room} onClose={onClose} />
      </>}
    </div>
  </Sheet>
}
