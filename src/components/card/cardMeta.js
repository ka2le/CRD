import { isMainAbilityRules } from '../../game/tabletop'
import { getHandAverageDamage } from '../../game/cardEvaluator'
import { isPreBattleActivatableCard } from '../../game/preBattle'
import { TABLETOP_SHIELD_COST, MAIN_ABILITY_SHIELD_COST } from '../../game/tabletop'

const CLASS_ORDER = ['critter', 'robot', 'dragon']
const ALL_CLASS_IDS = new Set(['one_off_each', 'any_off_each', 'single_faction_2', 'joker'])

// Visual "families" used for frame colour and glow.
export function getCardAccents(card) {
  if (!card) return ['neutral']
  if (card.type === 'stat') {
    const classes = CLASS_ORDER.filter((key) => card.stats?.includes(key))
    return classes.length ? classes : ['neutral']
  }
  if (ALL_CLASS_IDS.has(card.id)) return [...CLASS_ORDER]
  if (card.effect?.dmgType) return [card.effect.dmgType]
  if (card.effect?.shield || card.id === 'shield_is_dmg') return ['shield']
  if (card.tabletop && !isPreBattleActivatableCard(card)) return ['neutral']
  if (isPreBattleActivatableCard(card) || (card.cd ?? 0) <= 0) return ['special']
  return ['neutral']
}

export function getAccentStyle(card) {
  const accents = getCardAccents(card)
  const [a, b = a, c = b] = accents
  return {
    '--accent-a': `var(--${a})`,
    '--accent-b': `var(--${b})`,
    '--accent-c': `var(--${c})`,
    '--accent': `var(--${a})`,
  }
}

export function getTimingLabel(cd) {
  if (typeof cd !== 'number' || cd <= 0) return 'Before battle'
  if (cd === 1) return 'Every round'
  if (cd === 2) return 'Every 2nd round'
  if (cd === 3) return 'Every 3rd round'
  return `Every ${cd}th round`
}

const SPECIAL_TEXT = {
  recycle_card: 'Take one card back from the discard pile.',
  draw_all_new_1: 'Discard your whole hand, draw that many +1.',
  draw_2_extra: 'Draw two extra cards.',
  copy_card_in_hand: 'Becomes a copy of another card in your hand.',
  double_dmg: 'Doubles all your damage this round.',
  one_off_each: 'Damage = Critter * Robot * Dragon stats.',
  any_off_each: 'Damage = Critter + Robot + Dragon stats.',
  shield_is_dmg: 'Damage equal to your shield this round.',
  shield2: 'Blocks 2 damage this round.',
  bite: '3 damage, no stats needed.',
  extra_turn: 'Not in play yet.',
  no_stats_to_2: 'With no stat cards in your hand, start with 2 of every stat. Does not stack. Overwhelming can add its extra Dragon stat.',
  draw_2_discard_2: 'Draw 2 cards, then discard 2 cards from your hand. You may discard this card. Finish discarding before using another special.',
  discard_for_damage: 'Discard any number of cards during this activation. Gain 1 neutral power per card discarded. You may discard this card too; it then deals no damage. Copies start at 0 and need their own discards.',
}

