import { getHandStats } from './engine.js'

export const TABLETOP_CLASSES = ['critter', 'robot', 'dragon']
export const TABLETOP_SHIELD_COST = { critter: 2, robot: 1, dragon: 0 }
const ULTIMATES = new Set(['murder_rabbit', 'robot_ulti', 'dragon_ulti', 'devour'])

// Two tabletop rule sets share the single power calculation and shield penalty:
//   threshold – one bonus per main faction: Critters 2+ → +1, Robots 8+ → +3, Dragons 14+ → +6.
//   abilities – class abilities (Adapt, Perfect Balance, Overwhelming); no Shortcut or 2× cards in the deck.
export const TABLETOP_RULES = ['threshold', 'abilities']
const ABILITIES_EXCLUDED_IDS = new Set(['double_dmg', 'shortcut'])

// Settings store `false` for the round-by-round battle; `true` is the legacy threshold toggle.
export function normalizeTabletopRules(value) {
  if (!value) return false
  return value === 'abilities' ? 'abilities' : 'threshold'
}

export function isCardInTabletopRules(card, rules) {
  return !(normalizeTabletopRules(rules) === 'abilities' && ABILITIES_EXCLUDED_IDS.has(card.id))
}

// Tabletop cards carry their rule set, so any hand knows how it is scored.
export function getHandTabletopRules(hand = []) {
  return normalizeTabletopRules(hand.find((card) => card?.tabletop)?.tabletop) || 'threshold'
}

// Derivatives belong to one game; the imported digital definitions stay intact.
export function toTabletopCard(card, rules = 'threshold') {
  const effect = { ...card.effect }
  if (effect.dmgType) effect.dmg = ULTIMATES.has(card.id) ? 4 : 2
  if (card.id === 'bite') effect.dmg = 2
  if (effect.shield) effect.shield = 1
  return { ...card, tabletop: normalizeTabletopRules(rules) || 'threshold', cd: 0, effect }
}

// ---------- abilities ----------
export const ABILITY_RULES = { balanceBonus: 3, overwhelmingAt: 14 }

// Adapt: one stat card with a Critter stat turns its Critter stat(s) into an ordinary Critter attack
// (2 power per Critter stat). Any other faction stats on that card stay (Joker keeps Robot + Dragon).
function isAdaptableCard(card) {
  return card.type === 'stat' && card.stats?.includes('critter')
}

function adaptCard(card) {
  const remaining = card.stats.filter((stat) => stat !== 'critter')
  return { ...card, type: remaining.length ? 'stat' : 'action', stats: remaining,
    effect: { dmg: 2, dmgType: 'critter' }, adaptedFrom: card.id }
}

// Perfect Balance counts Robot attack cards. A Robot Ultimate counts as this many attacks
// (it hits like two ordinary attacks); Critter × Robot × Dragon counts as one Robot attack.
export const ROBOT_ULTI_ATTACK_COUNT = 2

export function countRobotAttacks(cards) {
  return cards.reduce((sum, card) => {
    if (card.id === 'robot_ulti') return sum + ROBOT_ULTI_ATTACK_COUNT
    if (card.effect?.dmgType === 'robot' || card.id === 'one_off_each') return sum + 1
    return sum
  }, 0)
}

function getAbilitiesPlan(hand, adaptedUid) {
  const cards = adaptedUid ? hand.map((card) => (card.uid === adaptedUid ? adaptCard(card) : card)) : hand
  let profile = computeProfile(cards)
  const dragonBase = profile.contributions.dragon
  // Overwhelming: Dragon base power 14+ gains one Dragon stat before final power.
  const overwhelming = dragonBase >= ABILITY_RULES.overwhelmingAt
  if (overwhelming) profile = computeProfile(cards, { dragon: 1 })
  // Perfect Balance: as many Robot stats as Robot attacks (at least one of each); Robot main faction only.
  const robotAttacks = countRobotAttacks(cards)
  const balanced = profile.stats.robot > 0 && profile.stats.robot === robotAttacks
  return { ...profile, rules: 'abilities', adaptedUid: adaptedUid ?? null, dragonBase, overwhelming, balanced, robotAttacks }
}

// Adapt is optional; take the conversion that scores best before reveal (no conversion on ties).
function getAbilitiesProfile(hand) {
  const plans = [null, ...hand.filter(isAdaptableCard).map((card) => card.uid)].map((uid) => getAbilitiesPlan(hand, uid))
  const value = (plan) => plan.base + (plan.balanced && plan.types.includes('robot') ? ABILITY_RULES.balanceBonus : 0)
  return plans.reduce((best, plan) => (value(plan) > value(best) ? plan : best))
}

export function getTabletopProfile(hand = []) {
  return getHandTabletopRules(hand) === 'abilities'
    ? getAbilitiesProfile(hand)
    : { ...computeProfile(hand), rules: 'threshold' }
}

