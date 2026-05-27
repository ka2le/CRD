import { getActionDamage, getHandStats } from './engine.js'

const CLASS_ORDER = ['critter', 'robot', 'dragon']
const COPY_CARD_BONUS = 220
const RECYCLE_CARD_BONUS = 40
const DAMAGE_DELTA_WEIGHT = 1000
const DAMAGE_PRESENT_BONUS = 300
const STAT_FALLBACK_WEIGHT = 80
const DOUBLE_STAT_FALLBACK_BONUS = 70
const SPLASH_STAT_WEIGHT = 20
const SHIELD_ONLY_PENALTY = 220
const DRAW_UTILITY_PENALTY = 260
const OFF_PLAN_DAMAGE_PENALTY = 120
const SHIELD_SCALING_TRAP_PENALTY = 900
const EMPTY_DAMAGE_CARD_PENALTY = 260
const ALWAYS_KEEP_DAMAGE_THRESHOLD = 2

function emptyStats() {
  return {
    critter: 0,
    robot: 0,
    dragon: 0,
  }
}

function getCardStats(card) {
  if (card?.type !== 'stat') return emptyStats()

  return (card.stats ?? []).reduce((acc, stat) => {
    if (CLASS_ORDER.includes(stat)) acc[stat] += 1
    return acc
  }, emptyStats())
}

function sumStats(stats = {}) {
  return CLASS_ORDER.reduce((sum, className) => sum + (stats[className] ?? 0), 0)
}

export function getAverageRoundDamageForCard(card, stats, shieldEstimate = 0) {
  if (!card || card.type !== 'action' || !card.cd || card.cd <= 0) return 0

  let total = 0
  const cycle = Math.max(card.cd, 1)
  for (let round = 1; round <= cycle; round += 1) {
    total += getActionDamage(card, stats, round, { shieldTotal: shieldEstimate })
  }

  return total / cycle
}

export function getShieldAverage(hand = []) {
  const shieldCards = hand.filter((card) => (card.effect?.shield ?? 0) > 0)
  if (!shieldCards.length) return 0

  let total = 0
  shieldCards.forEach((card) => {
    const shield = card.effect?.shield ?? 0
    total += shield / Math.max(card.cd ?? 1, 1)
  })

  return total
}

export function getHandAverageDamage(hand = []) {
  const stats = getHandStats(hand)
  const shieldEstimate = getShieldAverage(hand)

  return hand.reduce((sum, card) => sum + getAverageRoundDamageForCard(card, stats, shieldEstimate), 0)
}

function getPlanProfile(hand = []) {
  const stats = getHandStats(hand)

  return CLASS_ORDER.reduce((profile, className) => {
    const statCount = stats[className] ?? 0
    const damageCards = hand.filter((card) => card.effect?.dmgType === className)
    const damageCount = damageCards.length
    const damageAverage = damageCards.reduce((sum, card) => sum + getAverageRoundDamageForCard(card, stats), 0)

    profile[className] = {
      className,
      statCount,
      damageCount,
      damageAverage,
      score: (damageAverage * 100) + (damageCount * 80) + (statCount * 30),
    }

    return profile
  }, {})
}

export function chooseMainPlan(hand = []) {
  const profile = getPlanProfile(hand)

  return CLASS_ORDER.reduce((bestClass, className) => {
    if (!bestClass) return className
    return profile[className].score > profile[bestClass].score ? className : bestClass
  }, null) ?? 'critter'
}

function getStatFallbackScore(card, mainPlan) {
  const stats = getCardStats(card)
  const planStats = stats[mainPlan] ?? 0
  const totalStats = sumStats(stats)
  const splashStats = totalStats - planStats

  let score = 0
  score += planStats * STAT_FALLBACK_WEIGHT
  if (planStats >= 2) score += DOUBLE_STAT_FALLBACK_BONUS
  score += splashStats * SPLASH_STAT_WEIGHT
  return score
}

function isTrapCard(card, hand = []) {
  if (!card) return false

  if (card.id === 'shield_is_dmg') {
    const totalShield = hand.reduce((sum, handCard) => sum + (handCard.effect?.shield ?? 0), 0)
    return totalShield <= 0
  }

  return false
}

function getCurrentPlanStats(hand = [], mainPlan) {
  const stats = getHandStats(hand)
  return stats[mainPlan] ?? 0
}

function getCurrentPlanDamageCards(hand = [], mainPlan) {
  return hand.filter((card) => card.effect?.dmgType === mainPlan)
}

