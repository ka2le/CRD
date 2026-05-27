import { useEffect, useRef, useState } from 'react'

const ENTER_DURATION_MS = 480
const STAGGER_MS = 70

export default function useHandAnimation(hand, { animateOnMount = true } = {}) {
  const previousIdsRef = useRef(new Set())
  const firstRenderRef = useRef(true)
  const [cardStates, setCardStates] = useState({})

  useEffect(() => {
    const previousIds = previousIdsRef.current
    const entering = hand
      .filter((card) => !previousIds.has(card.uid))
      .map((card) => card.uid)

    const shouldAnimateEnter = animateOnMount || !firstRenderRef.current

    previousIdsRef.current = new Set(hand.map((card) => card.uid))
    firstRenderRef.current = false

    if (entering.length === 0 || !shouldAnimateEnter) return undefined

    const timeoutIds = []

    entering.forEach((uid, index) => {
      const startId = window.setTimeout(() => {
        setCardStates((current) => ({
          ...current,
          [uid]: 'entering',
        }))
      }, index * STAGGER_MS)
      timeoutIds.push(startId)

      const clearId = window.setTimeout(() => {
        setCardStates((current) => {
          const next = { ...current }
          if (next[uid] === 'entering') delete next[uid]
          return next
        })
      }, (index * STAGGER_MS) + ENTER_DURATION_MS)
      timeoutIds.push(clearId)
    })

    return () => {
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId))
    }
  }, [animateOnMount, hand])

  return {
    cardStates,
  }
}
