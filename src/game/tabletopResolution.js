import {
  TABLETOP_CLASSES, MAIN_ABILITY_SHIELD_COST, TABLETOP_SHIELD_COST, ROBOT_ULTI_ATTACK_COUNT,
  MAIN_ABILITY_RULES, getTabletopBaseProfile,
} from './tabletop.js'

// A tabletop battle result, rewritten as the steps a person would count at the
// table: stats, then the damage they power, the chosen main faction, abilities,
// shields and finally the comparison. Presentation only; the scorer decides.

export const RESOLUTION_SIDES = ['player', 'opponent']

export function canAnimateTabletopResolution(result) {
  return Boolean(result?.mode === 'tabletop' && ['abilities-main', 'threshold'].includes(result.player?.rules)
    && result.player.rules === result.opponent?.rules)
}

function attackUnits(card) {
  return card.tabletopAttackUnits ?? card.effect?.dmg ?? 1
}

function emptyDamage() {
  return { critter: 0, robot: 0, dragon: 0, neutral: 0 }
}

function buildSide(hand, score, enemyHand) {
  const main = score.rules === 'abilities-main'
  const base = getTabletopBaseProfile(hand)

  // Stat pips, card by card and faction by faction.
  const stats = TABLETOP_CLASSES.map((type) => ({
    type,
    total: base.stats[type],
    cards: hand.filter((card) => card.type === 'stat' && card.stats?.includes(type))
      .map((card) => ({ uid: card.uid, count: card.stats.filter((stat) => stat === type).length })),
  }))

  // Typed attacks fire once per matching stat; each firing adds the card's hearts.
  const pulses = TABLETOP_CLASSES.map((type) => ({
    type,
    stats: base.stats[type],
    cards: hand.filter((card) => card.effect?.dmgType === type).map((card) => ({ uid: card.uid, units: attackUnits(card) })),
  }))
  const pulsed = new Set(pulses.flatMap((pulse) => pulse.cards.map((card) => card.uid)))
  // Everything else (Bite, shield power, stat products) lands as one value.
  const direct = base.attacks.filter((attack) => !pulsed.has(attack.uid))
    .map((attack) => ({ uid: attack.uid, type: attack.type ?? 'neutral', power: attack.power }))

  const baseDamage = emptyDamage()
  for (const type of TABLETOP_CLASSES) baseDamage[type] = base.contributions[type]
  baseDamage.neutral = base.neutral

  // Overwhelming: one extra Dragon stat re-powers Dragon attacks and stat products.
  let overwhelming = null
  if (main && score.overwhelming && MAIN_ABILITY_RULES.overwhelmingExtraStat) {
    const before = new Map(base.attacks.map((attack) => [attack.uid, attack.power]))
    const deltas = score.attacks.map((attack) => ({ uid: attack.uid, type: attack.type ?? 'neutral',
      delta: attack.power - (before.get(attack.uid) ?? 0) })).filter((entry) => entry.delta > 0)
    overwhelming = { at: MAIN_ABILITY_RULES.overwhelmingAt, power: base.base, extraStats: { dragon: 1 }, deltas,
      uids: [...new Set([...stats.flatMap((entry) => entry.cards.map((card) => card.uid)), ...base.attacks.map((attack) => attack.uid)])] }
  }

  // Perfect Balance: count Robot stat pips against Robot attack units.
  let balance = null
  if (main && score.balanced && score.damageType === 'robot' && score.bonus > 0) {
    balance = {
      count: score.robotAttacks,
      bonus: score.bonus,
      statPips: stats.find((entry) => entry.type === 'robot').cards,
      attackUnits: hand.filter((card) => card.effect?.dmgType === 'robot')
        .map((card) => ({ uid: card.uid, units: card.id === 'robot_ulti' ? ROBOT_ULTI_ATTACK_COUNT : 1 })),
    }
  }

  const costs = main ? MAIN_ABILITY_SHIELD_COST : TABLETOP_SHIELD_COST
  const shieldCards = enemyHand.filter((card) => card.effect?.shield > 0).map((card) => card.uid)
  const pointsByUid = Object.fromEntries(enemyHand.filter((card) => card.effect?.shield > 0)
    .map((card) => [card.uid, card.effect.shield]))
  const finalDamage = emptyDamage()
  for (const type of TABLETOP_CLASSES) finalDamage[type] = score.contributions[type]
  finalDamage.neutral = score.neutral

  return {
    rules: score.rules,
    mainType: score.damageType ?? null,
    winsTies: Boolean(score.winsTies),
    stats,
    pulses,
    direct,
    baseStats: { ...base.stats },
    baseDamage,
    base: base.base,
    overwhelming,
    balance,
    // Threshold rules add the faction bonus after shields; main rules add abilities before them.
    thresholdBonus: main ? 0 : score.bonus,
    shields: { cards: shieldCards, pointsByUid, cost: costs[score.damageType] ?? 0, penalty: score.shieldPenalty, blocked: score.blocked },
    final: {
      stats: { ...score.stats },
      damage: finalDamage,
      base: score.base,
      bonus: score.bonus,
      blocked: score.blocked,
      total: score.score,
    },
  }
}

export function buildTabletopResolutionPlan(result) {
  if (!canAnimateTabletopResolution(result)) return null
  return {
    rules: result.player.rules,
    bonusFirst: result.player.rules === 'abilities-main',
    player: buildSide(result.playerHand, result.player, result.opponentHand),
    opponent: buildSide(result.opponentHand, result.opponent, result.playerHand),
    winner: result.winner,
    tiebreak: result.reason === 'critter-tiebreak' ? result.winner : null,
  }
}

// What the ledger shows for one side before anything is counted, and when done.
export function emptyLedgerSide() {
  return {
    stats: { critter: 0, robot: 0, dragon: 0 },
    damage: emptyDamage(),
    main: false,
    base: null,
    bonus: 0,
    bonusShown: false,
    blocked: 0,
    shieldShown: false,
    total: null,
  }
}

export function finalLedgerSide(side) {
  return {
    stats: { ...side.final.stats },
    damage: { ...side.final.damage },
    main: Boolean(side.mainType),
    base: side.final.base,
    bonus: side.final.bonus,
    bonusShown: side.final.bonus > 0,
    blocked: side.final.blocked,
    shieldShown: side.shields.cards.length > 0,
    total: side.final.total,
  }
}
