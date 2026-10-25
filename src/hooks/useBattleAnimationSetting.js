import { useCallback, useState } from 'react'

// Personal display preference, kept out of the shared (room-synced) game settings.
// Off: regular battles jump to their final round and tabletop scores appear at once.
const STORAGE_KEY = 'crd-battle-animation-v1'

function readSetting() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

export default function useBattleAnimationSetting() {
  const [enabled, setEnabled] = useState(readSetting)
  const update = useCallback((next) => {
    setEnabled(next)
    try { window.localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off') } catch { /* Preference lasts this visit only. */ }
  }, [])
  return [enabled, update]
}
