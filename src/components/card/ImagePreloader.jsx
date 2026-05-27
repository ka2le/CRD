import { useEffect, useMemo } from 'react'
import { getExpandedCoreDeck } from '../../game/cards'

const loadedImages = new Set()

function preloadImage(src) {
  if (!src || loadedImages.has(src)) return

  const image = new Image()
  image.decoding = 'async'
  image.loading = 'eager'
  image.src = src

  const markLoaded = () => loadedImages.add(src)
  image.addEventListener('load', markLoaded, { once: true })
  image.addEventListener('error', markLoaded, { once: true })
}

export default function ImagePreloader() {
  const imageUrls = useMemo(() => {
    const cards = getExpandedCoreDeck()
    return Array.from(new Set(cards.flatMap((card) => card.images ?? []).filter(Boolean)))
  }, [])

  useEffect(() => {
    imageUrls.forEach((src) => preloadImage(src))
  }, [imageUrls])

  return (
    <div aria-hidden="true" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0, pointerEvents: 'none' }}>
      {imageUrls.map((src) => (
        <img key={src} src={src} alt="" loading="eager" decoding="async" fetchPriority="high" />
      ))}
    </div>
  )
}