const TABLETOP_TEXT = {
  single_faction_2: 'With stats in exactly one faction, adds 2 power per stat of that faction. Multiple stat cards and points are allowed. With no stats or stats in two or three factions, adds nothing. Counts as two attacks of the powered faction, including for Perfect Balance. Overwhelming can add its extra Dragon stat.',
  no_stats_to_2: SPECIAL_TEXT.no_stats_to_2,
  shield_ulti: '3 shield points. Dragons are immune.',
  critter_shield: 'Adds one Critter stat and one shield point. Counts as a stat card for From Nothing.',
  discard_for_damage: (card) => `${SPECIAL_TEXT.discard_for_damage} Current power: ${card.sacrificedPower ?? 0}.`,
  shortcut: 'Grants your main faction bonus even below its threshold, after shields. Requires positive power. Adds no base power. Threshold rules only.',
  chameleon: 'Choose Critter, Robot or Dragon as your main faction before battle. Its bonus and shield vulnerability apply to your whole hand. Adds no stats or base power.',
  bite: (card) => `Adds ${isMainAbilityRules(card.tabletop) ? 2 : 1} power, no stats needed.`,
  double_dmg: 'Doubles your main faction bonus after shields. Works with any faction. Copies stack: *2, *4, *8. Threshold rules only.',
  devour: (card) => isMainAbilityRules(card.tabletop)
    ? '2 power per Dragon stat, like Dragon Ultimate.'
    : '2 power per Dragon stat. You may choose Dragon as your main damage type.',
  // Shield costs differ per rule set; the card carries its rules.
  shield2: (card) => {
    const cost = isMainAbilityRules(card.tabletop) ? MAIN_ABILITY_SHIELD_COST : TABLETOP_SHIELD_COST
    const points = card.effect?.shield ?? 1
    if (isMainAbilityRules(card.tabletop)) return `${points} shields. Blocks ${points} power from Critters or Robots after bonuses. Dragons are immune.`
    return `${points} shield${points === 1 ? '' : 's'}. Each shield point reduces enemy Critter power by ${cost.critter}, Robot by ${cost.robot}, Dragon by ${cost.dragon}, ${isMainAbilityRules(card.tabletop) ? 'after all bonuses and effects' : 'before bonuses'}.`
  },
  shield_is_dmg: 'Adds 1 power per shield point in your hand. Your shields still block.',
  one_off_each: (card) => isMainAbilityRules(card.tabletop)
    ? 'Neutral power = Critter * Robot * Dragon stats. Does not count as a Robot attack for Perfect Balance. Choose among tied main factions; with no typed damage, choose any faction.'
    : 'Robot power = Critter * Robot * Dragon stats. Counts as a Robot attack if it deals damage.',
  any_off_each: 'Power = Critter + Robot + Dragon stats.',
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function getCardSummary(card) {
  if (!card) return { timing: '', text: '' }
  if (card.id === 'critter_shield') return { timing: 'Passive special', text: TABLETOP_TEXT.critter_shield }
  if (card.type === 'stat') {
    const counts = CLASS_ORDER
      .map((key) => [key, (card.stats ?? []).filter((stat) => stat === key).length])
      .filter(([, count]) => count > 0)
      .map(([key, count]) => `+${count} ${capitalize(key)}`)
    return { timing: 'Stat', text: `${counts.join(', ')}. Powers matching attacks.` }
  }

  const timing = isPreBattleActivatableCard(card) ? 'Before battle'
    : card.id === 'no_stats_to_2' && card.tabletop === 'abilities-new-cards' ? 'Passive stats'
    : card.tabletop && card.effect?.shield ? 'Tabletop shield'
    : card.tabletop && (card.effect?.dmg || TABLETOP_TEXT[card.id]) ? 'Tabletop power' : getTimingLabel(card.cd)
  const tabletopText = card.tabletop ? TABLETOP_TEXT[card.id] : null
  if (tabletopText) return { timing, text: typeof tabletopText === 'function' ? tabletopText(card) : tabletopText }
  if (SPECIAL_TEXT[card.id]) return { timing, text: SPECIAL_TEXT[card.id] }

  const { dmg = 0, dmgType } = card.effect ?? {}
  if (dmg && dmgType) return { timing, text: `${dmg} ${card.tabletop ? 'power' : 'damage'} per ${capitalize(dmgType)} stat.` }
  if (dmg) return { timing, text: `${dmg} damage.` }
  return { timing, text: '' }
}

// Change in average damage per round if the card joins (or is part of) `hand`.
export function getDamageDelta(card, hand = []) {
  if (card?.tabletop && ['double_dmg', 'shortcut', 'chameleon'].includes(card.id)) return null // Modifier, not base power.
  if (!card || !(card.tabletop || card.type === 'stat' || card.effect?.dmg)) return null
  const inHand = hand.some((entry) => entry.uid === card.uid)
  const base = inHand ? hand.filter((entry) => entry.uid !== card.uid) : hand
  const withCard = inHand ? hand : [...hand, card]
  return getHandAverageDamage(withCard) - getHandAverageDamage(base)
}

export function formatDelta(delta) {
  const rounded = Math.round(delta * 10) / 10
  if (Math.abs(rounded) < 0.05) return '+0'
  return `${rounded > 0 ? '+' : ''}${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}`
}

export function formatAverage(value) {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

// Hourglasses lit on a given round: fills 1..cd, firing when full.
export function getCardCharge(card, round) {
  if (!card || card.type !== 'action' || typeof card.cd !== 'number' || card.cd <= 0) return null
  if (!round) return 0
  const phase = round % card.cd
  return phase === 0 ? card.cd : phase
}

// Card type groups shared by the collection and the test deck filters.
export const CARD_GROUPS = [
  { key: 'stat', label: 'Stats' },
  { key: 'attack', label: 'Attacks' },
  { key: 'special', label: 'Specials' },
]

export function getCardGroup(card) {
  if (card.id === 'critter_shield') return 'special'
  if (card.type === 'stat') return 'stat'
  if (card.id === 'single_faction_2') return 'special'
  if (card.id === 'single_faction_2' || card.effect?.dmgType || ((card.cd ?? 0) > 0 && card.effect?.dmg)) return 'attack'
  return 'special'
}
