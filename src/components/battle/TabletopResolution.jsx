import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './TabletopResolution.css'
import { GameIcon, SvgIcon } from '../ui/GameIcon'
import { Crown } from '../overlay/AbilityCards'
import { buildTabletopResolutionPlan, emptyLedgerSide, finalLedgerSide } from '../../game/tabletopResolution'
import { createResolutionRunner } from './tabletopResolutionRunner'

const FACTIONS = ['critter', 'robot', 'dragon']
// Opponent on top, you at the bottom: each row sits next to its own hand.
const ROW_ORDER = ['opponent', 'player']
const FAST_SPEED = 2.5

function initialLedger(plan, done) {
  if (!plan) return null
  return {
    player: done ? finalLedgerSide(plan.player) : emptyLedgerSide(),
    opponent: done ? finalLedgerSide(plan.opponent) : emptyLedgerSide(),
    focus: null,
    current: null,
    stage: done ? 'done' : 'counting',
    tiebreak: done ? plan.tiebreak : null,
  }
}

function LedgerRow({ side, name, plan, state, focus, current, stage, winner, crowned, bonusFirst, showNeutral }) {
  const mainType = state.main ? plan.mainType : null
  const settled = stage === 'done'
  const outcome = settled ? (winner === 'tie' ? 'tie' : winner === side ? 'win' : 'loss') : null
  const total = state.base === null ? null : state.base + state.bonus - state.blocked
  // Chips are laid out from the start (hidden until earned) so nothing shifts mid-count.
  const hasBonus = plan.final.bonus > 0
  const hasShield = plan.shields.cards.length > 0
  const hasFormula = hasBonus || hasShield
  const bonusChip = hasBonus ? (
    <span className={['ttr-sum__chip', 'ttr-sum__bonus', plan.rules === 'threshold' ? 'ttr-sum__bonus--star' : '',
      state.bonusShown ? '' : 'is-hidden'].filter(Boolean).join(' ')}
      data-ttr={`${side}-bonus`} title={plan.rules === 'threshold' ? 'Faction bonus' : 'Perfect Balance'}>
      +{state.bonus}<GameIcon name={plan.rules === 'threshold' ? 'star' : 'damage'} />
    </span>
  ) : null
  const shieldChip = hasShield ? (
    <span className={['ttr-sum__chip', 'ttr-sum__shield', state.shieldShown ? '' : 'is-hidden'].filter(Boolean).join(' ')}
      data-ttr={`${side}-shield`} title={`Enemy shields: −${plan.shields.cost} per shield point`}>
      −{state.blocked}<GameIcon name="shield" />
    </span>
  ) : null

  return (
    <div className={['ttr-row', `ttr-row--${side}`, outcome ? `is-${outcome}` : '',
      current ? (current === side ? 'is-current' : 'is-waiting') : ''].filter(Boolean).join(' ')}>
      <span className="ttr-row__name">{name}</span>
      <div className="ttr-row__cells">
        {FACTIONS.map((type) => {
          const isMain = mainType === type
          const isCrowned = crowned && type === 'critter'
          return (
            <span key={type} data-ttr={`${side}-${type}`} className={['ttr-cell', `ttr-cell--${type}`,
              isMain ? 'is-main' : '', mainType && !isMain ? 'is-off' : '',
              focus?.side === side && focus.type === type ? 'is-active' : '',
              !state.stats[type] && !state.damage[type] ? 'is-zero' : '',
              isCrowned ? 'is-crowned' : ''].filter(Boolean).join(' ')}>
              {isCrowned ? <Crown className="ttr-cell__crown" /> : null}
              <span className="ttr-cell__icon" data-ttr={`${side}-${type}-icon`}><GameIcon name={type} title={type} /></span>
              <span className="ttr-cell__stat" data-ttr={`${side}-${type}-stat`}>{state.stats[type]}</span>
              <span className="ttr-cell__dmg" data-ttr={`${side}-${type}-dmg`}>{state.damage[type]}<GameIcon name="damage" /></span>
            </span>
          )
        })}
        {showNeutral ? (
          <span data-ttr={`${side}-neutral`} title="Neutral damage" className={['ttr-cell', 'ttr-cell--neutral',
            focus?.side === side && focus.type === 'neutral' ? 'is-active' : '',
            !state.damage.neutral ? 'is-zero' : ''].filter(Boolean).join(' ')}>
            <span className="ttr-cell__dmg" data-ttr={`${side}-neutral-dmg`}>{state.damage.neutral}<GameIcon name="damage" /></span>
          </span>
        ) : null}
      </div>
      <div className="ttr-sum">
        {hasFormula ? <>
          <span className="ttr-sum__base" data-ttr={`${side}-base`} title="Total damage">{state.base ?? '–'}<GameIcon name="damage" /></span>
          {bonusFirst ? <>{bonusChip}{shieldChip}</> : <>{shieldChip}{bonusChip}</>}
          <span className="ttr-sum__eq">=</span>
        </> : null}
        <strong className="ttr-sum__total" data-ttr={hasFormula ? `${side}-total` : `${side}-total ${side}-base`}>
          {total ?? '–'}<GameIcon name="damage" />
        </strong>
      </div>
    </div>
  )
}

