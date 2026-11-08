export const MONSTERS_RULES_VERSION = 'monsters-v1'
export const MONSTER_FACTIONS = ['critter', 'robot', 'dragon', 'monster']
export const MONSTER_TRANSFORM_TARGETS = ['critter', 'robot', 'dragon']
export const MONSTER_PRODUCTS = {
  monster_critter_dmg: 'critter', monster_robot_dmg: 'robot', monster_dragon_dmg: 'dragon',
}
export const MONSTER_HAND_SIZE = 6
export const MONSTER_PACK_SIZE = 6
export const startingHandSize = rules => rules === 'monsters' ? MONSTER_HAND_SIZE : 5
export const MIN_MONSTER_DECK = MONSTER_HAND_SIZE * MONSTER_PACK_SIZE
export const MAX_MONSTER_COPIES = 30

// Overrides are physical counts, including in Wild. Zero explicitly disables a card.
export function monsterCopies(card, { wildDeck = false, monsterDeck = {} } = {}) {
  const value = monsterDeck?.[card.id]
  if (Number.isInteger(value) && value >= 0 && value <= MAX_MONSTER_COPIES) return value
  if (card.disabled) return 0
  return wildDeck && card.copies === 1 ? 3 : card.copies
}

export function normalizeMonsterDeck(value, definitions) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(definitions.filter(card => Number.isInteger(value[card.id])
    && value[card.id] >= 0 && value[card.id] <= MAX_MONSTER_COPIES)
    .map(card => [card.id, value[card.id]]))
}

export function monsterDeckRecipe(definitions, options = {}) {
  const counts = Object.fromEntries(definitions.map(card => [card.id, monsterCopies(card, options)])
    .sort(([a], [b]) => a.localeCompare(b)))
  const canonical = JSON.stringify([MONSTERS_RULES_VERSION, MONSTER_HAND_SIZE, MONSTER_PACK_SIZE, counts])
  let hash = 2166136261
  for (let index = 0; index < canonical.length; index++) hash = Math.imul(hash ^ canonical.charCodeAt(index), 16777619) >>> 0
  return { rulesVersion: MONSTERS_RULES_VERSION, tabletop: 'monsters',
    recipeId: `M1-${hash.toString(16).padStart(8, '0')}`, total: Object.values(counts).reduce((a, b) => a + b, 0),
    handSize: MONSTER_HAND_SIZE, packSize: MONSTER_PACK_SIZE,
    wildDeck: Boolean(options.wildDeck), monsterDeck: counts }
}
