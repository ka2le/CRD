import './SideRail.css'
import { GameIcon } from '../ui/GameIcon'
import { CLASS_KEYS } from '../ui/iconSources'
import { MotionAnchor } from '../animation/CardMotionContext'
import { formatAverage } from '../card/cardMeta'

export function StatChips({ stats = {}, compact = false }) {
  return (
    <div className={['stat-chips', compact ? 'stat-chips--compact' : ''].filter(Boolean).join(' ')}>
      {CLASS_KEYS.map((key) => {
        const value = stats?.[key] ?? 0
        return (
          <span key={key} className={['stat-chip', `stat-chip--${key}`, value === 0 ? 'stat-chip--zero' : ''].filter(Boolean).join(' ')}>
            <GameIcon name={key} title={key} />
            <span key={value} className="stat-chip__value">{value}</span>
          </span>
        )
      })}
    </div>
  )
}

export function AverageChip({ value, tabletop = false }) {
  return (
    <span className="avg-chip" title={tabletop ? 'Base power before shields and bonus' : 'Average damage per round'}>
      <GameIcon name="damage" />
      <span key={formatAverage(value)} className="avg-chip__value">{formatAverage(value)}</span>
    </span>
  )
}

export function Pips({ total, current, done = 0, side = 'neutral' }) {
  return (
    <span className={`pips pips--${side}`} aria-label={`${Math.min(current, total)} of ${total}`}>
      {Array.from({ length: total }).map((_, index) => (
        <span
          key={index}
          className={[
            'pip',
            index < done ? 'pip--done' : '',
            index === current - 1 ? 'pip--current' : '',
          ].filter(Boolean).join(' ')}
        />
      ))}
    </span>
  )
}

export function ThinkingDots({ progress = null }) {
  const stage = progress === null ? null : Math.min(2, Math.floor(Math.max(0, progress) * 3))
  return (
    <span className={`thinking-dots${stage === null ? '' : ' thinking-dots--progress'}`} aria-label={stage === 2 ? 'Finishing' : 'Thinking'}>
      {[0, 1, 2].map((index) => <span key={index} className={stage === null ? undefined : index < stage ? 'is-done' : index === stage ? 'is-current' : undefined} />)}
    </span>
  )
}

function HealthBar({ health, max, lost = 0, tick, side }) {
  const lostStart = health
  const lostEnd = Math.min(max, health + lost)
  const low = health <= Math.ceil(max / 3)

  return (
    <div className={['health', `health--${side}`, low ? 'health--low' : '', health <= 0 ? 'health--dead' : ''].filter(Boolean).join(' ')}>
      <MotionAnchor section={`${side}-hp`} className="health__track">
        {Array.from({ length: max }).map((_, index) => {
          const isFilled = index < health
          const isLost = !isFilled && index >= lostStart && index < lostEnd
          return (
            <span
              key={isLost ? `${index}-${tick}` : index}
              className={['health__seg', isFilled ? 'health__seg--on' : '', isLost ? 'health__seg--lost' : ''].filter(Boolean).join(' ')}
            />
          )
        })}
      </MotionAnchor>
      <span key={health} className="health__value">{health}</span>
    </div>
  )
}

export default function SideRail({
  side = 'player',
  stats,
  average = null,
  tabletop = false,
  health = null,
  maxHealth = 21,
  lost = 0,
  hitTick = null,
  shield = 0,
  blocked = 0,
  turn = false,
  winner = null,
  crowded = false,
  identity = null,
  children,
}) {
  const inBattle = health !== null

  return (
    <div
      className={[
        'side-rail',
        `side-rail--${side}`,
        turn ? 'side-rail--turn' : '',
        inBattle ? 'side-rail--battle' : '',
        winner === side ? 'side-rail--winner' : '',
        crowded ? 'side-rail--crowded' : '',
        identity ? 'side-rail--named' : '',
      ].filter(Boolean).join(' ')}
    >
      {identity ? <div className="side-rail__identity">{identity}</div> : null}
      <span className="side-rail__marker" aria-hidden="true" />
      <StatChips stats={stats} compact={inBattle} />
      {inBattle ? (
        <div className="side-rail__vitals">
          <HealthBar health={health} max={maxHealth} lost={lost} tick={hitTick} side={side} />
          {shield > 0 ? (
            <span key={`shield-${hitTick}`} className="side-rail__shield">
              <GameIcon name="shield" />
              <span>{shield}</span>
            </span>
          ) : null}
          {lost > 0 ? (
            <span key={`hit-${hitTick}`} className="side-rail__hit">-{lost}</span>
          ) : null}
          {blocked > 0 ? (
            <span key={`block-${hitTick}`} className="side-rail__block">
              <GameIcon name="shield" />
              {blocked}
            </span>
          ) : null}
        </div>
      ) : (
        <>
          {average !== null ? <AverageChip value={average} tabletop={tabletop} /> : null}
          <span className="side-rail__spacer" />
        </>
      )}
      {children}
    </div>
  )
}
