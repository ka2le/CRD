import { getExpandedCoreDeck, usesSixDraftStats } from '../../game/cards'
import { startingHandSize, MONSTER_PACK_SIZE } from '../../game/monsters'
import { MAIN_ABILITY_RULES, MAIN_ABILITY_SHIELD_COST, TABLETOP_SHIELD_COST, normalizeTabletopRules, isMainAbilityRules, getShieldDamageMultiplier } from '../../game/tabletop'

// Help, copied rules and reference cards describe the same physical deck as Collection.
export function getRulesCards(options) {
  const cards = new Map()
  for (const card of getExpandedCoreDeck(options)) {
    const existing = cards.get(card.id)
    if (existing) existing.copies += 1
    else cards.set(card.id, { ...card, copies: 1 })
  }
  return [...cards.values()]
}

export function getRulesTitle(value) {
  const rules = normalizeTabletopRules(value)
  return rules === 'monsters' ? 'Monsters' : rules === 'abilities-new-cards' ? 'Abilities+NewCards'
    : rules === 'abilities-main' ? 'Abilities' : rules === 'abilities-prototype' ? 'Abilities Prototype' : rules ? 'Threshold' : 'Battle'
}

export const SIX_DRAFT_FLOW = 'Take one card each from six packs, alternating first pick. Privately set aside one of your six cards and prepare the other five. Set-aside cards stay outside Recycle and are revealed at battle.'
export const SIX_DRAFT_STATS = 'In this 73-card deck, a third Double Critter replaces Double Dragon, and a ninth basic Robot replaces one basic Dragon. Four basic Dragons remain. Devour and Dragon Ultimate each deal 2 power per Dragon stat.'

export function getHandBuildingFacts(rules, mode, options = {}) {
  const size = startingHandSize(rules)
  const pack = rules === 'monsters' ? MONSTER_PACK_SIZE : 5
  if (mode === '20cards') return [{ icon: 'draw', text: '20Cards: deal twenty cards each. Lock fifteen into three ordered hands of five; the ten unused cards enter the shared discard pile. Prepare and battle each hand in order. Two wins win the match; otherwise the match draws after three rounds. Future hands stay reserved and hidden. The undealt deck and discard pile carry over; played hands do not enter the pile automatically.' }]
  if (mode === '6draft') return [
    { icon: 'draw', text: `6draft: ${SIX_DRAFT_FLOW} Each pack contains ${pack} cards.` },
    ...(usesSixDraftStats({ ...options, tabletop: rules, mode: options.poolMode }) ? [{ icon: 'critter', text: SIX_DRAFT_STATS }] : []),
  ]
  if (mode === 'draft' && options.secretCard) return [{ icon: 'draw', text: `Secret Card Draft: each player privately picks one card from a separate five-card pack. Reveal all eight leftovers together into the shared discard pile. Then draft ${size - 1} alternating public packs of ${pack} cards, taking one card each per pack. Prepare with ${size} cards. Secret picks remain hidden until battle.` }]
  const draft = { icon: 'draw', text: rules === 'monsters'
    ? `Draft: pick 1 of ${pack}, opponent picks 1, the rest are discarded. Six packs; six picks each. Alternate first picker.`
    : 'Draft: pick 1 of 5, opponent picks 1, the rest are discarded. Five packs. Alternate first picker.' }
  const discard = { icon: 'redraw', text: rules === 'monsters' ? 'Discard mode: six cards, two redraws back to six.' : 'Discard mode: five cards, two redraws.' }
  return mode === 'draft' ? [draft] : mode === 'five-hand-discard' ? [discard] : [draft, discard]
}

export function getMainAbilityNotes(rules) {
  return {
    critter: `Critter main faction wins equal scores against Robot or Dragon${rules === 'monsters' ? ' or Monster' : ''}. Two Critter hands still tie.`,
    robot: `Perfect Balance: with Robot as main faction, equal positive Robot stats and Robot attack units add +${MAIN_ABILITY_RULES.balanceBonus} before shields. Robot Ultimate counts as two attacks; One of Each does not count.`,
    dragon: `Overwhelming: with Dragon as main faction, ${MAIN_ABILITY_RULES.overwhelmingAt}+ total power before bonuses and shields adds one Dragon stat. Neutral and other-faction damage count toward the threshold. Recalculate all attacks once; keep the original faction choices.`,
    monster: 'Monster main faction has no faction bonus. Each enemy shield point removes 1 Monster power.',
  }
}

export function getShieldCosts(rules) {
  return rules === 'monsters' ? { ...MAIN_ABILITY_SHIELD_COST, monster: 1 }
    : isMainAbilityRules(rules) ? MAIN_ABILITY_SHIELD_COST : TABLETOP_SHIELD_COST
}

export function getShieldRuleText(rules) {
  const cost = getShieldCosts(rules)
  return `Each enemy shield removes ${cost.critter} Critter power, ${cost.robot} Robot power or ${cost.dragon} Dragon power.${rules === 'monsters' ? ' Each enemy shield also removes 1 Monster power.' : ''} Power stops at zero.`
}

export function getMainShieldText(rules) {
  return `Ordinary Shield cards give ${MAIN_ABILITY_RULES.shieldValue} shield points.${['abilities-new-cards', 'monsters'].includes(rules) ? ' Critter Guard adds one Critter stat and one shield point.' : ''} Subtract enemy shield points after effects and bonuses, stopping at zero. Critters and Robots${rules === 'monsters' ? ' and Monsters' : ''} lose 1 power per point; Dragons are immune. Shield is Damage adds ${getShieldDamageMultiplier(rules)} neutral power per shield point. Your shields still block.`
}

export const MONSTER_RULES_TEXT = 'Monsters adds a fourth faction with no faction bonus. Each enemy shield blocks 1 Monster power. Mixed attacks multiply Monster stats by the other printed faction and deal neutral power. Monster Draw / Discard uses your Monster stat count when activated. Transformation changes all current Monster stats into your choice of Critter, Robot or Dragon; later draws are unchanged. In Testing, open Collection → Edit deck counts to change the pool and save a recipe.'
