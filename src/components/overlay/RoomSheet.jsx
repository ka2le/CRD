import { useEffect, useRef, useState } from 'react'
import Sheet from './Sheet'
import { RELAY_STORAGE_KEY, DEFAULT_RELAY_URL, normalizeRelay, readRoomInvite } from '../../network/RoomClient'
import './RoomSheet.css'

function savedRelay() {
  try { return localStorage.getItem(RELAY_STORAGE_KEY) ?? '' } catch { return '' }
}

function BotCheck({ config, onToken }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!config?.siteKey) return undefined
    let cancelled = false
    let widget
    let script = document.querySelector('script[data-crd-turnstile]')
    const mount = () => {
      if (cancelled || !window.turnstile || !ref.current) return
      widget = window.turnstile.render(ref.current, { sitekey: config.siteKey, action: 'room-entry', theme: 'dark',
        callback: onToken, 'expired-callback': () => onToken(''), 'error-callback': () => onToken('') })
    }
    if (window.turnstile) mount()
    else {
      if (!script) {
        script = document.createElement('script')
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
        script.dataset.crdTurnstile = 'true'
        script.async = true
        document.head.appendChild(script)
      }
      script.addEventListener('load', mount)
    }
    return () => { cancelled = true; script?.removeEventListener('load', mount); if (widget !== undefined) window.turnstile?.remove(widget) }
  }, [config, onToken])
  return <div ref={ref} />
}

