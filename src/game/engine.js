const CLASS_ORDER = ['robot', 'critter', 'dragon']

function cloneStats(stats = {}) {
  return {
    robot: stats.robot ?? 0,
    critter: stats.critter ?? 0,
    dragon: stats.dragon ?? 0,
  }
}

function emptyStats() {
  return {
    robot: 0,
    critter: 0,
    dragon: 0,
  }
}

export function getCardStats(card) {
  if (card.type !== 'stat') return emptyStats()

  return (card.stats ?? []).reduce((acc, stat) => {
    if (CLASS_ORDER.includes(stat)) {
      acc[stat] += 1
    }
    return acc
  }, emptyStats())
}

export function getHandStats(hand) {
  return hand.reduce((acc, card) => {
    const cardStats = getCardStats(card)

    CLASS_ORDER.forEach((className) => {
      acc[className] += cardStats[className]
    })

    return acc
  }, emptyStats())
}

export function doesCardTrigger(card, round) {
  if (card.type !== 'action') return false
  if (typeof card.cd !== 'number') return false
  if (card.cd <= 0) return false

  return round % card.cd === 0
}

function getCardShield(card, round) {
  if (!doesCardTrigger(card, round)) return 0
  return card.effect?.shield ?? 0
}

function getRoundMultiplier(triggeredCards) {
  return triggeredCards.reduce((multiplier, card) => {
    if (card.id === 'double_dmg') {
      return multiplier * 2
    }

    return multiplier
  }, 1)
}

function getShieldScalingDamage(card, shieldTotal) {
  if (card.id !== 'shield_is_dmg') return 0
  return shieldTotal
}

function getHybridDamage(card, stats) {
  if (card.id === 'one_off_each') {
    return stats.critter * stats.robot * stats.dragon
  }

  if (card.id === 'any_off_each') {
    return stats.critter + stats.robot + stats.dragon
  }

  return 0
}

export function getActionDamage(card, stats, round, context = {}) {
  if (!doesCardTrigger(card, round)) return 0

  const hybridDamage = getHybridDamage(card, stats)
  if (hybridDamage > 0) return hybridDamage

  const shieldScalingDamage = getShieldScalingDamage(card, context.shieldTotal ?? 0)
  if (shieldScalingDamage > 0) return shieldScalingDamage

  const effect = card.effect ?? {}
  const { dmg = 0, dmgType } = effect

  if (!dmg) return 0
  if (!dmgType) return dmg

  const statCount = stats[dmgType] ?? 0
  return statCount * dmg
}

function getCardDamageBurst(card, stats, round, context = {}) {
  const damage = getActionDamage(card, stats, round, context)
  const effect = card.effect ?? {}
  const iconType = card.id === 'shield_is_dmg'
    ? 'shield'
    : effect.dmgType ?? 'dmg'

  return {
    uid: card.uid,
    id: card.id,
    name: card.name,
    damage,
    damageType: effect.dmgType ?? null,
    iconType,
    sourceStats: cloneStats(stats),
  }
}

