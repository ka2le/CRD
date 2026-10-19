import { getHandAverageDamage } from '../../game/cardEvaluator'
import { isPreBattleActivatableCard } from '../../game/preBattle'

const CLASS_ORDER = ['critter', 'robot', 'dragon']
const ALL_CLASS_IDS = new Set(['one_off_each', 'any_off_each', 'joker'])

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
  one_off_each: 'Damage = Critter × Robot × Dragon stats.',
  any_off_each: 'Damage = Critter + Robot + Dragon stats.',
  shield_is_dmg: 'Damage equal to your shield this round.',
  shield2: 'Blocks 2 damage this round.',
  bite: '3 damage, no stats needed.',
  extra_turn: 'Not in play yet.',
  no_stats_to_2: 'Not in play yet.',
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function getCardSummary(card) {
  if (!card) return { timing: '', text: '' }
  if (card.type === 'stat') {
    const counts = CLASS_ORDER
      .map((key) => [key, (card.stats ?? []).filter((stat) => stat === key).length])
      .filter(([, count]) => count > 0)
      .map(([key, count]) => `+${count} ${capitalize(key)}`)
    return { timing: 'Stat', text: `${counts.join(', ')}. Powers matching attacks.` }
  }

  const timing = getTimingLabel(card.cd)
  if (SPECIAL_TEXT[card.id]) return { timing, text: SPECIAL_TEXT[card.id] }

  const { dmg = 0, dmgType } = card.effect ?? {}
  if (dmg && dmgType) return { timing, text: `${dmg} damage per ${capitalize(dmgType)} stat.` }
  if (dmg) return { timing, text: `${dmg} damage.` }
  return { timing, text: '' }
}

// Change in average damage per round if the card joins (or is part of) `hand`.
export function getDamageDelta(card, hand = []) {
  if (!card || !(card.type === 'stat' || card.effect?.dmg)) return null
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
