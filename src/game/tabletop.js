import { getHandStats } from './engine.js'

export const TABLETOP_CLASSES = ['critter', 'robot', 'dragon']
export const TABLETOP_SHIELD_COST = { critter: 2, robot: 1, dragon: 0 }
export const MAIN_ABILITY_SHIELD_COST = { critter: 1, robot: 2, dragon: 0 }
const ULTIMATES = new Set(['murder_rabbit', 'robot_ulti', 'dragon_ulti', 'devour'])

// Abilities means abilities-main. Prototype is retained only for explicit historical use.
//   threshold – one bonus per main faction: Critters 1+ → +2, Robots 4+ → +3, Dragons 8+ → +4.
//   abilities-prototype – original Adapt / Perfect Balance / Overwhelming; no Shortcut, 2× or
//   Critter + Robot + Dragon cards in the deck.
export const TABLETOP_RULES = ['threshold', 'abilities-prototype', 'abilities-main']
const ABILITIES_EXCLUDED_IDS = new Set(['double_dmg', 'shortcut', 'any_off_each'])

// Generic tabletop and abilities aliases always mean the active main rules.
// Only an explicit prototype/old-version name selects the retained prototype.
export function normalizeTabletopRules(value) {
  if (!value) return false
  if (['abilities-prototype', 'abilities-v1', 'old-abilities'].includes(value)) return 'abilities-prototype'
  if (value === 'threshold') return 'threshold'
  return 'abilities-main'
}

// Saved settings must not silently reopen the hidden prototype in normal play.
export function normalizePlayableTabletopRules(value) {
  const rules = normalizeTabletopRules(value)
  return rules === 'abilities-prototype' ? 'abilities-main' : rules
}

export function isCardInTabletopRules(card, rules) {
  const normalized = normalizeTabletopRules(rules)
  if (normalized === 'abilities-main' && card.id === 'chameleon') return false
  return !(['abilities-prototype', 'abilities-main'].includes(normalized) && ABILITIES_EXCLUDED_IDS.has(card.id))
}

// Tabletop cards carry their rule set, so any hand knows how it is scored.
export function getHandTabletopRules(hand = []) {
  return normalizeTabletopRules(hand.find((card) => card?.tabletop)?.tabletop) || 'abilities-main'
}

// Derivatives belong to one game; the imported digital definitions stay intact.
export function toTabletopCard(card, rules = 'abilities-main') {
  const effect = { ...card.effect }
  if (effect.dmgType) effect.dmg = ULTIMATES.has(card.id) ? 2 : 1
  if (card.id === 'bite') effect.dmg = 1
  if (effect.shield) effect.shield = 1
  return { ...card, tabletop: normalizeTabletopRules(rules) || 'abilities-main', cd: 0, effect }
}

// ---------- abilities ----------
export const PERFECT_BALANCE_BONUS = 3
export const PROTOTYPE_ABILITY_RULES = { balanceBonus: PERFECT_BALANCE_BONUS, overwhelmingAt: 7 }
export const MAIN_ABILITY_RULES = { overwhelmingAt: 7, overwhelmingBonus: 0, overwhelmingExtraStat: true, unlimitedBaseReconfigure: false, robotPipReconfigure: false, overwhelmingAfterShields: false, perfectBalance: true }

// Adapt: one stat card with a Critter stat turns its Critter stat(s) into an ordinary Critter attack
// (1 power per Critter stat). Any other faction stats on that card stay (Joker keeps Robot + Dragon).
function isAdaptableCard(card) {
  return card.type === 'stat' && card.stats?.includes('critter')
}

function adaptCard(card) {
  const remaining = card.stats.filter((stat) => stat !== 'critter')
  return { ...card, type: remaining.length ? 'stat' : 'action', stats: remaining,
    effect: { dmg: 1, dmgType: 'critter' }, adaptedFrom: card.id }
}

// Perfect Balance counts Robot attack cards. A Robot Ultimate counts as this many attacks
// (it hits like two ordinary attacks); Critter × Robot × Dragon counts as one Robot attack
// only when it deals damage (at least one stat of each faction).
export const ROBOT_ULTI_ATTACK_COUNT = 2

export function countRobotAttacks(cards, stats = getHandStats(cards)) {
  const oneOfEachHits = stats.critter * stats.robot * stats.dragon > 0
  return cards.reduce((sum, card) => {
    if (card.id === 'robot_ulti') return sum + ROBOT_ULTI_ATTACK_COUNT
    if (card.effect?.dmgType === 'robot' || (card.id === 'one_off_each' && oneOfEachHits)) return sum + 1
    return sum
  }, 0)
}

