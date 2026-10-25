import { getCoreCards } from '../../game/cards'
import { getCardSummary } from '../card/cardMeta'
import { MAIN_ABILITY_RULES, MAIN_ABILITY_SHIELD_COST, TABLETOP_SHIELD_COST, TABLETOP_THRESHOLDS, PERFECT_BALANCE_BONUS, toTabletopCard } from '../../game/tabletop'

// Plain text includes the meaning of the illustrated rules, rather than losing icons
// when copying the sheet's DOM text. Card descriptions use the same source as inspection.
export function getRulesText(rules = false) {
  const main = rules === 'abilities-main'
  const prototype = rules === 'abilities-prototype'
  const title = main ? 'Abilities' : prototype ? 'Abilities Prototype' : rules ? 'Threshold' : 'Battle'
  const lines = [`Critters Robots Dragons — ${title}`, '',
    'Draft: pick 1 of 5, opponent picks 1, the rest are discarded. Five packs.',
    'Discard mode: five cards, two redraws.',
    'Use specials before battle, or press Battle to finish preparation.', '']
  if (rules) {
    const cost = main ? MAIN_ABILITY_SHIELD_COST : TABLETOP_SHIELD_COST
    lines.push('Each ordinary attack gives 1 power per matching stat; Ultimates (including Devour) give 2. Add all attacks.',
      `Bite adds ${main ? 2 : 1} power, no stats needed.`,
      main ? 'Your largest typed damage contribution determines your main faction. If tied, choose among the tied factions. With no typed damage, choose any faction, even at zero power. One of Each is neutral damage and does not count for Perfect Balance.' : 'Your largest faction contribution is your main faction. If tied, choose before battle. Neutral-only power counts as Robot.',
      `Each enemy shield removes ${cost.critter} Critter power, ${cost.robot} Robot power or ${cost.dragon} Dragon power. Power stops at zero.`)
    if (main || prototype) {
      if (prototype) lines.push('Adapt: the Critter stats on one stat card become a Critter attack, used automatically when it scores more. Other stats stay.')
      lines.push(main ? `Perfect Balance: with Robot as main faction, equal positive Robot stats and Robot attack units add +${PERFECT_BALANCE_BONUS} before shields. Robot Ultimate counts as two attacks; One of Each does not count.` : `Perfect Balance: with Robot as main faction, equal positive Robot stats and Robot attacks add +${PERFECT_BALANCE_BONUS} after shields. Robot Ultimate counts as two attacks; Critter * Robot * Dragon counts as one if it deals damage.`,
        main ? `Overwhelming: with Dragon as main faction, ${MAIN_ABILITY_RULES.overwhelmingAt}+ total power before bonuses and shields adds one Dragon stat. Neutral and other-faction damage count toward the threshold. Recalculate all attacks once; keep the original faction choices.` : 'Overwhelming: 7+ Dragon power before shields adds one Dragon stat. Recalculate all attacks once.',
        main ? 'Apply all effects and bonuses first, then subtract enemy shields from the total, floored at zero. Power + Perfect Balance − enemy shields = score. Higher score wins.' : 'Power − enemy shields + Perfect Balance = score. Higher score wins.',
        main ? 'Critter main faction wins equal scores against Robot or Dragon. Two Critter hands still tie.' : 'Equal scores tie.')
    } else {
      lines.push(`After shields, your main faction earns one bonus: ${Object.entries(TABLETOP_THRESHOLDS).map(([type, { at, bonus }]) => `${type} +${bonus} at ${at} power`).join(', ')}.`,
        'Power − enemy shields + bonus = score. Higher score wins; equal scores tie.')
    }
    if (main) lines.push('Devour and Dragon Ultimate each give 2 power per Dragon stat. Devour does not grant a main faction choice.')
  } else {
    lines.push('Attacks fire when the round is a multiple of their cooldown. Damage = attack damage * matching stats.',
      'Ordinary Critter attacks: 1 damage per stat every round. Robot: 2 every 2 rounds. Dragon: 3 every 3 rounds.',
      'Shields block damage on the round they fire. Both sides attack simultaneously.',
      'Taking 21 damage means defeat. If both reach 21 at once, more total damage dealt wins; equal totals tie. No defeat by round 50 means a tie.')
  }
  lines.push('', 'Cards')
  for (const source of getCoreCards({ tabletop: rules })) {
    const card = rules ? toTabletopCard(source, rules) : source
    const { timing, text } = getCardSummary(card)
    lines.push(`${card.name}: ${timing}. ${text}`)
  }
  lines.push('', 'Hold or right-click any card to inspect it.')
  return lines.join('\n')
}
