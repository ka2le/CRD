import { useEffect, useMemo, useRef, useState } from 'react'
import { TabletopLedgerRow } from '../battle/TabletopResolution'
import { createResolutionRunner } from '../battle/tabletopResolutionRunner'
import { buildTabletopSidePlan, emptyLedgerSide, finalLedgerSide } from '../../game/tabletopResolution'
import { GameIcon, SvgIcon } from '../ui/GameIcon'

const SIDES = ['hero1', 'hero2', 'boss']
const OPPOSING = { hero1: 'boss', hero2: 'boss', boss: 'team' }
function ledgerFor(plan, done) {
  return { ...Object.fromEntries(SIDES.map(side => [side, done ? finalLedgerSide(plan[side]) : emptyLedgerSide()])),
    stage: done ? 'done' : 'counting', focus: null, current: null, tiebreak: done ? plan.tiebreak : null }
}

export default function BossScores({ result, hands, monsterHand, bossName, weakerBonus, animate = false, finished = false, onFinished }) {
  const tiebreak = result.teamPower === result.boss.score && result.winner !== 'draw'
  const plan = useMemo(() => ({
    hero1: buildTabletopSidePlan(hands[0], result.heroes[0], monsterHand),
    hero2: buildTabletopSidePlan(hands[1], result.heroes[1], monsterHand),
    boss: buildTabletopSidePlan(monsterHand, result.boss, hands.flat()),
    bonusFirst: true,
    tiebreak: !tiebreak ? null : result.winner === 'boss' ? 'boss' : result.heroes[0].winsTies ? 'hero1' : 'hero2',
  }), [hands, monsterHand, result, tiebreak])
  const [ledger, setLedger] = useState(() => ledgerFor(plan, !animate))
  const [speed, setSpeed] = useState(1)
  const speedRef = useRef(1), rootRef = useRef(null), fxRef = useRef(null), runnerRef = useRef(null)
  const settled = useRef(!animate), onFinishedRef = useRef(onFinished)
  useEffect(() => { onFinishedRef.current = onFinished })
  useEffect(() => {
    if (!animate) { settled.current = true; onFinishedRef.current?.(); return }
    if (settled.current) return
    const runner = createResolutionRunner({ root: rootRef.current, fx: fxRef.current,
      getSpeed: () => speedRef.current, update: setLedger, sides: SIDES, opponentSides: OPPOSING,
      findCard: (side, uid) => {
        const zone = side === 'boss' ? '.boss-enemy' : side === 'team' ? '.boss-heroes' : `[data-seat="${side === 'hero1' ? 0 : 1}"]`
        const card = document.querySelector(`${zone} [data-card-uid="${CSS.escape(uid)}"]`)
        if (card || side !== 'boss') return card
        // Starting engine cards are printed together on the boss portrait.
        // Animate their printed group, rather than scaling the whole portrait.
        const core = monsterHand.find(c => c.uid === uid)
        if (core?.effect?.shield) return document.querySelector('.boss-portrait [alt="shield points"]')?.parentElement
        if (core?.effect?.dmgType) return document.querySelector(`.boss-portrait [alt="${core.effect.dmgType} attack"]`)?.closest('.card-visual__boss-engine > div')
        return document.querySelector('.boss-portrait .card-visual__stat-column')
      },
    })
    runnerRef.current = runner
    runner.start(plan).then(done => {
      if (done) { settled.current = true; onFinishedRef.current?.() }
    })
    return () => { runner.cancel(); runnerRef.current = null }
  }, [animate, plan, monsterHand])
  const shown = !animate || finished ? ledgerFor(plan, true) : ledger
  const done = shown.stage === 'done'
  const names = { hero1: 'Player 1', hero2: 'Player 2', boss: bossName }
  const skip = () => {
    runnerRef.current?.cancel(); settled.current = true
    setLedger(ledgerFor(plan, true)); onFinishedRef.current?.()
  }
  return <section ref={rootRef} className={`ttr boss-scoreboard ttr--${shown.stage}`} aria-label="Battle resolution">
    <div className="ttr__rows">
      {SIDES.map(side => <TabletopLedgerRow key={side} side={side} visualSide={side === 'boss' ? 'opponent' : 'player'}
        name={names[side]} plan={plan[side]} state={shown[side]} focus={shown.focus} current={shown.current} stage={shown.stage}
        winner={result.winner === 'draw' ? 'tie' : result.winner === (side === 'boss' ? 'boss' : 'team') ? side : null}
        crowned={shown.tiebreak === side} bonusFirst showNeutral />)}
    </div>
    <div className="boss-team-score" aria-label="Team damage" style={{ visibility: done ? 'visible' : 'hidden' }}>
      <span>Team</span><span>{result.heroes[0].score} + {result.heroes[1].score}</span>
      {weakerBonus ? <span title="Lower hand's damage added again">+ {result.weakerBonus} <small>lower hand</small></span> : null}
      <span>=</span><strong>{result.teamPower}<GameIcon name="damage" /></strong>
      {tiebreak ? <span className="boss-team-score__tie">Critter tiebreak</span> : result.winner === 'draw' ? <span className="boss-team-score__tie">Equal damage</span> : null}
    </div>
    {!done ? <div className="boss-count-controls">
      <button className="ui-button ui-button--icon" aria-label={speed > 1 ? 'Normal speed' : 'Fast forward'} aria-pressed={speed > 1}
        onClick={() => { speedRef.current = speed > 1 ? 1 : 2.5; setSpeed(speedRef.current) }}><GameIcon name="fast" /></button>
      <button className="ui-button ui-button--icon" aria-label="Skip to result" onClick={skip}><SvgIcon name="skip" /></button>
    </div> : null}
    <div ref={fxRef} className="ttr__fx" aria-hidden="true" />
  </section>
}
