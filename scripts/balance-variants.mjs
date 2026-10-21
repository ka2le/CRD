// Study-only process configuration. Never imported by the browser.
// Apply exactly once before constructing/scoring hands (profiles are cached).
import { TABLETOP_THRESHOLDS, FLEXIBLE_RULES, TABLETOP_V2_SHIELD_COST as TABLETOP_SHIELD_COST } from '../src/game/tabletop.js'
import { simulateBattle } from '../src/game/engine.js'

export const BALANCE_VARIANTS = {
  battle: { rules: false, title: 'Battle' },
  threshold: { rules: 'threshold', title: 'Original Threshold +1/+2/+4', thresholds: { critter: { at: 1, bonus: 1 }, robot: { at: 4, bonus: 2 }, dragon: { at: 7, bonus: 4 } } },
  'threshold-tuned': { rules: 'threshold', title: 'Threshold +2/+3/+4', thresholds: { critter: { at: 1, bonus: 2 }, robot: { at: 4, bonus: 3 }, dragon: { at: 7, bonus: 4 } } },
  'threshold-distinct8': { rules: 'threshold', title: 'Threshold 2/3/4 at 1/4/8', thresholds: { critter: { at: 1, bonus: 2 }, robot: { at: 4, bonus: 3 }, dragon: { at: 8, bonus: 4 } } },
  'threshold-distinct9': { rules: 'threshold', title: 'Threshold 2/3/4 at 1/4/9', thresholds: { critter: { at: 1, bonus: 2 }, robot: { at: 4, bonus: 3 }, dragon: { at: 9, bonus: 4 } } },
  'threshold-later8': { rules: 'threshold', title: 'Threshold 2/3/4 at 1/5/8', thresholds: { critter: { at: 1, bonus: 2 }, robot: { at: 5, bonus: 3 }, dragon: { at: 8, bonus: 4 } } },
  'threshold-later9': { rules: 'threshold', title: 'Threshold 2/3/4 at 1/5/9', thresholds: { critter: { at: 1, bonus: 2 }, robot: { at: 5, bonus: 3 }, dragon: { at: 9, bonus: 4 } } },
  'threshold-balanced': { rules: 'threshold', title: 'Threshold 2/2/3 at 1/4/7', thresholds: { critter: { at: 1, bonus: 2 }, robot: { at: 4, bonus: 2 }, dragon: { at: 7, bonus: 3 } } },
  'threshold-balanced-robot3': { rules: 'threshold', title: 'Threshold 2/2/3 at 1/3/7', thresholds: { critter: { at: 1, bonus: 2 }, robot: { at: 3, bonus: 2 }, dragon: { at: 7, bonus: 3 } } },
  'threshold-balanced-dragon8': { rules: 'threshold', title: 'Threshold 2/2/4 at 1/4/8', thresholds: { critter: { at: 1, bonus: 2 }, robot: { at: 4, bonus: 2 }, dragon: { at: 8, bonus: 4 } } },
  abilitiesv2: { rules: 'abilitiesv2', title: 'V2: 7+ → +4', flexible: { overwhelmingAt: 7, overwhelmingBonus: 4, overwhelmingExtraStat: false, unlimitedBaseReconfigure: false, robotPipReconfigure: false } },
  'abilitiesv2-extra-stat': { rules: 'abilitiesv2', title: 'V2: 7+ → +1 Dragon stat', flexible: { overwhelmingAt: 7, overwhelmingBonus: 0, overwhelmingExtraStat: true, unlimitedBaseReconfigure: false, robotPipReconfigure: false } },
  'abilitiesv2-extra-stat6': { rules: 'abilitiesv2', title: 'V2: 6+ → +1 Dragon stat', flexible: { overwhelmingAt: 6, overwhelmingBonus: 0, overwhelmingExtraStat: true, unlimitedBaseReconfigure: false, robotPipReconfigure: false } },
  'abilitiesv2-tuned': { rules: 'abilitiesv2', title: 'V2: 8+ → +3', flexible: { overwhelmingAt: 8, overwhelmingBonus: 3, overwhelmingExtraStat: false, unlimitedBaseReconfigure: false, robotPipReconfigure: false } },
  'abilitiesv2-base-unlimited': { rules: 'abilitiesv2', title: 'V2: Dragon 6+ extra stat, unlimited base Robot conversions', flexible: { overwhelmingAt: 6, overwhelmingBonus: 0, overwhelmingExtraStat: true, unlimitedBaseReconfigure: true, robotPipReconfigure: false } },
  'abilitiesv2-robot-pips': { rules: 'abilitiesv2', title: 'V2: Robot-main pip/ultimate Reconfigure', flexible: { overwhelmingAt: 6, overwhelmingBonus: 0, overwhelmingExtraStat: true, unlimitedBaseReconfigure: false, robotPipReconfigure: true, overwhelmingAfterShields: false, perfectBalance: false } },
  'abilitiesv2-perfect-balance': { rules: 'abilitiesv2', title: 'V2: Perfect Balance replaces Reconfigure', shieldCosts: { critter: 2, robot: 1, dragon: 0 }, flexible: { overwhelmingAt: 6, overwhelmingBonus: 0, overwhelmingExtraStat: true, unlimitedBaseReconfigure: false, robotPipReconfigure: false, overwhelmingAfterShields: false, perfectBalance: true } },
  'abilitiesv2-perfect-balance-shields220': { rules: 'abilitiesv2', title: 'V2: Perfect Balance; shields 2/2/0', shieldCosts: { critter: 2, robot: 2, dragon: 0 }, flexible: { overwhelmingAt: 6, overwhelmingBonus: 0, overwhelmingExtraStat: true, unlimitedBaseReconfigure: false, robotPipReconfigure: false, overwhelmingAfterShields: false, perfectBalance: true } },
  'abilitiesv2-perfect-balance-shields221': { rules: 'abilitiesv2', title: 'V2: Perfect Balance; shields 2/2/1', shieldCosts: { critter: 2, robot: 2, dragon: 1 }, flexible: { overwhelmingAt: 6, overwhelmingBonus: 0, overwhelmingExtraStat: true, unlimitedBaseReconfigure: false, robotPipReconfigure: false, overwhelmingAfterShields: false, perfectBalance: true } },
  'abilitiesv2-robot-immune': { rules: 'abilitiesv2', title: 'V2: Robot shield immunity; Dragon 6+ extra stat', shieldCosts: { critter: 2, robot: 0, dragon: 0 }, flexible: { overwhelmingAt: 6, overwhelmingBonus: 0, overwhelmingExtraStat: true, unlimitedBaseReconfigure: false, robotPipReconfigure: true, overwhelmingAfterShields: false } },
  'abilitiesv2-dragon-shield': { rules: 'abilitiesv2', title: 'V2: Robot immunity; Dragon -1/shield then 7+ gives +4', shieldCosts: { critter: 2, robot: 0, dragon: 1 }, flexible: { overwhelmingAt: 7, overwhelmingBonus: 4, overwhelmingExtraStat: false, unlimitedBaseReconfigure: false, robotPipReconfigure: true, overwhelmingAfterShields: true } },
  abilities: { rules: 'abilities', title: 'Abilities v1 (not in current study)' },
}
let configured = false
export function configureBalanceVariant(name) {
  if (configured) throw new Error('One variant per process; cached scoring profiles must not cross configurations')
  const variant = BALANCE_VARIANTS[name]
  if (!variant) throw new Error(`Unknown balance variant: ${name}`)
  configured = true
  if (variant.thresholds) for (const [faction, values] of Object.entries(variant.thresholds)) Object.assign(TABLETOP_THRESHOLDS[faction], values)
  if (variant.flexible) Object.assign(FLEXIBLE_RULES, { overwhelmingAfterShields: false, perfectBalance: false }, variant.flexible)
  Object.assign(TABLETOP_SHIELD_COST, { critter: 2, robot: 1, dragon: 0 }, variant.shieldCosts)
  return { ...variant, name }
}

