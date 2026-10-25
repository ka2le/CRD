import { useMemo, useState } from 'react'
import './HelpSheet.css'
import Sheet from './Sheet'
import CardVisual from '../card/CardVisual'
import { getCardSummary } from '../card/cardMeta'
import { useCardInspect } from './inspectContext'
import { Crown } from './AbilityCards'
import { GameIcon, SvgIcon } from '../ui/GameIcon'
import { getCoreCards } from '../../game/cards'
import { getRulesText } from './rulesText'
import { TABLETOP_THRESHOLDS, MAIN_ABILITY_RULES, PERFECT_BALANCE_BONUS, TABLETOP_SHIELD_COST, MAIN_ABILITY_SHIELD_COST, toTabletopCard } from '../../game/tabletop'

const ROUNDS = [1, 2, 3, 4, 5, 6]
const LANES = [
  { key: 'critter', every: 1, dmg: 1 },
  { key: 'robot', every: 2, dmg: 2 },
  { key: 'dragon', every: 3, dmg: 3 },
]

// ---------- Abilities (main tabletop rules) ----------

const AttackChip = ({ cls, ultimate = false }) => (
  <span className={`help__chip help__chip--${cls}`}>
    <GameIcon name={cls} /> * <GameIcon name="damage" />{ultimate ? <GameIcon name="damage" /> : null}
  </span>
)

const Arrow = () => <GameIcon name="arrow" className="help__arrow" />

function ShieldCost({ value }) {
  return (
    <span className={['help__chip', 'help__chip--shield', value ? '' : 'is-zero'].filter(Boolean).join(' ')}>
      <GameIcon name="shield" />{value ? `−${value}` : '0'}
    </span>
  )
}

// One lane per faction: what an enemy shield costs it, and its ability as requirement → result.
const ABILITY_LANES = [
  {
    cls: 'critter',
    name: 'Win ties',
    rule: (
      <>
        <span className="help__chip help__chip--critter"><GameIcon name="critter" /></span>
        <span className="help__op">=</span>
        <span className="help__chip"><GameIcon name="robot" className="help__c-robot" /><span className="help__slash">/</span><GameIcon name="dragon" className="help__c-dragon" /></span>
        <Arrow />
        <span className="help__chip help__chip--critter help__crowned"><Crown className="help__crown" /><GameIcon name="critter" /></span>
      </>
    ),
    note: 'Equal scores against Robots or Dragons go to Critters. Two Critter hands still tie.',
  },
  {
    cls: 'robot',
    name: 'Perfect Balance',
    rule: (
      <>
        <span className="help__chip help__chip--robot"><GameIcon name="robot" /></span>
        <span className="help__op">=</span>
        <AttackChip cls="robot" />
        <Arrow />
        <span className="help__chip help__chip--bonus">+{PERFECT_BALANCE_BONUS} <GameIcon name="damage" /></span>
      </>
    ),
    note: 'As many Robot stats as Robot attack units (at least one each), added before shields. Robot Ultimate counts as two attacks. One of Each is neutral and does not count.',
  },
  {
    cls: 'dragon',
    name: 'Overwhelming',
    rule: (
      <>
        <span className="help__chip help__chip--dragon">{MAIN_ABILITY_RULES.overwhelmingAt}+ <GameIcon name="damage" /></span>
        <Arrow />
        <span className="help__chip help__chip--dragon">+ <GameIcon name="dragon" /></span>
      </>
    ),
    note: `With Dragon as main faction, ${MAIN_ABILITY_RULES.overwhelmingAt}+ total power before bonuses and shields adds one Dragon stat. Include neutral and other-faction power. Recalculate attacks once; keep the original faction choices.`,
  },
]

// Special cards in this rule set, in reading order: Ultimates, other power cards, shields, then preparation.
const CLASS_ORDER = ['critter', 'robot', 'dragon']
function specialRank(card) {
  if (card.effect?.dmgType) return CLASS_ORDER.indexOf(card.effect.dmgType) + (card.id === 'devour' ? 0.5 : 0)
  if (card.effect?.shield) return 20
  return getCardSummary(card).timing === 'Before battle' ? 30 : 10
}

function useSpecialCards(rules) {
  return useMemo(() => getCoreCards({ tabletop: rules })
    .filter((card) => card.type !== 'stat' && !card.tags?.includes('base-attack'))
    .map((card) => ({ ...toTabletopCard(card, rules), uid: `help__${card.id}`, imageIndex: 0 }))
    .sort((a, b) => specialRank(a) - specialRank(b) || a.id.localeCompare(b.id)), [rules])
}

