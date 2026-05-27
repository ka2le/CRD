import { getHandAverageDamage } from '../../game/cardEvaluator'
import { DISPLAY_ICONS } from './cardData'

const SPECIAL_EXPLAINERS = {
  recycle_card: 'Before battle: take one card back from your discard pile.',
  draw_all_new_1: 'Before battle: discard your hand, then draw that many cards plus one.',
  draw_2_extra: 'Before battle: draw two extra cards.',
  copy_card_in_hand: 'Before battle: copy another card in your hand.',
  extra_turn: 'Special timing card. Full effect still needs rules support.',
  no_stats_to_2: 'Special setup card. Full effect still needs rules support.',
  double_dmg: 'When this triggers, your damage that round is doubled.',
  one_off_each: 'Deals damage from having Critters, Robots, and Dragons together.',
  any_off_each: 'Deals damage from your total Critter, Robot, and Dragon stats.',
  shield_is_dmg: 'Deals damage based on your shield that round.',
  shield2: 'Blocks incoming damage when it triggers.',
}

function formatDelta(delta) {
  const rounded = Math.round(delta * 10) / 10
  if (Math.abs(rounded) < 0.05) return '+0'
  return `${rounded > 0 ? '+' : ''}${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}`
}

function isRegularDamageOrStatCard(card) {
  return card?.type === 'stat' || Boolean(card?.effect?.dmg)
}

export function getCardTooltip(card, contextHand = []) {
  if (!card || card.uid === '__dummy_card__') return ''

  if (isRegularDamageOrStatCard(card)) {
    const inContext = contextHand.some((handCard) => handCard.uid === card.uid)
    const baseHand = inContext
      ? contextHand.filter((handCard) => handCard.uid !== card.uid)
      : contextHand
    const withCardHand = inContext ? contextHand : [...contextHand, card]
    const delta = getHandAverageDamage(withCardHand) - getHandAverageDamage(baseHand)

    return {
      text: formatDelta(delta),
      icon: DISPLAY_ICONS.dmg,
      alt: 'damage',
      ariaLabel: `${formatDelta(delta)} average damage per round`,
    }
  }

  return SPECIAL_EXPLAINERS[card.id] ?? 'Special card. Full effect text is still being defined.'
}