// Battle has no chosen main faction. Classify by pre-shield typed damage over
// one full 12-round CD cycle, independent of the opponent or actual fight length.
// One of Each is assigned to Robot to match the tabletop analysis convention.
// Equal typed contributions remain 'mixed'; neutral-only hands stay 'neutral'.
export function battleAnalysisProfile(hand) {
  const cycle = simulateBattle(hand, [], { maxRounds: 12, damageToWin: Number.MAX_SAFE_INTEGER })
  const contributions = { critter: 0, robot: 0, dragon: 0 }
  let neutral = 0
  for (const round of cycle.rounds) {
    const multiplier = 2 ** round.playerBursts.filter((b) => b.id === 'double_dmg').length
    for (const burst of round.playerBursts) {
      const type = burst.damageType ?? (burst.id === 'one_off_each' ? 'robot' : null)
      if (type in contributions) contributions[type] += burst.damage * multiplier / 12
      else neutral += burst.damage * multiplier / 12
    }
  }
  const peak = Math.max(...Object.values(contributions))
  const dominantTypes = Object.keys(contributions).filter((type) => peak > 0 && Math.abs(contributions[type] - peak) < 1e-9)
  const damageType = dominantTypes.length === 1 ? dominantTypes[0] : dominantTypes.length ? 'mixed' : neutral > 0 ? 'neutral' : null
  return { stats: cycle.playerStats, contributions, neutral, dominantTypes, damageType, rules: 'battle',
    base: Object.values(contributions).reduce((a, b) => a + b, neutral) }
}
