import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react'
import CardVisual, { CardBack } from '../card/CardVisual'
import { getAccentStyle } from '../card/cardMeta'
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

function createFlight({ id, card, fromRect, toRect, face = 'up', endFace = face, matchSize = true, durationMs = DEFAULT_DURATION_MS, delayMs = 0, rotateDeg = 0, scaleTo = 1, fadeOut = false, hideSource = true, hideDestinationUntilEnd = true }) {
  const from = getRectCenter(fromRect)
  const to = getRectCenter(toRect)

  return {
    id,
    card,
    hidden: face === 'down',
    flip: face !== endFace ? endFace : null,
    matchSize,
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

  const animateCardMove = useCallback(({ card, from, to, face = 'up', endFace = face, matchSize = true, durationMs = DEFAULT_DURATION_MS, delayMs = 0, rotateDeg = 0, scaleTo = 1, fadeOut = false, hideSource = true, hideDestinationUntilEnd = true, fromRect: providedFromRect = null, toRect: providedToRect = null, destinationAlreadyHidden = false }) => {
    const fromRect = providedFromRect ?? getAnchorRect(from.section, from.slot)
    const toRect = providedToRect ?? getAnchorRect(to.section, to.slot)

    if (!card || !fromRect || !toRect) return null

    const id = `${card.uid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const flight = createFlight({ id, card, fromRect, toRect, face, endFace, matchSize, durationMs, delayMs, rotateDeg, scaleTo, fadeOut, hideSource, hideDestinationUntilEnd })
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

// This hook belongs beside the provider so consumers share its private context.
// eslint-disable-next-line react-refresh/only-export-components
export function useCardMotion() {
  const context = useContext(CardMotionContext)
  if (!context) {
    throw new Error('useCardMotion must be used within CardMotionProvider')
  }
  return context
}

export function MotionAnchor({ section, slot = 'default', className = '', style, children }) {
  const { registerAnchor } = useCardMotion()
  const ref = useRef(null)
  const sections = Array.isArray(section) ? section : [section]
  const sectionKey = sections.join('|')

  useLayoutEffect(() => {
    const keys = sectionKey.split('|')
    keys.forEach((entry) => registerAnchor(entry, slot, ref.current))
    return () => keys.forEach((entry) => registerAnchor(entry, slot, null))
  }, [registerAnchor, sectionKey, slot])

  return (
    <div ref={ref} className={className} style={style} data-motion-anchor={createAnchorId(sections[0], slot)}>
      {children}
    </div>
  )
}

function FlightCard({ flight }) {
  const ref = useRef(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return undefined

    const dx = flight.to.x - flight.from.x
    const dy = flight.to.y - flight.from.y
    const distance = Math.hypot(dx, dy)
    const arc = Math.min(90, distance * 0.22)
    const endScale = flight.matchSize ? (flight.to.width / flight.from.width) * flight.scaleTo : flight.scaleTo
    const midScale = ((1 + endScale) / 2) * 1.08
    const endOpacity = flight.fadeOut ? 0 : 1

    const animation = element.animate([
      { transform: 'translate(0px, 0px) scale(1) rotate(0deg)', opacity: 1 },
      {
        transform: `translate(${dx * 0.5}px, ${(dy * 0.5) - arc}px) scale(${midScale}) rotate(${flight.rotateDeg * 0.6}deg)`,
        opacity: 1,
        offset: 0.5,
      },
      { transform: `translate(${dx}px, ${dy}px) scale(${endScale}) rotate(${flight.rotateDeg}deg)`, opacity: endOpacity },
    ], {
      duration: flight.durationMs,
      delay: flight.delayMs,
      easing: 'cubic-bezier(.45,.05,.2,1)',
      fill: 'both',
    })

    let flip = null
    const inner = element.querySelector('.card__inner')
    if (inner && flight.flip) {
      flip = inner.animate([
        { transform: flight.flip === 'up' ? 'rotateY(180deg)' : 'rotateY(0deg)' },
        { transform: flight.flip === 'up' ? 'rotateY(0deg)' : 'rotateY(180deg)' },
      ], { duration: flight.durationMs * 0.7, delay: flight.delayMs + (flight.durationMs * 0.15), easing: 'ease-in-out', fill: 'both' })
    }

    return () => {
      animation.cancel()
      flip?.cancel()
    }
  }, [flight])

  return (
    <div
      ref={ref}
      className="card-motion-flight"
      style={{
        left: `${flight.from.x - (flight.from.width / 2)}px`,
        top: `${flight.from.y - (flight.from.height / 2)}px`,
        width: `${flight.from.width}px`,
        height: `${flight.from.height}px`,
        '--card-w': `${flight.from.width}px`,
        ...getAccentStyle(flight.card),
      }}
    >
      <div className="card-motion-flight__card">
        <span className={['card-motion-flight__inner card__inner', flight.hidden ? 'card-motion-flight__inner--down' : ''].filter(Boolean).join(' ')}>
          <span className="card__face card__face--front"><CardVisual card={flight.card} /></span>
          <span className="card__face card__face--back"><CardBack /></span>
        </span>
      </div>
    </div>
  )
}

function FlyingCardLayer({ flights }) {
  return (
    <div className="card-motion-layer" aria-hidden="true">
      {flights.map((flight) => <FlightCard key={flight.id} flight={flight} />)}
    </div>
  )
}
