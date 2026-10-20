import { useEffect, useMemo } from 'react'
import { getExpandedCoreDeck } from '../../game/cards'
import { getImageUrl } from './imageAssets'

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
    const cards = getExpandedCoreDeck({ tabletop: true })
    // Card back first: it is on screen before any face is revealed.
    const backside = 'https://cdn.midjourney.com/210b3cd1-dec8-453e-8d1a-d967cea6e283/0_0.png'
    return Array.from(new Set([backside, ...cards.flatMap((card) => card.images ?? [])].map(getImageUrl).filter(Boolean)))
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
