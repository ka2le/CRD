import './AbilityCards.css'
import { GameIcon } from '../ui/GameIcon'
import { ABILITY_RULES, FLEXIBLE_RULES } from '../../game/tabletop'

// Prototype reference cards for the alternative "class abilities" tabletop rule.
// View only: nothing here affects digital combat.
//   Critters – Adapt: during preparation, may turn 1 Critter stat card into a Critter attack card.
//   Robots – Perfect Balance: +3 power when Robot stats = Robot attacks (at least 1 each).
//   Dragons – Overwhelming: Dragon base power 7+ gains +1 Dragon stat before final power.

const CLASS_CLASS = { critter: 'c', robot: 'r', dragon: 'd' }

// Simplified game card: class colour as "art", centred silhouette, icons in the top-left corner.
function StatCard({ cls }) {
  return (
    <span className={`ab-pc ab-pc--${CLASS_CLASS[cls]}`}>
      <GameIcon name={cls} className="ab-pc__wm" />
      <span className="ab-pc__corner"><GameIcon name={cls} className="ab-pc__stat" /></span>
    </span>
  )
}

function AttackCard({ cls }) {
  return (
    <span className={`ab-pc ab-pc--${CLASS_CLASS[cls]}`}>
      <GameIcon name={cls} className="ab-pc__wm" />
      <span className="ab-pc__corner">
        <GameIcon name={cls} className="ab-pc__atk" />
        <span className="ab-pc__x">×</span>
        <GameIcon name="damage" className="ab-pc__heart" />
      </span>
    </span>
  )
}

const Arrow = () => <GameIcon name="arrow" className="ab-arrow" />

// "Transforms into": a heavy double-shaft arrow, used for Adapt only.
function TransformArrow() {
  return (
    <svg className="ab-arrow ab-arrow--transform" viewBox="0 0 36 22" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 8h20M4 14h20" />
        <path d="M21 4.5 30 11 21 17.5" />
      </g>
    </svg>
  )
}

// Every rule reads requirement → arrow → result on one line.
const ABILITIES = [
  {
    cls: 'critter',
    name: 'Adapt',
    shield: '−2',
    left: <StatCard cls="critter" />,
    arrow: <TransformArrow />,
    right: <AttackCard cls="critter" />,
  },
  {
    cls: 'robot',
    name: 'Perfect Balance',
    shield: '−1',
    left: (
      <>
        <StatCard cls="robot" />
        <span className="ab-op">=</span>
        <AttackCard cls="robot" />
      </>
    ),
    arrow: <Arrow />,
    right: <span className="ab-plus4"><b>+{ABILITY_RULES.balanceBonus}</b><GameIcon name="damage" /></span>,
  },
  {
    cls: 'dragon',
    name: 'Overwhelming',
    shield: '0',
    left: <span className="ab-thr"><GameIcon name="damage" />{ABILITY_RULES.overwhelmingAt}+</span>,
    arrow: <Arrow />,
    right: (
      <>
        <span className="ab-op ab-op--extra">+</span>
        <StatCard cls="dragon" />
      </>
    ),
  },
]

function Rule({ left, arrow, right }) {
  return (
    <div className="ab-rule">
      {left}
      {arrow}
      {right}
    </div>
  )
}

// Shield penalty against this class, shown as a tab on the right of each section.
export function ShieldTab({ value }) {
  return (
    <span className={['ab-tab', value === '0' ? 'is-zero' : ''].filter(Boolean).join(' ')}>
      <GameIcon name="shield" />
      {value}
    </span>
  )
}

export function AbilityLedgerCard() {
  return (
    <div className="sc-card ab-ledger" aria-label="Class abilities: ledger">
      {ABILITIES.map(({ cls, name, ...ability }) => (
        <div key={cls} className="ab-ledger__row">
          <div className="ab-name">
            <GameIcon name={cls} className={`sc-${cls}`} />
            {name}
          </div>
          <Rule {...ability} />
          <ShieldTab value={ability.shield} />
        </div>
      ))}
    </div>
  )
}

export function AbilityBandsCard() {
  return (
    <div className="sc-card ab-bands" aria-label="Class abilities: bands">
      {ABILITIES.map(({ cls, name, ...ability }) => (
        <div key={cls} className={`ab-band ab-band--${CLASS_CLASS[cls]}`}>
          <GameIcon name={cls} className="ab-band__mark" />
          <div className="ab-band__top">
            <GameIcon name={cls} />
            <span className="ab-band__name">{name}</span>
          </div>
          <Rule {...ability} />
          <ShieldTab value={ability.shield} />
        </div>
      ))}
    </div>
  )
}

export function FlexibleRobotsCard() {
  return (
    <div className="sc-card ab-ledger" aria-label="Abilities v2: Flexible Robots">
      {[
        { cls: 'critter', name: 'Win ties', text: 'Equal score → Critters win', shield: '−2' },
        { cls: 'robot', name: 'Reconfigure', text: '1 stat ⇄ 1 ordinary attack', shield: '−1' },
        { cls: 'dragon', name: 'Overwhelming', text: `${FLEXIBLE_RULES.overwhelmingAt}+ Dragon power → +${FLEXIBLE_RULES.overwhelmingBonus}`, shield: '0' },
      ].map(({ cls, name, text, shield }) => (
        <div key={cls} className="ab-ledger__row">
          <div className="ab-name"><GameIcon name={cls} className={`sc-${cls}`} />{name}</div>
          <div className="ab-rule">{text}</div>
          <ShieldTab value={shield} />
        </div>
      ))}
    </div>
  )
}