export default function RoomSheet({ open, onClose, room, session }) {
  const invite = readRoomInvite()
  const [endpoint, setEndpoint] = useState(() => invite.endpoint || import.meta.env.VITE_ROOM_RELAY_URL || savedRelay() || DEFAULT_RELAY_URL)
  const [name, setName] = useState('')
  const [code, setCode] = useState(invite.id)
  const [config, setConfig] = useState(null)
  const [challenge, setChallenge] = useState('')
  const [challengeKey, setChallengeKey] = useState(0)
  const [working, setWorking] = useState(false)
  const [notice, setNotice] = useState('')
  const record = room.record
  useEffect(() => {
    if (!open || record || !endpoint) return undefined
    let ignore = false
    const timer = setTimeout(() => {
      let base
      try { base = normalizeRelay(endpoint) } catch { return }
      fetch(`${base}/config`).then((r) => { if (!r.ok) throw new Error('Relay unavailable'); return r.json() })
        .then((value) => { if (!ignore) { setConfig(value); setNotice('') } })
        .catch(() => { if (!ignore) { setConfig(null); setNotice('Cannot reach this relay address.') } })
    }, 400)
    return () => { ignore = true; clearTimeout(timer) }
  }, [open, endpoint, record])
  const link = record ? `${window.location.origin}${window.location.pathname}#${new URLSearchParams({ room: record.id, relay: record.endpoint })}` : ''
  async function enter(join) {
    setWorking(true)
    setNotice('')
    try {
      let id = code.trim()
      if (join && id.includes('#')) id = readRoomInvite(id).id
      await room.client.enter({ endpoint, name, id: join ? id : null, challenge })
      setChallenge('')
      setChallengeKey((key) => key + 1)
      if (window.location.hash.includes('room=')) history.replaceState(null, '', window.location.pathname + window.location.search)
    } catch (error) { setNotice(error.message); setChallenge(''); setChallengeKey((key) => key + 1) }
    finally { setWorking(false) }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(link); setNotice('Invitation copied') }
    catch { setNotice('Select and copy the invitation below.') }
  }
  function play() { try { room.client.playTogether(session); onClose() } catch (error) { setNotice(error.message) } }
  const canEnter = Boolean(name.trim() && endpoint && config && (challenge || config.localTesting)) && !working
  return <Sheet open={open} onClose={onClose} title="Online room">
    <div className="room-sheet">
      {record ? <>
        <p className="room-sheet__status">{room.connection === 'connected' ? 'Connected' : 'Reconnecting…'} · {record.role === 'host' ? 'You are the host' : record.role === 'guest' ? 'You are the guest' : 'Waiting for host approval'}</p>
        <p>{room.presence?.host?.name ?? (record.role === 'host' ? record.name : 'Host')}{room.presence?.host?.connected ? ' ●' : ' (offline)'}
          {room.presence?.guest ? ` · ${room.presence.guest.name}${room.presence.guest.connected ? ' ●' : ' (offline)'}` : ' · Guest seat open'}</p>
        <label>Room code<input readOnly value={record.id} /></label>
        <label>Invitation<input readOnly value={link} onFocus={(event) => event.target.select()} /></label>
        <button className="ui-button" type="button" onClick={copy}>Copy invitation</button>
        {record.role === 'host' && room.presence?.pending ? <div className="room-sheet__request">
          <p>{room.presence.pending.name} wants to join</p>
          <div className="room-sheet__actions"><button className="ui-button ui-button--primary" onClick={() => room.client.approve(true)}>Accept</button>
            <button className="ui-button" onClick={() => room.client.approve(false)}>Decline</button></div>
        </div> : null}
        {record.role === 'host' ? <>
          <p>Keep playing AI while you wait. Starting together deals a fresh game with your current mode and battle rules.</p>
          <button className="ui-button ui-button--primary" disabled={!room.presence?.guest || room.connection !== 'connected'} onClick={play}>{room.session ? 'New two-player game' : 'Play together'}</button>
          {room.session ? <button className="ui-button" onClick={() => room.client.playAi()}>Play AI in this room</button> : null}
        </> : <p>{record.role === 'pending' ? 'Your request is saved. You can refresh this page while waiting.' : room.session ? 'Your seat and game restore automatically after a refresh.' : 'Play AI while the host gets ready. Their next two-player game will open here automatically.'}</p>}
        <p className="room-sheet__fine">Room expires {room.presence?.expires ? new Date(room.presence.expires).toLocaleString() : '24 hours after creation'}. Tokens stay in this browser. Private browsing or clearing site data removes them.</p>
        <button className="ui-button" onClick={() => { room.client.leave(); onClose() }}>{record.role === 'host' ? 'Close room and return to AI' : 'Leave room and return to AI'}</button>
      </> : <>
        <p>Invite a friend, or join their room. Your AI game continues until a two-player game starts.</p>
        <label>Your name<input value={name} maxLength={24} onChange={(event) => setName(event.target.value)} autoComplete="nickname" /></label>
        <label>Room code or invitation<input value={code} onChange={(event) => {
          const value = event.target.value
          setCode(value)
          if (value.includes('#')) { const parsed = readRoomInvite(value); if (parsed.endpoint) { setEndpoint(parsed.endpoint); setConfig(null); setChallenge('') } }
        }} /></label>
        <details open={!endpoint}><summary>Room service</summary>
          <label>Relay address<input placeholder="https://crd-rooms.example.workers.dev" value={endpoint} onChange={(event) => { setEndpoint(event.target.value); setConfig(null); setChallenge('') }} /></label>
          <p className="room-sheet__fine">The relay is configured once. Invitation links include its address.</p>
        </details>
        {config?.siteKey ? <BotCheck key={challengeKey} config={config} onToken={setChallenge} /> : null}
        {config && !config.siteKey && !config.localTesting ? <p>The relay owner needs to configure its bot check before rooms can open.</p> : null}
        <div className="room-sheet__actions">
          <button className="ui-button ui-button--primary" disabled={!canEnter} onClick={() => enter(false)}>{working ? 'Connecting…' : 'Create room'}</button>
          <button className="ui-button" disabled={!canEnter || !code.trim()} onClick={() => enter(true)}>Join room</button>
        </div>
      </>}
      {notice || room.error ? <p role="status" className="room-sheet__notice">{notice || room.error}</p> : null}
    </div>
  </Sheet>
}
