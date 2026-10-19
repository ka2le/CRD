import { useLayoutEffect, useState } from 'react'

export const CARD_ASPECT = 635 / 888

// Observe an element's content box. Returns [ref callback, size].
export function useElementSize() {
  const [element, setElement] = useState(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    if (!element) return undefined

    const measure = () => {
      const rect = element.getBoundingClientRect()
      setSize((current) => (
        Math.abs(current.width - rect.width) < 0.5 && Math.abs(current.height - rect.height) < 0.5
          ? current
          : { width: rect.width, height: rect.height }
      ))
    }

    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }

    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [element])

  return [setElement, size]
}

// Largest card size that fits `count` cards into a width x height box.
// Ties prefer more columns (a wide row reads better than a tall stack).
export function computeGridFit({
  width,
  height,
  count,
  gap = 6,
  aspect = CARD_ASPECT,
  maxCardHeight = Infinity,
  maxCols = Infinity,
}) {
  const safeCount = Math.max(1, count)
  let best = { cardWidth: 0, cols: 1, rows: safeCount }

  if (width <= 0 || height <= 0) return best

  for (let cols = 1; cols <= Math.min(safeCount, maxCols); cols += 1) {
    const rows = Math.ceil(safeCount / cols)
    const byWidth = (width - (gap * (cols - 1))) / cols
    const byHeight = ((height - (gap * (rows - 1))) / rows) * aspect
    const cardWidth = Math.floor(Math.min(byWidth, byHeight, maxCardHeight * aspect))

    if (cardWidth >= best.cardWidth) {
      best = { cardWidth, cols, rows }
    }
  }

  return best
}

// Single row sized from width (stable for `slots` cards); extra cards overlap
// like a real hand. Card icons sit on the left edge, so overlap keeps them visible.
export function computeRowFit({
  width,
  count,
  slots = 5,
  gap = 6,
  aspect = CARD_ASPECT,
  maxCardHeight = Infinity,
  minVisibleFraction = 0.42,
}) {
  if (width <= 0) return { cardWidth: 0, step: 0 }

  const baseSlots = Math.max(slots, 1)
  let cardWidth = Math.floor(Math.min(
    (width - (gap * (baseSlots - 1))) / baseSlots,
    maxCardHeight * aspect,
  ))

  if (count <= 1) return { cardWidth, step: cardWidth + gap }

  let step = cardWidth + gap
  const needed = (count - 1) * step + cardWidth

  if (needed > width) {
    step = (width - cardWidth) / (count - 1)
    if (step < cardWidth * minVisibleFraction) {
      cardWidth = Math.floor(width / (1 + (minVisibleFraction * (count - 1))))
      step = cardWidth * minVisibleFraction
    }
  }

  return { cardWidth, step }
}
