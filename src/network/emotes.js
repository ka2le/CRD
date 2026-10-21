// Fixed emote set for online rooms. Only ids travel over the network; text never does.
export const EMOTES = [
  { id: 'hi', glyph: '👋', label: 'Hi' },
  { id: 'gg', glyph: 'GG', label: 'Good game', text: true },
  { id: 'thumbs', glyph: '👍', label: 'Nice' },
  { id: 'laugh', glyph: '😂', label: 'Haha' },
  { id: 'wow', glyph: '😮', label: 'Wow' },
  { id: 'think', glyph: '🤔', label: 'Hmm' },
  { id: 'grimace', glyph: '😬', label: 'Oops' },
  { id: 'cry', glyph: '😭', label: 'Noo' },
  { id: 'angry', glyph: '😤', label: 'Grr' },
  { id: 'fire', glyph: '🔥', label: 'Fire' },
  { id: 'party', glyph: '🎉', label: 'Party' },
  { id: 'dragon', glyph: '🐉', label: 'Dragon' },
  { id: 'robot', glyph: '🤖', label: 'Robot' },
  { id: 'rabbit', glyph: '🐇', label: 'Critter' },
  { id: 'heart', glyph: '❤️', label: 'Love' },
]

export const EMOTE_IDS = new Set(EMOTES.map((emote) => emote.id))
export const EMOTE_COOLDOWN_MS = 1200

export function getEmote(id) {
  return EMOTES.find((emote) => emote.id === id) ?? null
}

// Shape check for an emote received from the room (sent inside a `sync` message).
export function validEmote(emote) {
  return Boolean(emote && EMOTE_IDS.has(emote.id) && ['host', 'guest'].includes(emote.seat)
    && typeof emote.key === 'string' && /^[a-f0-9]{8,32}$/.test(emote.key))
}
