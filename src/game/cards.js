import cardsData from '../../data/cards.json' with { type: 'json' }
import tabletopCardsData from '../../data/tabletop-cards.json' with { type: 'json' }
import monsterCardsData from '../../data/monster-cards.json' with { type: 'json' }
import { monsterCopies, MIN_MONSTER_DECK } from './monsters.js'
import newCardsData from '../../data/new-cards.json' with { type: 'json' }
import { toTabletopCard, normalizeTabletopRules, isCardInTabletopRules } from './tabletop.js'

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

// options.tabletop: false (digital), 'abilities-main' (also true / 'abilities'),
// 'threshold', or explicit hidden 'abilities-prototype'.
const NC_COPY_ADJUSTMENTS = { swarm: 1, dragons_breath: -1, dragon1: -1, robot_attack: 1 }

export function getCoreCards(options = {}) {
  const core = cardsData.cards.filter((card) => CORE_CARD_IDS.has(card.id))
  const rules = normalizeTabletopRules(options.tabletop)
  if (!rules) return core
  return [...core, ...tabletopCardsData.cards, ...(['abilities-new-cards', 'monsters'].includes(rules) ? newCardsData.cards : []), ...(rules === 'monsters' ? monsterCardsData.cards : [])]
    .filter((card) => (!card.disabled || (rules === 'monsters' && options.includeDisabled)) && isCardInTabletopRules(card, rules))
    .map((card) => ['abilities-new-cards', 'monsters'].includes(rules)
      ? { ...card, copies: card.copies + (NC_COPY_ADJUSTMENTS[card.id] ?? 0) }
      : card)
}

function getExpandedCopies(card, wildDeck = false) {
  if (!wildDeck) return card.copies
  if (card.copies > 1) return card.copies
  return 3
}

export function expandCardPool(cards, options = {}) {
  const { wildDeck = false } = options

  return cards.flatMap((card) =>
    Array.from({ length: options.tabletop === 'monsters' ? monsterCopies(card, options) : getExpandedCopies(card, wildDeck) }, (_, index) => ({
      ...(options.tabletop ? toTabletopCard(card, options.tabletop) : card),
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
  return expandCardPool(getCoreCards({ ...options, includeDisabled: options.tabletop === 'monsters' }), options)
}

export function buildShuffledDeck(options = {}) {
  const rng = typeof options.rng === 'function'
    ? options.rng
    : (options.seed !== undefined ? createSeededRng(options.seed) : Math.random)

  const deck = getExpandedCoreDeck(options)
  if (options.tabletop === 'monsters' && deck.length < MIN_MONSTER_DECK) throw new Error(`Monsters needs at least ${MIN_MONSTER_DECK} cards`)
  return shuffle(deck, { rng })
}