// Tabletop battle resolution: counts stats, then damage, main faction, abilities,
// shields and the comparison, using both hands on the table as the source.
export default function TabletopResolution({ result, animate = true, finished = false, playerName = 'You', opponentName = 'Opponent', resultLabel, onShowResult, onFinished }) {
  const plan = useMemo(() => buildTabletopResolutionPlan(result), [result])
  const finalLedger = useMemo(() => initialLedger(plan, true), [plan])
  const [ledger, setLedger] = useState(() => initialLedger(plan, !animate))
  const [speed, setSpeedState] = useState(1)
  const speedRef = useRef(1)
  const rootRef = useRef(null)
  const fxRef = useRef(null)
  const runnerRef = useRef(null)
  const onFinishedRef = useRef(onFinished)
  // Once shown in full (finished, skipped or animation turned off), never recount.
  const settledRef = useRef(!animate)

  useEffect(() => { onFinishedRef.current = onFinished })

  useEffect(() => {
    if (!animate) { settledRef.current = true; return undefined }
    if (!plan || settledRef.current || !rootRef.current || !fxRef.current) return undefined
    const runner = createResolutionRunner({ root: rootRef.current, fx: fxRef.current, getSpeed: () => speedRef.current, update: setLedger })
    runnerRef.current = runner
    runner.start(plan).then((completed) => {
      if (!completed) return
      settledRef.current = true
      onFinishedRef.current?.()
    })
    return () => {
      runner.cancel()
      if (runnerRef.current === runner) runnerRef.current = null
    }
  }, [animate, plan])

  const toggleSpeed = useCallback(() => {
    const next = speedRef.current > 1 ? 1 : FAST_SPEED
    speedRef.current = next
    setSpeedState(next)
  }, [])

  const skip = useCallback(() => {
    runnerRef.current?.cancel()
    runnerRef.current = null
    settledRef.current = true
    setLedger(initialLedger(plan, true))
    onFinishedRef.current?.()
  }, [plan])

  if (!plan) return null
  const shown = animate ? ledger : finalLedger
  const showNeutral = plan.player.final.damage.neutral > 0 || plan.opponent.final.damage.neutral > 0
  const names = { player: playerName, opponent: opponentName }

  return (
    <section ref={rootRef} className={['ttr', `ttr--${shown.stage}`].join(' ')} aria-label="Battle resolution">
      <div className="ttr__rows">
        {ROW_ORDER.map((side) => (
          <LedgerRow key={side} side={side} name={names[side]} plan={plan[side]} state={shown[side]}
            focus={shown.focus} current={shown.current} stage={shown.stage} winner={plan.winner} crowned={shown.tiebreak === side}
            bonusFirst={plan.bonusFirst} showNeutral={showNeutral} />
        ))}
      </div>
      <div className="ttr__controls">
        {finished ? (
          <button type="button" className="ui-button ttr__result" onClick={onShowResult}>{resultLabel}</button>
        ) : (
          <>
            <button type="button" className={['ui-button ui-button--icon', speed > 1 ? 'ttr__speed--on' : ''].filter(Boolean).join(' ')}
              onClick={toggleSpeed} aria-label={speed > 1 ? 'Normal speed' : 'Fast forward'} aria-pressed={speed > 1}>
              <GameIcon name="fast" />
            </button>
            <button type="button" className="ui-button ui-button--icon" onClick={skip} aria-label="Skip to result">
              <SvgIcon name="skip" />
            </button>
          </>
        )}
      </div>
      <div ref={fxRef} className="ttr__fx" aria-hidden="true" />
    </section>
  )
}
