import { useState } from 'react'
import Sheet from './Sheet'
import { DEFAULT_RELAY_URL, normalizeRelay, readRoomInvite, RELAY_STORAGE_KEY } from '../../network/RoomClient'
import './RoomSheet.css'

export default function RoomSheet({ open, onClose, room }) {
  const [code, setCode] = useState('')
  const [endpoint, setEndpoint] = useState(DEFAULT_RELAY_URL)
  const record = room.record
  const presence = room.presence
  const host = record?.role === 'host'
  const requests = presence?.pending ?? []
  function joinCode() {
    const invite = code.includes('#') ? readRoomInvite(code) : { id: code.trim(), endpoint }
    room.client.requestEntry(invite.id, invite.endpoint || endpoint)
    onClose()
  }
  function changeRelay() {
    try { room.client.storage.setItem(RELAY_STORAGE_KEY, normalizeRelay(endpoint)) }
    catch (error) { room.client.emit({ error: error.message }) }
  }
  return <Sheet open={open} onClose={onClose} title="Online room">
    <div className="room-sheet">
      <label>Online name<input key={room.profile.name} defaultValue={room.profile.name} maxLength={24}
        onBlur={(event) => room.client.rename(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} /></label>
      {record ? <>
        <p>{room.connection === 'connected' ? 'Connected' : 'Reconnecting…'} · {record.role === 'viewer' ? 'Watching' : record.role === 'pending' ? 'Waiting for approval' : host ? 'You are the host' : 'Player two'}</p>
        <button className="ui-button ui-button--primary" onClick={() => room.client.copyInvite()}>Invite</button>
        <label>Invitation<input readOnly value={room.client.invitation()} onFocus={(event) => event.target.select()} /></label>
        {host ? <label className="room-sheet__privacy"><input type="checkbox" checked={presence?.private ?? false}
          disabled={room.connection !== 'connected'} onChange={(event) => room.client.setPrivate(event.target.checked)} /> Private room · approve new arrivals</label> : null}
        <div className="room-sheet__members">
          {[presence?.host, presence?.guest].map((member, index) => member ? <div className="room-member" key={member.id}>
            <span><strong>{member.name}</strong><small>{index === 0 ? 'Host' : 'Player two'} · {member.connected ? 'Online' : 'Offline'} · {record.scores?.[member.id] ?? 0} wins</small></span>
            {host && index === 1 ? <button className="ui-button" onClick={() => room.client.kick(member.id)}>Kick</button> : null}
          </div> : <p key={index}>Player two seat is open</p>)}
          {presence?.viewers?.map((member) => <div className="room-member" key={member.id}>
            <span><strong>{member.name}</strong><small>Viewer · {member.connected ? 'Online' : 'Offline'}</small></span>
            {host ? <div className="room-sheet__actions">{!presence.guest?.connected ? <button className="ui-button" onClick={() => room.client.promote(member.id)}>Seat player two</button> : null}
              <button className="ui-button" onClick={() => room.client.kick(member.id)}>Kick</button></div> : null}
          </div>)}
        </div>
        {host && requests.length ? <div className="room-sheet__request">{requests.map((person) => <div className="room-member" key={person.id}>
          <span><strong>{person.name}</strong><small>Wants to {person.desired === 'viewer' ? 'watch' : 'play'}</small></span>
          <div className="room-sheet__actions"><button className="ui-button ui-button--primary" onClick={() => room.client.approve(true, person.id)}>Accept</button>
            <button className="ui-button" onClick={() => room.client.approve(false, person.id)}>Decline</button></div>
        </div>)}</div> : null}
        <p className="room-sheet__fine">A disconnected player-two seat can be continued from another device using this invite. Viewers need approval and cannot play. Wins count in this room.</p>
        <button className="ui-button" onClick={() => { room.client.leave(); onClose() }}>{host ? 'Close room' : 'Disconnect from room'}</button>
      </> : <>
        <p>Start a room and send its invite. Your AI game continues until a friend joins.</p>
        <button className="ui-button ui-button--primary" onClick={() => { room.client.requestEntry(); onClose() }}>Create a room</button>
        <details><summary>Join by code or change service</summary>
          <label>Room code or invitation<input value={code} onChange={(event) => setCode(event.target.value)} /></label>
          <button className="ui-button" disabled={!code.trim()} onClick={joinCode}>Join</button>
          <label>Room service<input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} onBlur={changeRelay} /></label>
        </details>
      </>}
      {room.error || room.notice ? <p role="status" className="room-sheet__notice">{room.error || room.notice}</p> : null}
    </div>
  </Sheet>
}
