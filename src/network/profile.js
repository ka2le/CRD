import { cleanName, randomToken } from './protocol.js'

export const PROFILE_KEY = 'crd-online-profile-v1'
const FIRST = ['Apple', 'Amber', 'Cosmic', 'Velvet', 'Lucky', 'Mango', 'Cobalt', 'Maple', 'Tiny', 'Solar', 'Turbo', 'Jolly', 'Mint', 'Peach', 'Pixel', 'Silver']
const LAST = ['Fireman', 'Dragon', 'Badger', 'Wizard', 'Otter', 'Robot', 'Panda', 'Pilot', 'Knight', 'Fox', 'Ranger', 'Captain', 'Goblin', 'Tiger', 'Comet', 'Wombat']
export function randomName() {
  const values = crypto.getRandomValues(new Uint32Array(2))
  return FIRST[values[0] % FIRST.length] + LAST[values[1] % LAST.length]
}
export function loadProfile(storage) {
  try {
    const value = JSON.parse(storage.getItem(PROFILE_KEY))
    if (/^[a-f0-9]{16}$/.test(value?.id) && cleanName(value.name)) return { id: value.id, name: cleanName(value.name) }
  } catch { /* First visit or unavailable storage. */ }
  let remembered = ''
  try { remembered = cleanName(JSON.parse(storage.getItem('crd-room-v1'))?.name) } catch { /* No earlier room identity. */ }
  const value = { id: randomToken(8), name: remembered || randomName() }
  try { storage.setItem(PROFILE_KEY, JSON.stringify(value)) } catch { /* Still allow immediate AI play. */ }
  return value
}
