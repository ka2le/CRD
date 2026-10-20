import { GameIcon } from '../ui/GameIcon'
import './TabletopScore.css'

export function TabletopFormula({ score, label }) {
  const hasCalculation = score.blocked > 0 || score.bonus > 0
  const abilities = score.rules === 'abilities'
  const bonusTitle = abilities
    ? `Perfect Balance: +${score.bonus} after shields`
    : `${score.baseBonus} faction bonus${score.shortcuts > 0 ? ` (Shortcut: ${score.naturalBonus} → ${score.baseBonus})` : ''}${score.bonusMultiplier > 1 ? ` × ${score.bonusMultiplier}` : ''} after shields`
  const description = `${label}: ${score.base} base${score.blocked > 0 ? ` minus ${score.blocked} shields` : ''}${score.bonus > 0 ? ` plus ${score.bonus} bonus` : ''} equals ${score.score} damage`
  return (
    <div className="tabletop-formula" aria-label={description}>
      <span className="tabletop-formula__label">{label}</span>
      {score.damageType ? <GameIcon name={score.damageType} title={`${score.damageType} damage type`} style={{ color: `var(--${score.damageType})` }} /> : <span />}
      <span className="tabletop-formula__equation">
        {abilities && score.adaptedUid ? (
          <span className="tabletop-formula__ability" title="Adapt: a Critter stat card became a Critter attack">
            <GameIcon name="critter" style={{ color: 'var(--critter)' }} />⇒
          </span>
        ) : null}
        {abilities && score.overwhelming ? (
          <span className="tabletop-formula__ability" title="Overwhelming: Dragon power 14+ gained one Dragon stat">
            <GameIcon name="dragon" style={{ color: 'var(--dragon)' }} />+1
          </span>
        ) : null}
        {hasCalculation ? <span title="Base power">{score.base}</span> : null}
        {score.blocked > 0 ? <>
          <span>−</span>
          <span title={`${score.enemyShields} enemy shields; ${score.shieldPenalty} penalty, capped at base power`}>{score.blocked}<GameIcon name="shield" className="tabletop-formula__shield" /></span>
        </> : null}
        {score.bonus > 0 ? <>
          <span>+</span><span title={bonusTitle}>{score.bonus}<GameIcon name="damage" className="tabletop-formula__damage" /></span>
        </> : null}
        {hasCalculation ? <span>=</span> : null}
        <strong>{score.score}<GameIcon name="damage" className="tabletop-formula__damage" /></strong>
      </span>
    </div>
  )
}

export default function TabletopScore({ result, resultLabel, onShowResult }) {
  if (!result) return null
  return (
    <section className="tabletop-score" aria-label="Tabletop battle scores">
      <div className="tabletop-score__formulas">
        <TabletopFormula score={result.opponent} label="Opponent" />
        <TabletopFormula score={result.player} label="You" />
      </div>
      <button type="button" className="ui-button" onClick={onShowResult}>{resultLabel}</button>
    </section>
  )
}
