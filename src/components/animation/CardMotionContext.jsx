import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react'
import CardVisual from '../card/CardVisual'
import './CardMotion.css'

const CardMotionContext = createContext(null)

const DEFAULT_DURATION_MS = 260

function getRectCenter(rect) {
  return {
    x: rect.left + (rect.width / 2),
    y: rect.top + (rect.height / 2),
    width: rect.width,
    height: rect.height,
  }
}

function createAnchorId(section, slot = 'default') {
  return `${section}::${slot}`
}

function createFlight({ id, card, fromRect, toRect, face = 'up', durationMs = DEFAULT_DURATION_MS, delayMs = 0, rotateDeg = 0, scaleTo = 1, fadeOut = false, hideSource = true, hideDestinationUntilEnd = true }) {
  const from = getRectCenter(fromRect)
  const to = getRectCenter(toRect)

  return {
    id,
    card,
    hidden: face === 'down',
    durationMs,
    delayMs,
    rotateDeg,
    hideSource,
    hideDestinationUntilEnd,
    scaleTo,
    fadeOut,
    from,
    to,
  }
}

export function CardMotionProvider({ children }) {
  const anchorsRef = useRef(new Map())
  const [flights, setFlights] = useState([])
  const [hiddenSlots, setHiddenSlots] = useState({})

  const registerAnchor = useCallback((section, slot = 'default', element) => {
    const anchorId = createAnchorId(section, slot)

    if (!element) {
      anchorsRef.current.delete(anchorId)
      return
    }

    anchorsRef.current.set(anchorId, element)
  }, [])

  const getAnchorRect = useCallback((section, slot = 'default') => {
    const anchorId = createAnchorId(section, slot)
    const element = anchorsRef.current.get(anchorId)
    if (!element) return null
    return element.getBoundingClientRect()
  }, [])

  const animateCardMove = useCallback(({ card, from, to, face = 'up', durationMs = DEFAULT_DURATION_MS, delayMs = 0, rotateDeg = 0, scaleTo = 1, fadeOut = false, hideSource = true, hideDestinationUntilEnd = true, fromRect: providedFromRect = null, toRect: providedToRect = null, destinationAlreadyHidden = false }) => {
    const fromRect = providedFromRect ?? getAnchorRect(from.section, from.slot)
    const toRect = providedToRect ?? getAnchorRect(to.section, to.slot)

    if (!card || !fromRect || !toRect) return null

    const id = `${card.uid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const flight = createFlight({ id, card, fromRect, toRect, face, durationMs, delayMs, rotateDeg, scaleTo, fadeOut, hideSource, hideDestinationUntilEnd })
    const fromKey = createAnchorId(from.section, from.slot)
    const toKey = createAnchorId(to.section, to.slot)

    if (hideSource) {
      setHiddenSlots((current) => ({
        ...current,
        [fromKey]: (current[fromKey] ?? 0) + 1,
      }))
    }

    if (hideDestinationUntilEnd && !destinationAlreadyHidden) {
      setHiddenSlots((current) => ({
        ...current,
        [toKey]: (current[toKey] ?? 0) + 1,
      }))
    }

    setFlights((current) => [...current, flight])

    window.setTimeout(() => {
      setFlights((current) => current.filter((entry) => entry.id !== id))

      setHiddenSlots((current) => {
        const next = { ...current }

        if (hideSource) {
          const nextCount = (next[fromKey] ?? 0) - 1
          if (nextCount > 0) next[fromKey] = nextCount
          else delete next[fromKey]
        }

        if (hideDestinationUntilEnd) {
          const nextCount = (next[toKey] ?? 0) - 1
          if (nextCount > 0) next[toKey] = nextCount
          else delete next[toKey]
        }

        return next
      })
    }, delayMs + durationMs + 80)

    return id
  }, [getAnchorRect])

  const maskSlot = useCallback((section, slot = 'default') => {
    const key = createAnchorId(section, slot)
    setHiddenSlots((current) => ({
      ...current,
      [key]: (current[key] ?? 0) + 1,
    }))
    return key
  }, [])

  const unmaskSlot = useCallback((section, slot = 'default') => {
    const key = createAnchorId(section, slot)
    setHiddenSlots((current) => {
      const next = { ...current }
      const nextCount = (next[key] ?? 0) - 1
      if (nextCount > 0) next[key] = nextCount
      else delete next[key]
      return next
    })
  }, [])

  const value = useMemo(() => ({
    registerAnchor,
    getAnchorRect,
    animateCardMove,
    hiddenSlots,
    maskSlot,
    unmaskSlot,
  }), [registerAnchor, getAnchorRect, animateCardMove, hiddenSlots, maskSlot, unmaskSlot])

  return (
    <CardMotionContext.Provider value={value}>
      {children}
      <FlyingCardLayer flights={flights} />
    </CardMotionContext.Provider>
  )
}

export function useCardMotion() {
  const context = useContext(CardMotionContext)
  if (!context) {
    throw new Error('useCardMotion must be used within CardMotionProvider')
  }
  return context
}

export function MotionAnchor({ section, slot = 'default', className = '', children }) {
  const { registerAnchor } = useCardMotion()
  const ref = useRef(null)

  useLayoutEffect(() => {
    registerAnchor(section, slot, ref.current)
    return () => registerAnchor(section, slot, null)
  }, [registerAnchor, section, slot])

  return (
    <div ref={ref} className={className} data-motion-anchor={createAnchorId(section, slot)}>
      {children}
    </div>
  )
}

function FlyingCardLayer({ flights }) {
  return (
    <div className="card-motion-layer" aria-hidden="true">
      {flights.map((flight) => {
        const dx = flight.to.x - flight.from.x
        const dy = flight.to.y - flight.from.y

        return (
          <div
            key={flight.id}
            className="card-motion-flight"
            style={{
              '--flight-start-x': `${flight.from.x}px`,
              '--flight-start-y': `${flight.from.y}px`,
              '--flight-dx': `${dx}px`,
              '--flight-dy': `${dy}px`,
              '--flight-width': `${flight.from.width}px`,
              '--flight-height': `${flight.from.height}px`,
              '--flight-duration': `${flight.durationMs}ms`,
              '--flight-delay': `${flight.delayMs}ms`,
              '--flight-rotate': `${flight.rotateDeg}deg`,
              '--flight-scale-to': `${flight.scaleTo}`,
              '--flight-end-opacity': `${flight.fadeOut ? 0.12 : 0.98}`,
            }}
          >
            <div className="card-motion-flight__card">
              <CardVisual card={flight.card} hidden={flight.hidden} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