function computeProfile(hand = [], extraStats = {}) {
  const stats = getHandStats(hand)
  for (const [type, extra] of Object.entries(extraStats)) stats[type] += extra
  const shields = hand.reduce((sum, card) => sum + (card.effect?.shield > 0 ? 1 : 0), 0)
  const bonusMultiplier = 2 ** hand.filter((card) => card.id === 'double_dmg').length
  const shortcuts = hand.filter((card) => card.id === 'shortcut').length
  const hasChameleon = hand.some((card) => card.id === 'chameleon')
  const contributions = { critter: 0, robot: 0, dragon: 0 }
  let neutral = 0
  const attacks = []
  for (const card of hand) {
    let power = 0
    // Critter × Robot × Dragon counts as Robot damage in tabletop scoring.
    const type = card.effect?.dmgType ?? (card.id === 'one_off_each' ? 'robot' : undefined)
    if (card.effect?.dmgType) power = (ULTIMATES.has(card.id) ? 4 : 2) * stats[type]
    else if (card.id === 'bite') power = 2
    else if (card.id === 'shield_is_dmg') power = shields
    else if (card.id === 'one_off_each') power = stats.critter * stats.robot * stats.dragon
    else if (card.id === 'any_off_each') power = stats.critter + stats.robot + stats.dragon
    if (power > 0) {
      if (type) contributions[type] += power
      else neutral += power
      attacks.push({ uid: card.uid, power, type: type ?? null })
    }
  }
  const base = neutral + Object.values(contributions).reduce((sum, value) => sum + value, 0)
  const largest = Math.max(...Object.values(contributions))
  // Neutral-only hands use Robot; zero-power hands cannot earn a bonus.
  const dominantTypes = largest > 0
    ? TABLETOP_CLASSES.filter((type) => contributions[type] === largest)
    : (base > 0 ? ['robot'] : [])
  const types = hasChameleon ? [...TABLETOP_CLASSES] : [...dominantTypes]
  if (base > 0 && hand.some((card) => card.id === 'devour') && !types.includes('dragon')) types.push('dragon')
  return { stats, shields, contributions, neutral, base, dominantTypes, types, attacks, bonusMultiplier, shortcuts, hasChameleon }
}

// Each Shortcut copy advances the earned faction bonus this many tiers (threshold rules only).
export const SHORTCUT_TIER_STEPS = 2

// Threshold rules: one threshold per main faction, checked after shields.
export const TABLETOP_THRESHOLDS = {
  critter: { at: 2, bonus: 1 },
  robot: { at: 8, bonus: 3 },
  dragon: { at: 14, bonus: 6 },
}

export function getTabletopBonus(type, power) {
  const threshold = TABLETOP_THRESHOLDS[type]
  if (!threshold || power <= 0) return 0
  return power >= threshold.at ? threshold.bonus : 0
}

export function scoreTabletopHand(hand, enemyShields = 0, damageType = null) {
  const profile = getTabletopProfile(hand)
  if (damageType && !profile.types.includes(damageType)) throw new Error('Invalid tabletop damage type')
  const type = damageType ?? profile.types[0] ?? null
  const shieldPenalty = enemyShields * (TABLETOP_SHIELD_COST[type] ?? 0)
  const blocked = Math.min(profile.base, shieldPenalty)
  const power = profile.base - blocked
  if (profile.rules === 'abilities') {
    // Perfect Balance is a Robot ability: only a Robot main faction earns it, after shields.
    const bonus = profile.balanced && type === 'robot' ? ABILITY_RULES.balanceBonus : 0
    return { ...profile, damageType: type, enemyShields, shieldPenalty, blocked, power,
      naturalBonus: bonus, baseBonus: bonus, bonus, score: power + bonus }
  }
  const naturalBonus = getTabletopBonus(type, power)
  const tiers = TABLETOP_THRESHOLDS[type] ? [0, TABLETOP_THRESHOLDS[type].bonus] : [0]
  const tierIndex = tiers.indexOf(naturalBonus)
  const baseBonus = power > 0 ? tiers[Math.min(tierIndex + (profile.shortcuts * SHORTCUT_TIER_STEPS), tiers.length - 1)] : 0
  const bonus = baseBonus * profile.bonusMultiplier
  return { ...profile, damageType: type, enemyShields, shieldPenalty, blocked, power, naturalBonus, baseBonus, bonus, score: power + bonus }
}

// AI commits from its own hand, before reveal, without consulting enemy shields.
export function chooseTabletopType(hand) {
  const { types } = getTabletopProfile(hand)
  return [...types].sort((a, b) => scoreTabletopHand(hand, 0, b).score - scoreTabletopHand(hand, 0, a).score
    || TABLETOP_SHIELD_COST[a] - TABLETOP_SHIELD_COST[b])[0] ?? null
}

export function resolveTabletopBattle(playerHand, opponentHand, options = {}) {
  const playerProfile = getTabletopProfile(playerHand)
  const opponentProfile = getTabletopProfile(opponentHand)
  if (playerProfile.types.length > 1 && !options.playerType) throw new Error('Choose your tabletop damage type before battle')
  const player = scoreTabletopHand(playerHand, opponentProfile.shields, options.playerType)
  const opponent = scoreTabletopHand(opponentHand, playerProfile.shields, options.opponentType ?? chooseTabletopType(opponentHand))
  return {
    mode: 'tabletop', player, opponent, playerHand, opponentHand, rounds: [],
    winner: player.score === opponent.score ? 'tie' : (player.score > opponent.score ? 'player' : 'opponent'),
    reason: 'tabletop-score',
  }
}

export function getTabletopHandKey(hand) {
  return hand.map((card) => card.uid).join('|')
}

export function getCardTabletopTypes(card, profile) {
  if (card.id === 'chameleon') return [...TABLETOP_CLASSES]
  const neutralOnly = Object.values(profile.contributions).every((power) => power === 0)
  return profile.types.filter((type) => card.stats?.includes(type) || card.effect?.dmgType === type
    || (type === 'robot' && card.id === 'one_off_each')
    || (type === 'robot' && neutralOnly && profile.attacks.some((attack) => attack.uid === card.uid && !attack.type)))
}

export function getTabletopChoice(preBattle) {
  const hand = preBattle.playerHand
  const profile = getTabletopProfile(hand)
  const choice = preBattle.tabletopChoice
  const selectedType = choice?.handKey === getTabletopHandKey(hand) && profile.types.includes(choice.type) ? choice.type : null
  return { ...profile, selectedType, needsChoice: profile.types.length > 1 && !selectedType }
}
