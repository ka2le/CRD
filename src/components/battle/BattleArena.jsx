import { useEffect, useRef } from 'react'
import './BattleArena.css'
import { useCardMotion } from '../animation/CardMotionContext'
import { GameIcon, SvgIcon } from '../ui/GameIcon'

const TIMING_LANES = [
  { key: 'critter', every: 1 },
  { key: 'robot', every: 2 },
  { key: 'dragon', every: 3 },
]

function centerOf(rect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

// Damage orbs fly from each firing card to the enemy health bar.
function useDamageOrbs(layerRef, playback, impactMs) {
  const { getAnchorRect } = useCardMotion()
  const tick = playback?.activationTick ?? 0

  useEffect(() => {
    const layer = layerRef.current
    if (!layer || !playback || !tick) return undefined

    const created = []
    const sides = [
      { side: 'player', bursts: playback.playerBursts ?? [], target: 'opponent-hp' },
      { side: 'opponent', bursts: playback.opponentBursts ?? [], target: 'player-hp' },
    ]

    sides.forEach(({ side, bursts, target }) => {
      const targetRect = getAnchorRect(target, 'default')
      if (!targetRect) return

      bursts.filter((burst) => burst.damage > 0).forEach((burst, index, list) => {
        const fromRect = getAnchorRect(`${side}-hand`, burst.uid)
        if (!fromRect) return

        const from = centerOf(fromRect)
        const spread = list.length > 1 ? (index / (list.length - 1)) - 0.5 : 0
        const to = {
          x: targetRect.left + (targetRect.width * (0.5 + spread * 0.6)),
          y: targetRect.top + (targetRect.height / 2),
        }
        const dx = to.x - from.x
        const dy = to.y - from.y
        const arc = Math.min(110, Math.hypot(dx, dy) * 0.3) * (Math.abs(dx) < 40 ? (index % 2 ? 1 : -1) : 1)

        const orb = document.createElement('div')
        orb.className = `battle-orb battle-orb--${burst.damageType ?? (burst.iconType === 'shield' ? 'shield' : 'neutral')}`
        orb.textContent = String(burst.damage)
        orb.style.left = `${from.x}px`
        orb.style.top = `${from.y}px`
        layer.appendChild(orb)
        created.push(orb)

        const delay = impactMs * 0.06 + index * 40
        const duration = impactMs * 0.3
        const animation = orb.animate([
          { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0 },
          { transform: 'translate(-50%, -50%) scale(1.25)', opacity: 1, offset: 0.12 },
          { transform: `translate(calc(-50% + ${dx * 0.5 + arc}px), calc(-50% + ${dy * 0.5}px)) scale(1.05)`, opacity: 1, offset: 0.55 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.7)`, opacity: 1, offset: 0.96 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.8)`, opacity: 0 },
        ], { duration, delay, easing: 'cubic-bezier(.5,0,.6,1)', fill: 'both' })
        animation.onfinish = () => orb.remove()
      })
    })

    return () => created.forEach((orb) => orb.remove())
    // Fire once per round tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick])
}

export default function BattleArena({
  battlePlayback,
  impactMs = 800,
  speed = 1,
  onToggleSpeed,
  onSkip,
  finished = false,
  resultLabel = null,
  onShowResult,
}) {
  const layerRef = useRef(null)
  useDamageOrbs(layerRef, battlePlayback, impactMs)
  const round = battlePlayback?.round ?? 0

  return (
    <section className={['battle-arena', round === 0 ? 'battle-arena--intro' : ''].filter(Boolean).join(' ')}>
      <div className="battle-arena__lanes" aria-hidden="true">
        {TIMING_LANES.map((lane) => {
          const firing = round > 0 && round % lane.every === 0
          return (
            <span
              key={`${lane.key}-${firing ? round : 'idle'}`}
              className={['battle-arena__lane', `battle-arena__lane--${lane.key}`, firing ? 'battle-arena__lane--firing' : ''].filter(Boolean).join(' ')}
            >
              <GameIcon name={lane.key} />
            </span>
          )
        })}
      </div>

      <div className="battle-arena__round">
        {round === 0 ? (
          <span className="battle-arena__vs">
            <SvgIcon name="swords" />
          </span>
        ) : (
          <>
            <GameIcon name="cd" className="battle-arena__round-icon" />
            <span key={round} className="battle-arena__round-number">{round}</span>
          </>
        )}
      </div>

      <div className="battle-arena__controls">
        {finished ? (
          <button type="button" className="ui-button battle-arena__result" onClick={onShowResult}>
            {resultLabel}
          </button>
        ) : (
          <>
            <button
              type="button"
              className={['ui-button ui-button--icon', speed > 1 ? 'battle-arena__speed--on' : ''].filter(Boolean).join(' ')}
              onClick={onToggleSpeed}
              aria-label={speed > 1 ? 'Normal speed' : 'Fast forward'}
              aria-pressed={speed > 1}
            >
              <GameIcon name="fast" />
            </button>
            <button type="button" className="ui-button ui-button--icon" onClick={onSkip} aria-label="Skip to result">
              <SvgIcon name="skip" />
            </button>
          </>
        )}
      </div>

      <div ref={layerRef} className="battle-arena__fx" aria-hidden="true" />
    </section>
  )
}