export function simulateBattle(playerHand, opponentHand, options = {}) {
  const {
    damageToWin = 21,
    maxRounds = 50,
    deck = [],
  } = options

  const finalDeck = Array.isArray(deck) ? [...deck] : []
  const playerBattleHand = [...playerHand]
  const opponentBattleHand = [...opponentHand]

  const playerStats = getHandStats(playerBattleHand)
  const opponentStats = getHandStats(opponentBattleHand)

  let playerDamageTaken = 0
  let opponentDamageTaken = 0
  let playerTotalDamageDealt = 0
  let opponentTotalDamageDealt = 0

  const rounds = []

  for (let round = 1; round <= maxRounds; round += 1) {
    const playerTriggeredCards = playerBattleHand.filter((card) => doesCardTrigger(card, round))
    const opponentTriggeredCards = opponentBattleHand.filter((card) => doesCardTrigger(card, round))

    const playerShield = playerTriggeredCards.reduce((sum, card) => sum + getCardShield(card, round), 0)
    const opponentShield = opponentTriggeredCards.reduce((sum, card) => sum + getCardShield(card, round), 0)

    const playerBursts = playerTriggeredCards.map((card) => getCardDamageBurst(card, playerStats, round, { shieldTotal: playerShield }))
    const opponentBursts = opponentTriggeredCards.map((card) => getCardDamageBurst(card, opponentStats, round, { shieldTotal: opponentShield }))

    const playerMultiplier = getRoundMultiplier(playerTriggeredCards)
    const opponentMultiplier = getRoundMultiplier(opponentTriggeredCards)

    const playerBaseOutgoingDamage = playerBursts.reduce((sum, burst) => sum + burst.damage, 0)
    const opponentBaseOutgoingDamage = opponentBursts.reduce((sum, burst) => sum + burst.damage, 0)

    const playerOutgoingDamage = playerBaseOutgoingDamage * playerMultiplier
    const opponentOutgoingDamage = opponentBaseOutgoingDamage * opponentMultiplier

    const playerBlocked = Math.min(playerShield, opponentOutgoingDamage)
    const opponentBlocked = Math.min(opponentShield, playerOutgoingDamage)

    const playerRoundDamage = Math.max(playerOutgoingDamage - opponentShield, 0)
    const opponentRoundDamage = Math.max(opponentOutgoingDamage - playerShield, 0)

    playerDamageTaken += opponentRoundDamage
    opponentDamageTaken += playerRoundDamage
    playerTotalDamageDealt += playerRoundDamage
    opponentTotalDamageDealt += opponentRoundDamage

    rounds.push({
      round,
      playerRoundDamage,
      opponentRoundDamage,
      playerOutgoingDamage,
      opponentOutgoingDamage,
      playerShield,
      opponentShield,
      playerBlocked,
      opponentBlocked,
      playerDamageTaken,
      opponentDamageTaken,
      playerTriggered: playerTriggeredCards.map((card) => card.name),
      opponentTriggered: opponentTriggeredCards.map((card) => card.name),
      playerTriggeredIds: playerTriggeredCards.map((card) => card.uid),
      opponentTriggeredIds: opponentTriggeredCards.map((card) => card.uid),
      playerBursts,
      opponentBursts,
      playerDraws: [],
      opponentDraws: [],
      playerTotalDamageDealt,
      opponentTotalDamageDealt,
      playerHand: playerBattleHand,
      opponentHand: opponentBattleHand,
      playerStats: cloneStats(playerStats),
      opponentStats: cloneStats(opponentStats),
    })

    const playerReached = playerDamageTaken >= damageToWin
    const opponentReached = opponentDamageTaken >= damageToWin

    if (playerReached || opponentReached) {
      let winner = 'tie'
      let reason = 'same-damage'

      if (playerReached && !opponentReached) {
        winner = 'opponent'
        reason = 'only-player-hit-threshold'
      } else if (!playerReached && opponentReached) {
        winner = 'player'
        reason = 'only-opponent-hit-threshold'
      } else if (playerTotalDamageDealt > opponentTotalDamageDealt) {
        winner = 'player'
        reason = 'more-total-damage-dealt'
      } else if (opponentTotalDamageDealt > playerTotalDamageDealt) {
        winner = 'opponent'
        reason = 'more-total-damage-dealt'
      }

      return {
        rounds,
        winner,
        reason,
        playerStats,
        opponentStats,
        playerDamageTaken,
        opponentDamageTaken,
        playerTotalDamageDealt,
        opponentTotalDamageDealt,
        playerHand: playerBattleHand,
        opponentHand: opponentBattleHand,
        deck: finalDeck,
      }
    }
  }

  return {
    rounds,
    winner: 'tie',
    reason: 'max-rounds-reached',
    playerStats,
    opponentStats,
    playerDamageTaken,
    opponentDamageTaken,
    playerTotalDamageDealt,
    opponentTotalDamageDealt,
    playerHand: playerBattleHand,
    opponentHand: opponentBattleHand,
    deck: finalDeck,
  }
}
