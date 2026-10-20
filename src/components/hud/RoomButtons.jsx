import { SvgIcon } from '../ui/GameIcon'

// Top-bar room controls: one Invite button that always does the same thing
// (create a room if needed, then copy its link) plus a players button once in a room.
export default function RoomButtons({ room, onOpenRoom }) {
  const inRoom = Boolean(room.record)
  const creating = Boolean(room.entry)
  const pending = room.presence?.pending?.length ?? 0
  const presence = room.presence
  const online = [presence?.host, presence?.guest, ...(presence?.viewers ?? [])].filter((member) => member?.connected).length
  function invite() {
    if (inRoom) room.client.copyInvite()
    else room.client.requestEntry()
  }
  return <>
    {room.record?.role === 'pending' ? null : <button type="button" className={['ui-button', 'online-action', room.copied ? 'is-copied' : '', creating ? 'is-busy' : ''].filter(Boolean).join(' ')}
      disabled={creating} onClick={invite} title={inRoom ? 'Copy the invite link' : 'Create a room and copy its invite link'}>
      <SvgIcon name={room.copied ? 'check' : 'invite'} /><span>{room.copied ? 'Copied' : 'Invite'}</span>
    </button>}
    {inRoom ? <button type="button" className={`ui-button online-controls${pending ? ' has-requests' : ''}`}
      aria-label={pending ? `Room: ${pending} waiting to join` : `Room: ${online} online`} title="Room and players" onClick={onOpenRoom}>
      <SvgIcon name="online" />
      <span className="online-controls__count">{online || '–'}</span>
      {pending ? <span className="online-controls__badge">{pending}</span> : null}
    </button> : null}
  </>
}
