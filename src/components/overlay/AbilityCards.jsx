import './AbilityCards.css'
import { GameIcon } from '../ui/GameIcon'
import { ABILITY_RULES, FLEXIBLE_RULES, TABLETOP_V2_SHIELD_COST } from '../../game/tabletop'

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
        <span className="ab-pc__x">*</span>
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

// ---------- Abilities v2 ----------
//   Critters – Win Ties: a Critter main faction wins equal scores against Robots or Dragons.
//   Robots – Perfect Balance: v1's matching Robot stats / attack units, +3 after shields.
//   Dragons – Overwhelming: 7+ Dragon power → +1 Dragon stat.

// Crown for the Critter tie win (drawn after the crown_b board-game icon).
function Crown({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 24 20" aria-hidden="true">
      <path
        fill="currentColor"
        fillRule="evenodd"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        d="M3.2 7.4 7.6 11.2 12 4.6l4.4 6.6 4.4-3.8-1.6 10H4.8zM12 10.8l-2 2.2 2 2.2 2-2.2z"
      />
      <circle cx="3" cy="5.6" r="1.9" fill="currentColor" />
      <circle cx="12" cy="2.6" r="2.1" fill="currentColor" />
      <circle cx="21" cy="5.6" r="1.9" fill="currentColor" />
    </svg>
  )
}

const FLEXIBLE = [
  {
    cls: 'critter',
    name: 'Win Ties',
    rule: (
      <div className="ab-rule ab-vs">
        <GameIcon name="critter" className="ab-vs__c" />
        <span className="ab-op">=</span>
        <span className="ab-vs__others">
          <GameIcon name="robot" className="ab-vs__r" />
          <span className="ab-vs__bar" />
          <GameIcon name="dragon" className="ab-vs__d" />
        </span>
        <Arrow />
        <span className="ab-crowned">
          <Crown className="ab-crowned__crown" />
          <GameIcon name="critter" className="ab-crowned__who" />
        </span>
      </div>
    ),
  },
  {
    cls: 'robot',
    name: ABILITIES[1].name,
    rule: <Rule {...ABILITIES[1]} />,
  },
  {
    cls: 'dragon',
    name: 'Overwhelming',
    shield: '0',
    rule: (
      <div className="ab-cols">
        <span className="ab-cols__req">{FLEXIBLE_RULES.overwhelmingAt}+</span>
        <span className="ab-cols__res">
          <span className="ab-cols__plus">+</span>
          <StatCard cls="dragon" />
        </span>
      </div>
    ),
  },
]

export function FlexibleLedgerCard() {
  return (
    <div className="sc-card ab-ledger ab-flex" aria-label="Abilities v2: ledger">
      {FLEXIBLE.map(({ cls, name, rule }) => (
        <div key={cls} className="ab-ledger__row">
          <div className="ab-name"><GameIcon name={cls} className={`sc-${cls}`} />{name}</div>
          {rule}
          <ShieldTab value={TABLETOP_V2_SHIELD_COST[cls] ? `−${TABLETOP_V2_SHIELD_COST[cls]}` : '0'} />
        </div>
      ))}
    </div>
  )
}

export function FlexibleBandsCard() {
  return (
    <div className="sc-card ab-bands ab-flex" aria-label="Abilities v2: bands">
      {FLEXIBLE.map(({ cls, name, rule }) => (
        <div key={cls} className={`ab-band ab-band--${CLASS_CLASS[cls]}`}>
          <GameIcon name={cls} className="ab-band__mark" />
          <div className="ab-band__top">
            <GameIcon name={cls} />
            <span className="ab-band__name">{name}</span>
          </div>
          {rule}
          <ShieldTab value={TABLETOP_V2_SHIELD_COST[cls] ? `−${TABLETOP_V2_SHIELD_COST[cls]}` : '0'} />
        </div>
      ))}
    </div>
  )
}
