import { useLayoutEffect, useRef, useState } from 'react'
import './ShuffleIntro.css'
import { CardBack } from '../card/CardVisual'
import { useCardMotion } from '../animation/CardMotionContext'
import { SHUFFLE_LEAD_MS } from '../../hooks/dealTiming'

const RIFFLE_MS = SHUFFLE_LEAD_MS - 240

// Big riffle shuffle in the middle of the table, then the deck settles into its pile.
export default function ShuffleIntro() {
  const ref = useRef(null)
  const { getAnchorRect } = useCardMotion()
  const [done, setDone] = useState(false)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return undefined
    let settle = null

    const timeoutId = window.setTimeout(() => {
      const from = element.getBoundingClientRect()
      const to = getAnchorRect('draw-deck', 'default')
      if (!to || !from.width) {
        setDone(true)
        return
      }
      const dx = (to.left + to.width / 2) - (from.left + from.width / 2)
      const dy = (to.top + to.height / 2) - (from.top + from.height / 2)
      settle = element.animate([
        { transform: 'none', opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(${to.width / from.width})`, opacity: 0.9 },
      ], { duration: 240, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'forwards' })
      settle.onfinish = () => setDone(true)
    }, RIFFLE_MS)

    return () => {
      window.clearTimeout(timeoutId)
      settle?.cancel()
    }
  }, [getAnchorRect])

  if (done) return null

  return (
    <div className="shuffle-intro" aria-hidden="true">
      <div ref={ref} className="shuffle-intro__deck" style={{ '--riffle-ms': `${RIFFLE_MS}ms` }}>
        {Array.from({ length: 8 }).map((_, index) => (
          <span key={index} className="shuffle-intro__card" style={{ '--i': index }}>
            <CardBack />
          </span>
        ))}
      </div>
    </div>
  )
}
