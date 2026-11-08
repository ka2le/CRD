import { MONSTER_FACTIONS } from './monsters.js'
import { isMainAbilityRules } from './tabletop.js'
import {
  TABLETOP_CLASSES, MAIN_ABILITY_SHIELD_COST, TABLETOP_SHIELD_COST, ROBOT_ULTI_ATTACK_COUNT,
  MAIN_ABILITY_RULES, getTabletopBaseProfile,
} from './tabletop.js'

// A tabletop battle result, rewritten as the steps a person would count at the
// table: stats, then the damage they power, the chosen main faction, abilities,
// shields and finally the comparison. Presentation only; the scorer decides.

export const RESOLUTION_SIDES = ['player', 'opponent']

function resolutionRules(result) {
  if (result?.mode !== 'tabletop') return null
  // An emptied hand has no card carrying its rules and the scorer defaults to
  // main Abilities. Count its zeros alongside the surviving hand's rules.
  const rules = result.playerHand?.length === 0 ? result.opponent?.rules : result.player?.rules
  if (!['abilities-main', 'abilities-new-cards', 'monsters', 'threshold'].includes(rules)) return null
  return RESOLUTION_SIDES.every(side => result[side]?.rules === rules || result[`${side}Hand`]?.length === 0) ? rules : null
}

export function canAnimateTabletopResolution(result) {
  return Boolean(resolutionRules(result))
}

function attackUnits(card) {
  if (card.id === 'single_faction_2') return 2
  return card.tabletopAttackUnits ?? card.effect?.dmg ?? 1
}

function isTypedAttack(card, type, profile) {
  return card.effect?.dmgType === type || (card.id === 'single_faction_2'
    && profile.attacks.some((attack) => attack.uid === card.uid && attack.type === type))
}

function emptyDamage() {
  return { critter: 0, robot: 0, dragon: 0, neutral: 0 }
}

function buildSide(hand, score, enemyHand) {
  const main = isMainAbilityRules(score.rules)
  const base = getTabletopBaseProfile(hand)
  const classes = score.rules === 'monsters' ? MONSTER_FACTIONS : TABLETOP_CLASSES

  // Stat pips, card by card and faction by faction.
  const stats = classes.map((type) => ({
    type,
    total: base.stats[type] ?? 0,
    cards: hand.filter((card) => card.type === 'stat' && card.stats?.includes(type))
      .map((card) => ({ uid: card.uid, count: card.stats.filter((stat) => stat === type).length }))
      .concat(hand.some((card) => card.type === 'stat') || type === 'monster' || !hand.some((card) => card.id === 'no_stats_to_2' && ['abilities-new-cards', 'monsters'].includes(card.tabletop)) ? []
        : [{ uid: hand.find((card) => card.id === 'no_stats_to_2').uid, count: 2 }]),
  }))

  // Typed attacks fire once per matching stat; each firing adds the card's hearts.
  const pulses = classes.map((type) => ({
    type,
    stats: base.stats[type] ?? 0,
    cards: hand.filter((card) => isTypedAttack(card, type, base)).map((card) => ({ uid: card.uid, units: attackUnits(card) })),
  }))
  const pulsed = new Set(pulses.flatMap((pulse) => pulse.cards.map((card) => card.uid)))
  // Everything else (Bite, shield power, stat products) lands as one value.
  const direct = base.attacks.filter((attack) => !pulsed.has(attack.uid))
    .map((attack) => ({ uid: attack.uid, type: attack.type ?? 'neutral', power: attack.power }))

  const baseDamage = emptyDamage()
  for (const type of classes) baseDamage[type] = base.contributions[type] ?? 0
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
      attackUnits: hand.filter((card) => isTypedAttack(card, 'robot', base))
        .map((card) => ({ uid: card.uid, units: card.id === 'robot_ulti' ? ROBOT_ULTI_ATTACK_COUNT : attackUnits(card) })),
    }
  }

  const costs = main ? MAIN_ABILITY_SHIELD_COST : TABLETOP_SHIELD_COST
  const shieldCards = enemyHand.filter((card) => card.effect?.shield > 0).map((card) => card.uid)
  const pointsByUid = Object.fromEntries(enemyHand.filter((card) => card.effect?.shield > 0)
    .map((card) => [card.uid, card.effect.shield]))
  const finalDamage = emptyDamage()
  for (const type of classes) finalDamage[type] = score.contributions[type] ?? 0
  finalDamage.neutral = score.neutral

  return {
    rules: score.rules,
    mainType: score.damageType ?? null,
    winsTies: Boolean(score.winsTies),
    stats,
    pulses,
    direct,
    baseStats: Object.fromEntries(classes.map(type => [type, base.stats[type] ?? 0])),
    baseDamage,
    base: base.base,
    overwhelming,
    balance,
    // Threshold rules add the faction bonus after shields; main rules add abilities before them.
    thresholdBonus: main ? 0 : score.bonus,
    shields: { cards: shieldCards, pointsByUid, cost: score.damageType === 'monster' ? 1 : (costs[score.damageType] ?? 0), penalty: score.shieldPenalty, blocked: score.blocked },
    final: {
      stats: Object.fromEntries(classes.map(type => [type, score.stats[type] ?? 0])),
      damage: finalDamage,
      base: score.base,
      bonus: score.bonus,
      blocked: score.blocked,
      total: score.score,
    },
  }
}

export function buildTabletopResolutionPlan(result) {
  const rules = resolutionRules(result)
  if (!rules) return null
  return {
    rules,
    bonusFirst: isMainAbilityRules(rules),
    player: buildSide(result.playerHand, { ...result.player, rules }, result.opponentHand),
    opponent: buildSide(result.opponentHand, { ...result.opponent, rules }, result.playerHand),
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