function getPrototypeAbilitiesPlan(hand, adaptedUid) {
  const cards = adaptedUid ? hand.map((card) => (card.uid === adaptedUid ? adaptCard(card) : card)) : hand
  let profile = computeProfile(cards)
  const dragonBase = profile.contributions.dragon
  // Overwhelming: Dragon base power 7+ gains one Dragon stat before final power.
  const overwhelming = dragonBase >= PROTOTYPE_ABILITY_RULES.overwhelmingAt
  if (overwhelming) profile = computeProfile(cards, { dragon: 1 })
  // Perfect Balance: as many Robot stats as Robot attacks (at least one of each); Robot main faction only.
  const robotAttacks = countRobotAttacks(cards, profile.stats)
  const balanced = profile.stats.robot > 0 && profile.stats.robot === robotAttacks
  return { ...profile, rules: 'abilities-prototype', adaptedUid: adaptedUid ?? null, dragonBase, overwhelming, balanced, robotAttacks }
}

// Adapt is optional; take the conversion that scores best before reveal (no conversion on ties).
function getPrototypeAbilitiesProfile(hand) {
  const plans = [null, ...hand.filter(isAdaptableCard).map((card) => card.uid)].map((uid) => getPrototypeAbilitiesPlan(hand, uid))
  const value = (plan) => plan.base + (plan.balanced && plan.types.includes('robot') ? PROTOTYPE_ABILITY_RULES.balanceBonus : 0)
  return plans.reduce((best, plan) => (value(plan) > value(best) ? plan : best))
}

// Game hands are immutable: a changed hand gets a new array. Search repeatedly
// queries the same hand for base power, eligibility and each faction's score.
const profileCache = new WeakMap()
export function getTabletopProfile(hand = []) {
  if (profileCache.has(hand)) return profileCache.get(hand)
  const rules = getHandTabletopRules(hand)
  const profile = rules === 'abilities-prototype' ? getPrototypeAbilitiesProfile(hand)
    : rules === 'abilities-main' ? getMainAbilitiesProfile(hand) : { ...computeProfile(hand), rules }
  profileCache.set(hand, profile)
  return profile
}

// Historical single-pip interpretation, retained only for archived study replays.
function getLegacyFlexiblePlans(hand) {
  const plans = [{ cards: hand, reconfigured: null }]
  for (const card of hand) {
    if (card.type === 'stat' && card.stats?.includes('robot')) {
      const stats = [...card.stats]
      stats.splice(stats.indexOf('robot'), 1)
      const replacement = { ...card, type: stats.length ? 'stat' : 'action', stats, effect: { dmg: 1, dmgType: 'robot' } }
      plans.push({ cards: hand.map((entry) => entry === card ? replacement : entry),
        reconfigured: { uid: card.uid, direction: 'stat-to-attack' } })
    } else if (card.effect?.dmgType === 'robot' && !ULTIMATES.has(card.id)) {
      const replacement = { ...card, type: 'stat', stats: ['robot'], effect: {} }
      plans.push({ cards: hand.map((entry) => entry === card ? replacement : entry),
        reconfigured: { uid: card.uid, direction: 'attack-to-stat' } })
    }
  }
  return plans
}

// Only the base single-stat / ordinary-attack cards can change (copies included).
// For each possible stat/attack split, use the fewest conversions. Exchanging a
// stat and an attack simultaneously would cancel out, so subsets need no search.
function getBaseFlexiblePlans(hand) {
  const stats = hand.filter((card) => card.id === 'robot1')
  const attacks = hand.filter((card) => card.id === 'robot_attack')
  const plans = [{ cards: hand, reconfigured: null }]
  function addPlan(sources, count, direction) {
    const uids = sources.slice(0, count).map((card) => card.uid)
    const selected = new Set(uids)
    const toAttack = direction === 'stat-to-attack'
    const cards = hand.map((card) => selected.has(card.uid) ? {
      ...card, type: toAttack ? 'action' : 'stat', stats: toAttack ? [] : ['robot'],
      effect: toAttack ? { dmg: 1, dmgType: 'robot' } : {},
    } : card)
    plans.push({ cards, reconfigured: { direction, uids, count } })
  }
  // No conversion wins equal values; among improvements, fewer changes win ties.
  for (let count = 1; count <= Math.max(stats.length, attacks.length); count++) {
    if (count <= stats.length) addPlan(stats, count, 'stat-to-attack')
    if (count <= attacks.length) addPlan(attacks, count, 'attack-to-stat')
  }
  return plans
}

