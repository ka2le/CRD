import { useEffect, useLayoutEffect, useRef } from 'react'
import './CardButton.css'
import CardVisual, { CardBack } from './CardVisual'
import { getAccentStyle } from './cardMeta'
import { rememberCardRect, takeCardRect } from './cardRects'
import { useCardMotion } from '../animation/CardMotionContext'
import { useCardInspect } from '../overlay/inspectContext'
import { GameIcon, SvgIcon } from '../ui/GameIcon'
import { DEAL_DURATION_MS } from '../../hooks/dealTiming'

const LONG_PRESS_MS = 420

function rectCenter(rect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

export default function CardButton({
  card,
  hidden = false,
  selected = false,
  discardMarked = false,
  active = false,
  activationKey = 0,
  lungeDirection = 0,
  ready = false,
  eyed = false,
  eyedDelayMs = 0,
  dimmed = false,
  defeated = false,
  masked = false,
  onToggle,
  disabled = false,
  targetable = false,
  battleValue = 0,
  charge = null,
  hint = null,
  enterFrom = null,
  inspectContextHand = null,
}) {
  const buttonRef = useRef(null)
  const innerRef = useRef(null)
  const pressRef = useRef({ timer: null, fired: false, x: 0, y: 0 })
  const { getAnchorRect } = useCardMotion()
  const inspect = useCardInspect()
  const isDummy = card?.uid === '__dummy_card__'
  const uid = card?.uid

  // Enter: FLIP from a previous zone, or deal from a pile (face down, flips up).
  useLayoutEffect(() => {
    const element = buttonRef.current
    if (!element || isDummy) return undefined

    const finalRect = element.getBoundingClientRect()
    const previousRect = takeCardRect(uid)
    let animation = null
    let flip = null
    let replayRect = null

    if (!masked && previousRect && finalRect.width > 0) {
      const from = rectCenter(previousRect)
      const to = rectCenter(finalRect)
      const dx = from.x - to.x
      const dy = from.y - to.y
      if (Math.abs(dx) + Math.abs(dy) > 4 || Math.abs(previousRect.width - finalRect.width) > 4) {
        const scale = previousRect.width / finalRect.width
        replayRect = previousRect
        animation = element.animate([
          { transform: `translate(${dx}px, ${dy}px) scale(${scale})` },
          { transform: 'none' },
        ], { duration: 480, easing: 'cubic-bezier(.2,.8,.25,1)' })
      }
    } else if (!masked && enterFrom?.section && finalRect.width > 0) {
      // Mounted together with its hand = opening deal (after the shuffle lead).
      const isOpening = enterFrom.mountedAt !== undefined && performance.now() - enterFrom.mountedAt < 80
      const allowed = !isOpening || enterFrom.animateOnMount !== false
      const fromRect = allowed ? getAnchorRect(enterFrom.section, enterFrom.slot ?? 'default') : null
      if (fromRect) {
        const from = rectCenter(fromRect)
        const to = rectCenter(finalRect)
        const scale = Math.max(0.2, fromRect.width / finalRect.width)
        const dx = from.x - to.x
        const dy = from.y - to.y
        const hasGroup = enterFrom.mountedAt !== undefined
        const delay = !hasGroup
          ? (enterFrom.delayMs ?? 0)
          : (isOpening ? (enterFrom.leadMs ?? 0) + (enterFrom.delayMs ?? 0) : (enterFrom.delayMs ?? 0) * 0.6)
        animation = element.animate([
          { transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotate(-8deg)`, opacity: 0.6 },
          { transform: `translate(${dx * 0.35}px, ${(dy * 0.35) - 18}px) scale(${((scale + 1) / 2) * 1.04}) rotate(-2deg)`, opacity: 1, offset: 0.55 },
          { transform: 'none', opacity: 1 },
        ], { duration: DEAL_DURATION_MS, delay, easing: 'cubic-bezier(.2,.8,.25,1)', fill: 'backwards' })

        if (enterFrom.flip !== false && !hidden && innerRef.current) {
          flip = innerRef.current.animate([
            { transform: 'rotateY(180deg)' },
            { transform: 'rotateY(180deg)', offset: 0.4 },
            { transform: 'rotateY(0deg)' },
          ], { duration: DEAL_DURATION_MS + 160, delay, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'backwards' })
        }
      }
    }

    return () => {
      const running = animation && animation.playState === 'running'
      if (replayRect && running) rememberCardRect(uid, replayRect)
      else if (!running) rememberCardRect(uid, element.getBoundingClientRect())
      animation?.cancel()
      flip?.cancel()
    }
    // Run on mount only: later prop changes must not replay entrances.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Battle fire: lunge toward the opponent.
  useEffect(() => {
    if (!active || !activationKey || !buttonRef.current) return undefined
    const lift = lungeDirection * 16
    const animation = buttonRef.current.animate([
      { transform: 'none', filter: 'brightness(1)' },
      { transform: `translateY(${lift}px) scale(1.08)`, filter: 'brightness(1.35)', offset: 0.35 },
      { transform: 'none', filter: 'brightness(1)' },
    ], { duration: 520, easing: 'cubic-bezier(.3,1.4,.5,1)' })
    return () => animation.cancel()
  }, [active, activationKey, lungeDirection])

  useEffect(() => () => window.clearTimeout(pressRef.current.timer), [])

  if (!card) return null

  const isDisabled = disabled || !onToggle || isDummy
  const contextHand = inspectContextHand ?? []

  function openInspect() {
    if (isDummy || hidden) return
    inspect?.(card, contextHand)
  }

  function handlePointerDown(event) {
    if (isDummy || hidden) return
    const press = pressRef.current
    press.fired = false
    press.x = event.clientX
    press.y = event.clientY
    window.clearTimeout(press.timer)
    press.timer = window.setTimeout(() => {
      press.fired = true
      openInspect()
    }, LONG_PRESS_MS)
  }

  function handlePointerMove(event) {
    const press = pressRef.current
    if (!press.timer) return
    if (Math.abs(event.clientX - press.x) + Math.abs(event.clientY - press.y) > 10) {
      window.clearTimeout(press.timer)
      press.timer = null
    }
  }

  function cancelPress() {
    window.clearTimeout(pressRef.current.timer)
    pressRef.current.timer = null
  }

  function handleClick() {
    if (pressRef.current.fired) {
      pressRef.current.fired = false
      return
    }
    if (isDisabled) return
    onToggle?.(card.uid)
  }

  function handleContextMenu(event) {
    event.preventDefault()
    cancelPress()
    openInspect()
  }

  const classes = [
    'card',
    hidden ? 'card--facedown' : '',
    selected ? 'card--selected' : '',
    discardMarked ? 'card--discard-marked' : '',
    active ? 'card--active' : '',
    ready ? 'card--ready' : '',
    eyed ? 'card--eyed' : '',
    dimmed ? 'card--dimmed' : '',
    defeated ? 'card--defeated' : '',
    masked ? 'card--masked' : '',
    isDisabled ? 'card--disabled' : 'card--interactive',
    targetable ? 'card--targetable' : '',
    isDummy ? 'card--dummy' : '',
  ].filter(Boolean).join(' ')

  return (
    <button
      ref={buttonRef}
      type="button"
      className={classes}
      style={eyedDelayMs ? { ...getAccentStyle(card), '--eyed-delay': `${eyedDelayMs}ms` } : getAccentStyle(card)}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onPointerCancel={cancelPress}
      onContextMenu={handleContextMenu}
      disabled={isDummy}
      aria-disabled={isDisabled}
      aria-pressed={selected || discardMarked || undefined}
      data-card-uid={card.uid}
      aria-label={hidden ? 'Hidden card' : card.name}
    >
      <span ref={innerRef} className="card__inner">
        <span className="card__face card__face--front">
          {!hidden && !isDummy ? <CardVisual card={card} charge={charge} /> : null}
        </span>
        <span className="card__face card__face--back">
          <CardBack />
        </span>
      </span>
      <span className="card__frame" aria-hidden="true" />

      {discardMarked ? (
        <span className="card__badge card__badge--discard" aria-hidden="true">
          <SvgIcon name="trash" />
        </span>
      ) : null}
      {ready ? (
        <span className="card__badge card__badge--ready" aria-hidden="true">
          <GameIcon name="star" />
        </span>
      ) : null}
      {eyed ? <span className="card__reticle" aria-hidden="true" /> : null}
      {!hidden && battleValue > 0 ? (
        <span key={activationKey} className="card__burst" aria-hidden="true">
          {battleValue}
        </span>
      ) : null}
      {!hidden && hint ? (
        <span className="card__hint" aria-hidden="true">
          <span>{hint}</span>
          <GameIcon name="damage" />
        </span>
      ) : null}
    </button>
  )
}
