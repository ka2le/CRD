// Last on-screen rect per card uid, recorded when a card unmounts. A card that
// remounts elsewhere shortly after (zone change, phase change) animates from it.
const lastRects = new Map()
const RECT_TTL_MS = 700

export function rememberCardRect(uid, rect) {
  if (!uid || !rect || rect.width <= 0) return
  lastRects.set(uid, { rect, time: performance.now() })
}

export function takeCardRect(uid) {
  const entry = lastRects.get(uid)
  if (!entry) return null
  lastRects.delete(uid)
  if (performance.now() - entry.time > RECT_TTL_MS) return null
  return entry.rect
}

export function forgetCardRect(uid) {
  lastRects.delete(uid)
}
