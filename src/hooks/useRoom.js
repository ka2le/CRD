import { useEffect, useState, useSyncExternalStore } from 'react'
import RoomClient from '../network/RoomClient.js'

export default function useRoom() {
  const [client] = useState(() => new RoomClient())
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot)
  useEffect(() => {
    const followInvite = () => client.followInvite()
    client.start()
    window.addEventListener('hashchange', followInvite)
    return () => { window.removeEventListener('hashchange', followInvite); client.stop() }
  }, [client])
  return { ...state, client, dispatch: client.dispatch }
}