// Every printed Robot stat pip, and only base/ultimate Robot attack
// units, can trade roles. All units are interchangeable for total power, so
// enumerate net unit counts instead of exponentially many physical subsets.
function getRobotPipPlans(hand) {
  const stats = hand.filter((card) => card.type === 'stat' && card.stats?.includes('robot'))
    .map((card) => ({ card, units: card.stats.filter((stat) => stat === 'robot').length }))
  const attacks = hand.filter((card) => ['robot_attack', 'robot_ulti'].includes(card.id))
    .map((card) => ({ card, units: card.id === 'robot_ulti' ? 2 : 1 }))
  const plans = [{ cards: hand, reconfigured: null }]
  const sum = (sources) => sources.reduce((n, source) => n + source.units, 0)
  function addPlan(sources, count, direction) {
    let remaining = count
    const changes = new Map()
    for (const { card, units } of sources) {
      const changed = Math.min(remaining, units)
      if (changed) changes.set(card.uid, changed)
      remaining -= changed
      if (!remaining) break
    }
    const cards = hand.map((card) => {
      const changed = changes.get(card.uid)
      if (!changed) return card
      const toAttack = direction === 'stat-to-attack'
      const stats = [...(card.stats ?? [])]
      if (toAttack) for (let i = 0; i < changed; i++) stats.splice(stats.indexOf('robot'), 1)
      else stats.push(...Array(changed).fill('robot'))
      const attackUnits = toAttack ? changed : (card.id === 'robot_ulti' ? 2 : 1) - changed
      return { ...card, type: stats.length ? 'stat' : 'action', stats,
        effect: attackUnits ? { dmg: attackUnits, dmgType: 'robot' } : {}, tabletopAttackUnits: attackUnits }
    })
    plans.push({ cards, reconfigured: { direction, count, uids: [...changes.keys()],
      changes: [...changes].map(([uid, units]) => ({ uid, units })) } })
  }
  for (let count = 1; count <= Math.max(sum(stats), sum(attacks)); count++) {
    if (count <= sum(stats)) addPlan(stats, count, 'stat-to-attack')
    if (count <= sum(attacks)) addPlan(attacks, count, 'attack-to-stat')
  }
  return plans
}

function getMainAbilitiesPlanProfile({ cards, reconfigured }) {
  let profile = computeProfile(cards)
  const dragonBase = profile.contributions.dragon
  const overwhelming = dragonBase >= MAIN_ABILITY_RULES.overwhelmingAt
  if (overwhelming && MAIN_ABILITY_RULES.overwhelmingExtraStat) profile = computeProfile(cards, { dragon: 1 })
  return { ...profile, rules: 'abilities-main', reconfigured, dragonBase, overwhelming }
}

function flexibleValue(profile) {
  return profile.base + (profile.overwhelming && !MAIN_ABILITY_RULES.overwhelmingExtraStat ? MAIN_ABILITY_RULES.overwhelmingBonus : 0)
}

function getRobotPipProfile(hand) {
  const profiles = getRobotPipPlans(hand).map(getMainAbilitiesPlanProfile)
  const unchanged = profiles[0]
  // A converted hand must actually permit Robot as its resulting main faction.
  const best = profiles.slice(1).filter((profile) => profile.types.includes('robot'))
    .reduce((best, profile) => flexibleValue(profile) > flexibleValue(best) ? profile : best, unchanged)
  if (best === unchanged) return unchanged
  // Non-Robot choices retain the original hand. Only Robot receives conversion.
  const typeProfiles = Object.fromEntries(unchanged.types.map((type) => [type, unchanged]))
  typeProfiles.robot = { ...best, types: ['robot'] }
  return { ...best, types: TABLETOP_CLASSES.filter((type) => typeProfiles[type]), typeProfiles }
}

function getMainAbilitiesProfile(hand) {
  // Adopted v2: Perfect Balance replaces Reconfigure. No Adapt or conversion.
  // The conversion branches below remain available to isolated study variants.
  if (MAIN_ABILITY_RULES.perfectBalance) {
    const profile = getMainAbilitiesPlanProfile({ cards: hand, reconfigured: null })
    const robotAttacks = countRobotAttacks(hand, profile.stats)
    return { ...profile, robotAttacks, balanced: profile.stats.robot > 0 && profile.stats.robot === robotAttacks }
  }
  if (MAIN_ABILITY_RULES.robotPipReconfigure) return getRobotPipProfile(hand)
  const plans = MAIN_ABILITY_RULES.unlimitedBaseReconfigure ? getBaseFlexiblePlans(hand) : getLegacyFlexiblePlans(hand)
  const profiles = plans.map(getMainAbilitiesPlanProfile)
  return profiles.reduce((best, profile) => flexibleValue(profile) > flexibleValue(best) ? profile : best)
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
    if (card.effect?.dmgType) power = (card.tabletopAttackUnits ?? (ULTIMATES.has(card.id) ? 2 : 1)) * stats[type]
    else if (card.id === 'bite') power = 1
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
  critter: { at: 1, bonus: 2 },
  robot: { at: 4, bonus: 3 },
  dragon: { at: 8, bonus: 4 },
}

