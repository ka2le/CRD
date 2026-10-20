import { useCallback, useEffect, useRef, useState } from 'react'
import TurnstileGate from './TurnstileGate'
import './RoomSheet.css'

export default function RoomEntry({ room }) {
  const request = room.entry
  const [config, setConfig] = useState(null)
  const [error, setError] = useState('')
  const started = useRef(false)
  const enter = useCallback(async (challenge) => {
    if (!challenge || started.current) return
    started.current = true
    try { await room.client.enter({ ...request, challenge: challenge === 'local-testing' ? '' : challenge }) }
    catch (err) { setError(err.message) }
  }, [request, room.client])
  useEffect(() => {
    let cancelled = false
    fetch(`${request.endpoint}/config`).then((response) => {
      if (!response.ok) throw new Error('Cannot reach the room service')
      return response.json()
    }).then((value) => {
      if (cancelled) return
      setConfig(value)
      if (value.localTesting) enter('local-testing')
      else if (!value.siteKey) setError('The room service needs its bot check configured')
    }).catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [request.endpoint, enter])
  return <div className="room-entry ui-panel" role="status">
    <span>{error || (request.id ? 'Joining your friend…' : 'Creating your room…')}</span>
    {config?.siteKey && !config.localTesting && !error ? <TurnstileGate siteKey={config.siteKey} onToken={enter} onError={setError} /> : null}
    {error ? <button className="ui-button" onClick={() => { room.client.cancelEntry(); room.client.requestEntry(request.id, request.endpoint) }}>Retry</button> : null}
    <button className="ui-button ui-button--icon" aria-label="Cancel room connection" onClick={() => room.client.cancelEntry()}>×</button>
  </div>
}
