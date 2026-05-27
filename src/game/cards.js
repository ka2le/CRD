import cardsData from '../../data/cards.json' with { type: 'json' }

export const CORE_CARD_IDS = new Set([
  'critter1',
  'swarm',
  'robot1',
  'robot_attack',
  'dragon1',
  'dragons_breath',
  'robot_critter',
  'robot_dragon',
  'dragon_rabbit',
  'rabbit2',
  'robot2',
  'dragon2',
  'joker',
  'shield2',
  'draw_2_extra',
  'draw_all_new_1',
  'copy_card_in_hand',
  'recycle_card',
  'bite',
  'murder_rabbit',
  'robot_ulti',
  'dragon_ulti',
  'devour',
  'double_dmg',
  'shield_is_dmg',
  'one_off_each',
  'any_off_each',
])

export function getCoreCards() {
  return cardsData.cards.filter((card) => CORE_CARD_IDS.has(card.id))
}

function getExpandedCopies(card, wildDeck = false) {
  if (!wildDeck) return card.copies
  if (card.copies > 1) return card.copies
  return 3
}

export function expandCardPool(cards, options = {}) {
  const { wildDeck = false } = options

  return cards.flatMap((card) =>
    Array.from({ length: getExpandedCopies(card, wildDeck) }, (_, index) => ({
      ...card,
      uid: `${card.id}__${index + 1}`,
      imageIndex: index % Math.max(card.images?.length ?? 1, 1),
    })),
  )
}

export function createSeededRng(seed = 1) {
  let state = Number.isFinite(seed) ? seed >>> 0 : 1
  if (state === 0) state = 1

  return function seededRng() {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

export function shuffle(array, options = {}) {
  const { rng = Math.random } = options
  const copy = [...array]

  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }

  return copy
}

export function getExpandedCoreDeck(options = {}) {
  return expandCardPool(getCoreCards(), options)
}

export function buildShuffledDeck(options = {}) {
  const rng = typeof options.rng === 'function'
    ? options.rng
    : (options.seed !== undefined ? createSeededRng(options.seed) : Math.random)

  return shuffle(getExpandedCoreDeck(options), { rng })
}
