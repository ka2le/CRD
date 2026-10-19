import { getHandStats } from './engine.js'

export const TABLETOP_CLASSES = ['critter', 'robot', 'dragon']
export const TABLETOP_SHIELD_COST = { critter: 2, robot: 1, dragon: 0 }
const ULTIMATES = new Set(['murder_rabbit', 'robot_ulti', 'dragon_ulti', 'devour'])

// Derivatives belong to one game; the imported digital definitions stay intact.
export function toTabletopCard(card) {
  const effect = { ...card.effect }
  if (effect.dmgType) effect.dmg = ULTIMATES.has(card.id) ? 4 : 2
  if (card.id === 'bite') effect.dmg = 2
  if (effect.shield) effect.shield = 1
  return { ...card, tabletop: true, cd: 0, effect }
}

export function getTabletopProfile(hand = []) {
  const stats = getHandStats(hand)
  const shields = hand.reduce((sum, card) => sum + (card.effect?.shield > 0 ? 1 : 0), 0)
  const punches = hand.filter((card) => card.id === 'double_dmg').length
  const contributions = { critter: 0, robot: 0, dragon: 0 }
  let neutral = 0
  const attacks = []
  for (const card of hand) {
    let power = 0
    const type = card.effect?.dmgType
    if (type) power = (ULTIMATES.has(card.id) ? 4 : 2) * stats[type]
    else if (card.id === 'bite') power = 2
    else if (card.id === 'shield_is_dmg') power = shields
    else if (card.id === 'one_off_each') power = stats.critter * stats.robot * stats.dragon
    else if (card.id === 'any_off_each') power = stats.critter + stats.robot + stats.dragon
    if (power > 0) {
      power = type === 'robot' ? power * (2 ** punches) : power + punches
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
  const types = [...dominantTypes]
  if (base > 0 && hand.some((card) => card.id === 'devour') && !types.includes('dragon')) types.push('dragon')
  return { stats, shields, contributions, neutral, base, dominantTypes, types, attacks }
}

export function getTabletopBonus(type, power) {
  if (power <= 0) return 0
  if (type === 'critter') return 1
  if (type === 'robot') return (power >= 7 ? 2 : 0) + (power >= 11 ? 1 : 0)
  if (type === 'dragon') return (power >= 11 ? 4 : 0) + (power >= 14 ? 2 : 0)
  return 0
}

export function scoreTabletopHand(hand, enemyShields = 0, damageType = null) {
  const profile = getTabletopProfile(hand)
  if (damageType && !profile.types.includes(damageType)) throw new Error('Invalid tabletop damage type')
  const type = damageType ?? profile.types[0] ?? null
  const shieldPenalty = enemyShields * (TABLETOP_SHIELD_COST[type] ?? 0)
  const blocked = Math.min(profile.base, shieldPenalty)
  const power = profile.base - blocked
  const bonus = getTabletopBonus(type, power)
  return { ...profile, damageType: type, enemyShields, shieldPenalty, blocked, power, bonus, score: power + bonus }
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
  const neutralOnly = Object.values(profile.contributions).every((power) => power === 0)
  return profile.types.filter((type) => card.stats?.includes(type) || card.effect?.dmgType === type
    || (type === 'robot' && neutralOnly && profile.attacks.some((attack) => attack.uid === card.uid && !attack.type)))
}

export function getTabletopChoice(preBattle) {
  const hand = preBattle.playerHand
  const profile = getTabletopProfile(hand)
  const choice = preBattle.tabletopChoice
  const selectedType = choice?.handKey === getTabletopHandKey(hand) && profile.types.includes(choice.type) ? choice.type : null
  return { ...profile, selectedType, needsChoice: profile.types.length > 1 && !selectedType }
}