function SpecialCards({ rules }) {
  const inspect = useCardInspect()
  const cards = useSpecialCards(rules)
  return (
    <section className="help__block">
      <h3 className="help__heading"><GameIcon name="star" />Special cards<span className="help__count">{cards.length}</span></h3>
      <div className="help__specials">
        {cards.map((card) => {
          const { timing, text } = getCardSummary(card)
          return (
            <button key={card.id} type="button" className="help__special" onClick={() => inspect?.(card, [])}>
              <span className="help__special-card"><CardVisual card={card} /></span>
              <span className="help__special-text">
                <span className={['help__special-timing', timing === 'Before battle' ? 'is-prep' : '', card.effect?.shield ? 'is-shield' : ''].filter(Boolean).join(' ')}>{timing}</span>
                <span>{text}</span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function AbilitiesMainHelp({ rules }) {
  return (
    <>
      <section className="help__block">
        <div className="help__equation">
          <span className="help__chip help__chip--critter"><GameIcon name="critter" /><GameIcon name="critter" /></span>
          <span className="help__op">+</span>
          <AttackChip cls="critter" />
          <span className="help__op">=</span>
          <span className="help__chip help__chip--damage">2 <GameIcon name="damage" /></span>
        </div>
        <div className="help__equation help__equation--next">
          <span className="help__chip help__chip--critter"><GameIcon name="critter" /><GameIcon name="critter" /></span>
          <span className="help__op">+</span>
          <AttackChip cls="critter" ultimate />
          <span className="help__op">=</span>
          <span className="help__chip help__chip--damage">4 <GameIcon name="damage" /></span>
        </div>
        <p className="help__caption">Each attack gives 1 power per matching stat, Ultimates 2. Add up all attacks.</p>
      </section>

      <section className="help__block">
        <div className="help__equation help__equation--score">
          <span className="help__term"><span className="help__chip help__chip--damage"><GameIcon name="damage" /></span><small>power</small></span>
          <span className="help__op">+</span>
          <span className="help__term"><span className="help__chip help__chip--bonus">+{PERFECT_BALANCE_BONUS}</span><small>balance</small></span>
          <span className="help__op">−</span>
          <span className="help__term"><span className="help__chip help__chip--shield"><GameIcon name="shield" /></span><small>enemy shields</small></span>
          <span className="help__op">=</span>
          <span className="help__term"><span className="help__chip help__chip--score"><GameIcon name="star" /></span><small>score</small></span>
        </div>
        <p className="help__caption">Apply effects and bonuses, then enemy shields. Score stops at zero. Each enemy shield removes {MAIN_ABILITY_SHIELD_COST.critter} Critter power, {MAIN_ABILITY_SHIELD_COST.robot} Robot power or {MAIN_ABILITY_SHIELD_COST.dragon} Dragon power.</p>
      </section>

      <section className="help__block">
        <div className="help__lanes">
          {ABILITY_LANES.map(({ cls, name, rule, note }) => (
            <div key={cls} className={`help__ability help__ability--${cls}`}>
              <span className="help__lane-icon"><GameIcon name={cls} /></span>
              <ShieldCost value={MAIN_ABILITY_SHIELD_COST[cls]} />
              <span className="help__ability-name">{name}</span>
              <span className="help__ability-rule">{rule}</span>
              <span className="help__ability-note">{note}</span>
            </div>
          ))}
        </div>
        <p className="help__caption">Your largest typed damage contribution sets your main faction, shield cost and ability. If tied, tap a highlighted card and choose among tied factions. With no typed damage, choose any faction, even at zero power. One of Each deals neutral damage.</p>
      </section>

      <SpecialCards rules={rules} />
    </>
  )
}

export default function HelpSheet({ open, onClose, tabletop = false }) {
  // Separate state per rules screen, including when changing mode while help is open.
  return <RulesHelp key={`${open}-${tabletop}`} open={open} onClose={onClose} tabletop={tabletop} />
}

function RulesHelp({ open, onClose, tabletop }) {
  const [copyStatus, setCopyStatus] = useState('')
  const rulesText = useMemo(() => getRulesText(tabletop), [tabletop])
  async function copyRules() {
    try {
      await navigator.clipboard.writeText(rulesText)
      setCopyStatus('Copied!')
    } catch {
      setCopyStatus('Select and copy the rules below.')
    }
  }
  const abilitiesMain = tabletop === 'abilities-main'
  const shieldCosts = abilitiesMain ? MAIN_ABILITY_SHIELD_COST : TABLETOP_SHIELD_COST
  return (
    <Sheet open={open} onClose={onClose} title={<SvgIcon name="help" />}>
      <div className="help">
        <div className="help__copy">
          <button type="button" className="ui-button" onClick={copyRules}>Copy rules</button>
          <span role="status">{copyStatus}</span>
        </div>
        {copyStatus === 'Select and copy the rules below.' ? <textarea aria-label="Rules to copy" readOnly value={rulesText} onFocus={(event) => event.target.select()} rows={10} /> : null}
        {abilitiesMain ? <AbilitiesMainHelp rules={tabletop} /> : tabletop ? <section className="help__block help__facts">
          <div className="help__fact"><GameIcon name="damage" /><span>Each ordinary attack gives 1 power per matching stat. Add all attacks.</span></div>
          <div className="help__fact"><GameIcon name="star" /><span>Your largest class contribution is your main damage type. If tied, tap a highlighted card before battle. Neutral-only power uses Robot.</span></div>
          <div className="help__fact"><GameIcon name="shield" /><span>Each enemy shield removes {shieldCosts.critter} Critter power, {shieldCosts.robot} Robot power or {shieldCosts.dragon} Dragon power. Power stops at zero.</span></div>
          {tabletop === 'abilities-prototype' ? <>
            <div className="help__fact"><GameIcon name="critter" /><span>Adapt: the Critter stat on one stat card becomes a Critter attack, used automatically when it scores more. Other stats on that card stay.</span></div>
            <div className="help__fact"><GameIcon name="robot" /><span>Perfect Balance: with Robots as main faction, as many Robot stats as Robot attacks (at least one each) adds +3 after shields. Robot Ultimate counts as two attacks; Critter * Robot * Dragon counts as one Robot attack if it deals damage.</span></div>
            <div className="help__fact"><GameIcon name="dragon" /><span>Overwhelming: Dragon power of 7 or more gains one extra Dragon stat before shields.</span></div>
            <div className="help__fact"><GameIcon name="damage" /><span>Power − shields + Perfect Balance = score. Higher wins; equal scores tie.</span></div>
            <div className="help__fact"><GameIcon name="star" /><span>Chameleon lets you choose any main faction: tap it, then a faction icon. Ultimates, including Devour: 2 per matching stat. Bite: 1.</span></div>
          </> : <>
            <div className="help__fact"><GameIcon name="critter" /><span>After shields, your main faction earns one bonus: Critter +{TABLETOP_THRESHOLDS.critter.bonus} at {TABLETOP_THRESHOLDS.critter.at} power, Robot +{TABLETOP_THRESHOLDS.robot.bonus} at {TABLETOP_THRESHOLDS.robot.at}, Dragon +{TABLETOP_THRESHOLDS.dragon.bonus} at {TABLETOP_THRESHOLDS.dragon.at}.</span></div>
            <div className="help__fact"><GameIcon name="damage" /><span>Base − shields + bonus = score. Higher wins; equal scores tie.</span></div>
            <div className="help__fact"><GameIcon name="arrow" className="g-icon--up" /><span>Shortcut grants your main faction bonus even below its threshold, with positive power. Chameleon lets you choose any main faction: tap it, then a faction icon.</span></div>
            <div className="help__fact"><GameIcon name="star" /><span>Ultimates, including Devour: 2 per matching stat. Bite: 1. The 2* card doubles your main faction bonus after shields; copies stack. Devour also offers a Dragon-type option. Hold a card for its full rule.</span></div>
          </>}
        </section> : <>
        <section className="help__block">
          <div className="help__timeline">
            <span />
            {ROUNDS.map((round) => <span key={round} className="help__round">{round}</span>)}
            <span className="help__round"><GameIcon name="damage" /></span>
            {LANES.map((lane) => (
              <div key={lane.key} className={`help__lane help__lane--${lane.key}`}>
                <span className="help__lane-icon"><GameIcon name={lane.key} /></span>
                {ROUNDS.map((round) => (
                  <span key={round} className={['help__tick', round % lane.every === 0 ? 'help__tick--on' : ''].filter(Boolean).join(' ')} />
                ))}
                <span className="help__lane-dmg">{lane.dmg}*</span>
              </div>
            ))}
          </div>
          <p className="help__caption">Attacks fire on their rounds and hit for damage * your matching stats.</p>
        </section>

        <section className="help__block help__equation">
          <span className="help__chip help__chip--critter"><GameIcon name="critter" /><GameIcon name="critter" /></span>
          <span className="help__op">+</span>
          <span className="help__chip help__chip--critter"><GameIcon name="critter" /> * <GameIcon name="damage" /></span>
          <span className="help__op">=</span>
          <span className="help__chip help__chip--damage">2 <GameIcon name="damage" /></span>
        </section>

        </>}
        <section className="help__block help__facts">
          {!tabletop ? <>
          <div className="help__fact">
            <span className="help__chip help__chip--shield"><GameIcon name="shield" /></span>
            <span>Blocks damage on the round it fires.</span>
          </div>
          <div className="help__fact">
            <span className="help__chip help__chip--damage">21 <GameIcon name="damage" /></span>
            <span>Taken = defeat. Both at once: more damage dealt wins.</span>
          </div>
          <div className="help__fact">
            <span className="help__chip help__chip--special"><GameIcon name="star" /></span>
            <span>Glowing specials can be used before the battle.</span>
          </div>
          </> : <div className="help__fact"><span className="help__chip help__chip--special"><GameIcon name="star" /></span><span>Use specials before battle, or press Battle to finish preparation.</span></div>}
          <div className="help__fact">
            <span className="help__chip"><GameIcon name="draw" /></span>
            <span>Draft: pick 1 of 5, opponent picks 1, the rest are discarded. Five packs.</span>
          </div>
          <div className="help__fact">
            <span className="help__chip"><GameIcon name="redraw" /></span>
            <span>Discard mode: five cards, two redraws.</span>
          </div>
          <div className="help__fact help__fact--tip">
            <span className="help__chip"><SvgIcon name="eye" /></span>
            <span>Hold or right-click any card to inspect it.</span>
          </div>
        </section>
      </div>
    </Sheet>
  )
}
