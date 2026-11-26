import './AbilityCards.css'
import { GameIcon } from '../ui/GameIcon'
import CardVisual from '../card/CardVisual'
import { getRulesCards, getMainAbilityNotes, getShieldCosts, getRulesTitle } from './rulesPresentation'
import { PROTOTYPE_ABILITY_RULES, MAIN_ABILITY_RULES } from '../../game/tabletop'

// Prototype reference cards for the alternative "class abilities" tabletop rule.
// View only: nothing here affects digital combat.
//   Critters – Adapt: during preparation, may turn 1 Critter stat card into a Critter attack card.
//   Robots – Perfect Balance: +3 power when Robot stats = Robot attacks (at least 1 each).
//   Dragons – Overwhelming: Dragon base power 7+ gains +1 Dragon stat before final power.

const CLASS_CLASS = { critter: 'c', robot: 'r', dragon: 'd' }

// Render the actual dealt face, including its mode-specific printed values.
function ExampleCard({ cls, attack = false, rules = 'abilities-main' }) {
  const ids = { critter: ['critter1', 'swarm'], robot: ['robot1', 'robot_attack'], dragon: ['dragon1', 'dragons_breath'] }
  const card = getRulesCards({ tabletop: rules }).find(card => card.id === ids[cls][Number(attack)])
  return <span className="ab-pc"><CardVisual card={card} /></span>
}
const StatCard = ({ cls, rules }) => <ExampleCard cls={cls} rules={rules} />
const AttackCard = ({ cls, rules }) => <ExampleCard cls={cls} attack rules={rules} />

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
const PROTOTYPE_ABILITIES = [
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
    right: <span className="ab-plus4"><b>+{PROTOTYPE_ABILITY_RULES.balanceBonus}</b><GameIcon name="damage" /></span>,
  },
  {
    cls: 'dragon',
    name: 'Overwhelming',
    shield: '0',
    left: <span className="ab-thr"><GameIcon name="damage" />{PROTOTYPE_ABILITY_RULES.overwhelmingAt}+</span>,
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

export function PrototypeAbilityLedgerCard() {
  return (
    <div className="sc-card ab-ledger" aria-label="Abilities Prototype: ledger">
      {PROTOTYPE_ABILITIES.map(({ cls, name, ...ability }) => (
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

export function PrototypeAbilityBandsCard() {
  return (
    <div className="sc-card ab-bands" aria-label="Abilities Prototype: bands">
      {PROTOTYPE_ABILITIES.map(({ cls, name, ...ability }) => (
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

// ---------- Abilities (abilities-main) ----------
//   Critters – Win Ties: a Critter main faction wins equal scores against Robots or Dragons.
//   Robots – Perfect Balance: matching Robot stats / typed attack units, +3 before shields.
//   Dragons – Overwhelming: Dragon main with 7+ total power → +1 Dragon stat.

// Crown for the Critter tie win (drawn after the crown_b board-game icon).
export function Crown({ className = '' }) {
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

function mainAbilities(rules) {
  const notes = getMainAbilityNotes(rules)
  return [
    {
      cls: 'critter', name: 'Win Ties', note: 'Critter main wins ties; two Critter hands tie.',
      rule: <div className="ab-rule ab-vs">
        <GameIcon name="critter" className="ab-vs__c" /><span className="ab-op">=</span>
        <span className="ab-vs__others"><GameIcon name="robot" className="ab-vs__r" /><span className="ab-vs__bar" /><GameIcon name="dragon" className="ab-vs__d" />{rules === 'monsters' && <><span className="ab-vs__bar" /><GameIcon name="monster" /></>}</span>
        <Arrow /><span className="ab-crowned"><Crown className="ab-crowned__crown" /><GameIcon name="critter" className="ab-crowned__who" /></span>
      </div>,
    },
    {
      cls: 'robot', name: 'Perfect Balance', note: 'Robot main · equal positive stats / attack units. Ultimate = 2 attacks. Bonus before shields.',
      rule: <Rule left={<><StatCard cls="robot" rules={rules} /><span className="ab-op">=</span><AttackCard cls="robot" rules={rules} /></>}
        arrow={<Arrow />} right={<span className="ab-plus4"><b>+{MAIN_ABILITY_RULES.balanceBonus}</b><GameIcon name="damage" /></span>} />,
    },
    {
      cls: 'dragon', name: 'Overwhelming', note: 'Dragon main · total power before bonuses and shields → one extra Dragon stat.',
      rule: <div className="ab-rule"><span className="ab-thr">{MAIN_ABILITY_RULES.overwhelmingAt}+ <GameIcon name="damage" /></span><Arrow /><span className="ab-op">+</span><StatCard cls="dragon" rules={rules} /></div>,
    },
    ...(rules === 'monsters' ? [{ cls: 'monster', name: 'No faction bonus', note: notes.monster,
      rule: <div className="ab-rule"><GameIcon name="monster" /><span className="ab-op">+0</span><GameIcon name="damage" /></div> }] : []),
  ].map(ability => ({ ...ability, description: notes[ability.cls] }))
}

function MainAbilityCard({ rules = 'abilities-main', bands = false }) {
  const costs = getShieldCosts(rules)
  const title = getRulesTitle(rules)
  return <div className={`sc-card ab-flex ${bands ? 'ab-bands' : 'ab-ledger'} ${rules === 'monsters' ? 'ab-monsters' : ''}`} aria-label={`${title}: ${bands ? 'bands' : 'ledger'}`}>
    <div className="ab-rules-title">{title}</div>
    {mainAbilities(rules).map(({ cls, name, rule, note, description }) => <div key={cls} className={bands ? `ab-band ab-band--${CLASS_CLASS[cls] ?? 'm'}` : 'ab-ledger__row'} title={description}>
      <div className={bands ? 'ab-band__top' : 'ab-name'}><GameIcon name={cls} className={`sc-${cls}`} /><span className={bands ? 'ab-band__name' : undefined}>{name}</span></div>
      {rule}
      <small className="ab-note">{note}</small>
      <ShieldTab value={costs[cls] ? `−${costs[cls]}` : '0'} />
    </div>)}
  </div>
}

export function MainAbilityLedgerCard({ rules }) { return <MainAbilityCard rules={rules} /> }
export function MainAbilityBandsCard({ rules }) { return <MainAbilityCard rules={rules} bands /> }