export function evaluateCardForHand(card, hand = [], options = {}) {
  if (!card) return Number.NEGATIVE_INFINITY

  const mainPlan = options.mainPlan ?? chooseMainPlan(hand)
  const currentAverageDamage = getHandAverageDamage(hand)
  const nextHand = [...hand, card]
  const nextAverageDamage = getHandAverageDamage(nextHand)
  const damageDelta = nextAverageDamage - currentAverageDamage
  const dmgType = card.effect?.dmgType ?? null
  const shieldValue = card.effect?.shield ?? 0
  const stats = getHandStats(nextHand)
  const directCardAverageDamage = getAverageRoundDamageForCard(card, stats, getShieldAverage(nextHand))

  let score = 0

  if (card.id === 'copy_card_in_hand') score += COPY_CARD_BONUS
  if (card.id === 'recycle_card') score += RECYCLE_CARD_BONUS

  score += damageDelta * DAMAGE_DELTA_WEIGHT

  if (damageDelta > 0) {
    score += DAMAGE_PRESENT_BONUS
    score += directCardAverageDamage * 60
  } else {
    score += getStatFallbackScore(card, mainPlan)
  }

  if (dmgType && dmgType !== mainPlan && damageDelta <= 0) {
    score -= OFF_PLAN_DAMAGE_PENALTY
  }

  if (dmgType && (stats[dmgType] ?? 0) <= 0) {
    score -= EMPTY_DAMAGE_CARD_PENALTY
  }

  if (shieldValue > 0 && damageDelta <= 0) {
    score -= SHIELD_ONLY_PENALTY
  }

  if ((card.id === 'draw_2_extra' || card.id === 'draw_all_new_1') && damageDelta <= 0) {
    score -= DRAW_UTILITY_PENALTY
  }

  if (isTrapCard(card, hand)) {
    score -= SHIELD_SCALING_TRAP_PENALTY
  }

  return score
}

export function rankCardsForHand(cards = [], hand = [], options = {}) {
  const mainPlan = options.mainPlan ?? chooseMainPlan(hand)

  return [...cards]
    .map((card) => ({
      card,
      score: evaluateCardForHand(card, hand, { ...options, mainPlan }),
    }))
    .sort((a, b) => b.score - a.score)
}

export function pickBestCardForHand(cards = [], hand = [], options = {}) {
  return rankCardsForHand(cards, hand, options)[0]?.card ?? null
}

export function chooseCardsToKeep(hand = [], options = {}) {
  if (hand.length <= 1) return [...hand]

  const mainPlan = options.mainPlan ?? chooseMainPlan(hand)
  const keepCount = options.keepCount ?? Math.max(0, hand.length - (options.discardCount ?? 0))
  const ranked = rankCardsForHand(hand, [], { ...options, mainPlan })
  const alwaysKeep = []
  const alwaysKeepIds = new Set()
  const nextStats = getHandStats(hand)
  const shieldEstimate = getShieldAverage(hand)

  hand.forEach((card) => {
    const averageDamage = getAverageRoundDamageForCard(card, nextStats, shieldEstimate)
    if (averageDamage > ALWAYS_KEEP_DAMAGE_THRESHOLD) {
      alwaysKeep.push(card)
      alwaysKeepIds.add(card.uid)
    }
  })

  const kept = [...alwaysKeep]

  ranked.forEach(({ card }) => {
    if (kept.length >= Math.max(0, Math.min(keepCount, hand.length))) return
    if (alwaysKeepIds.has(card.uid)) return
    kept.push(card)
  })

  return kept
}

export function chooseDiscardIds(hand = [], options = {}) {
  const mainPlan = options.mainPlan ?? chooseMainPlan(hand)
  const discardCount = options.discardCount ?? 2
  const keepTarget = Math.max(0, hand.length - discardCount)
  const planStats = getCurrentPlanStats(hand, mainPlan)
  const planDamageCards = getCurrentPlanDamageCards(hand, mainPlan)
  const ranked = rankCardsForHand(hand, [], { ...options, mainPlan })
  const keepIds = new Set()
  const handStats = getHandStats(hand)
  const shieldEstimate = getShieldAverage(hand)

  ranked.forEach(({ card }) => {
    const averageDamage = getAverageRoundDamageForCard(card, handStats, shieldEstimate)
    if (averageDamage > ALWAYS_KEEP_DAMAGE_THRESHOLD) {
      keepIds.add(card.uid)
    }
  })

  if (planDamageCards.length > 0) {
    ranked.forEach(({ card }) => {
      if (keepIds.size >= keepTarget) return
      if (card.effect?.dmgType === mainPlan) keepIds.add(card.uid)
    })

    ranked.forEach(({ card }) => {
      if (keepIds.size >= keepTarget) return
      if ((getCardStats(card)[mainPlan] ?? 0) > 0) keepIds.add(card.uid)
    })

    ranked.forEach(({ card }) => {
      if (keepIds.size >= keepTarget) return
      if (card.id === 'copy_card_in_hand') keepIds.add(card.uid)
    })
  } else {
    ranked.forEach(({ card }) => {
      if (keepIds.size >= Math.min(3, keepTarget)) return
      keepIds.add(card.uid)
    })

    if (planStats <= 0) {
      ranked.forEach(({ card }) => {
        if (keepIds.size >= keepTarget) return
        if ((getCardStats(card)[mainPlan] ?? 0) >= 2) keepIds.add(card.uid)
      })
    }
  }

  ranked.forEach(({ card }) => {
    if (keepIds.size >= keepTarget) return
    keepIds.add(card.uid)
  })

  return hand
    .filter((card) => !keepIds.has(card.uid))
    .map((card) => card.uid)
}