export function getTabletopBonus(type, power) {
  const threshold = TABLETOP_THRESHOLDS[type]
  if (!threshold || power <= 0) return 0
  return power >= threshold.at ? threshold.bonus : 0
}

export function scoreTabletopHand(hand, enemyShields = 0, damageType = null) {
  let profile = getTabletopProfile(hand)
  if (damageType && !profile.types.includes(damageType)) throw new Error('Invalid tabletop damage type')
  const type = damageType ?? profile.types[0] ?? null
  if (profile.typeProfiles) profile = profile.typeProfiles[type]
  const shieldCosts = profile.rules === 'abilities-main' ? MAIN_ABILITY_SHIELD_COST : TABLETOP_SHIELD_COST
  const shieldPenalty = enemyShields * (shieldCosts[type] ?? 0)
  const blocked = Math.min(profile.base, shieldPenalty)
  const power = profile.base - blocked
  if (profile.rules === 'abilities-main') {
    // Study-only flat-bonus variant: subtract this hand's actual main-faction
    // shield penalty from Dragon contribution before testing the cutoff.
    const dragonThresholdPower = Math.max(0, profile.dragonBase - shieldPenalty)
    const overwhelming = MAIN_ABILITY_RULES.overwhelmingAfterShields
      ? dragonThresholdPower >= MAIN_ABILITY_RULES.overwhelmingAt : profile.overwhelming
    const dragonBonus = overwhelming && !MAIN_ABILITY_RULES.overwhelmingExtraStat ? MAIN_ABILITY_RULES.overwhelmingBonus : 0
    const balanceBonus = MAIN_ABILITY_RULES.perfectBalance && profile.balanced && type === 'robot' ? PERFECT_BALANCE_BONUS : 0
    const bonus = dragonBonus + balanceBonus
    return { ...profile, overwhelming, ...(MAIN_ABILITY_RULES.overwhelmingAfterShields ? { dragonThresholdPower } : {}),
      damageType: type, enemyShields, shieldPenalty, blocked, power,
      naturalBonus: bonus, baseBonus: bonus, bonus, score: power + bonus,
      winsTies: type === 'critter' }
  }
  if (profile.rules === 'abilities-prototype') {
    // Perfect Balance is a Robot ability: only a Robot main faction earns it, after shields.
    const bonus = profile.balanced && type === 'robot' ? PROTOTYPE_ABILITY_RULES.balanceBonus : 0
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
  const shieldCosts = getHandTabletopRules(hand) === 'abilities-main' ? MAIN_ABILITY_SHIELD_COST : TABLETOP_SHIELD_COST
  return [...types].sort((a, b) => scoreTabletopHand(hand, 0, b).score - scoreTabletopHand(hand, 0, a).score
    || (getHandTabletopRules(hand) === 'abilities-main' ? Number(b === 'critter') - Number(a === 'critter') : 0)
    || shieldCosts[a] - shieldCosts[b])[0] ?? null
}

export function resolveTabletopBattle(playerHand, opponentHand, options = {}) {
  const playerProfile = getTabletopProfile(playerHand)
  const opponentProfile = getTabletopProfile(opponentHand)
  if (playerProfile.types.length > 1 && !options.playerType) throw new Error('Choose your tabletop damage type before battle')
  const player = scoreTabletopHand(playerHand, opponentProfile.shields, options.playerType)
  const opponent = scoreTabletopHand(opponentHand, playerProfile.shields, options.opponentType ?? chooseTabletopType(opponentHand))
  const tied = player.score === opponent.score
  const tieWinner = Boolean(player.winsTies) !== Boolean(opponent.winsTies)
    ? (player.winsTies ? 'player' : 'opponent') : 'tie'
  return {
    mode: 'tabletop', player, opponent, playerHand, opponentHand, rounds: [],
    winner: tied ? tieWinner : (player.score > opponent.score ? 'player' : 'opponent'),
    reason: tied && tieWinner !== 'tie' ? 'critter-tiebreak' : 'tabletop-score',
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
