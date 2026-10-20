// Testing tools: inspect every card in the current game and rearrange them.
// Pure helpers over a game (before battle-ready) or a preparation state.

export const GAME_ZONE_KEYS = ['playerHand', 'opponentHand', 'draftRow', 'deck', 'draftDiscard', 'playerDiscards', 'opponentDiscards']
export const PREPARATION_ZONE_KEYS = ['playerHand', 'opponentHand', 'deck', 'playerDiscard', 'opponentDiscard']

function withZone(card, key) {
  if (key === 'draftRow') return { ...card, draftAnimation: 'idle' }
  if (key === 'draftDiscard') return { ...card, draftAnimation: 'discarded' }
  return card
}

function findCard(container, keys, uid) {
  for (const key of keys) {
    const card = container[key]?.find((entry) => entry.uid === uid)
    if (card) return card
  }
  return null
}

// Exchange the positions of two cards wherever they appear (hand, pack, deck, discard).
export function swapTestCards(container, keys, uidA, uidB) {
  if (!uidA || !uidB || uidA === uidB) return container
  const cardA = findCard(container, keys, uidA)
  const cardB = findCard(container, keys, uidB)
  if (!cardA || !cardB) return container

  const next = { ...container }
  for (const key of keys) {
    const zone = container[key]
    if (!Array.isArray(zone)) continue
    if (!zone.some((card) => card.uid === uidA || card.uid === uidB)) continue
    next[key] = zone.map((card) => {
      if (card.uid === uidA) return withZone(cardB, key)
      if (card.uid === uidB) return withZone(cardA, key)
      return card
    })
  }
  return next
}

// Make a card the next draw. Deck cards move to the top; cards elsewhere trade
// places with the current top card, so every hand/pack keeps its size.
export function moveTestCardToTop(container, keys, uid) {
  const deck = container.deck ?? []
  const index = deck.findIndex((card) => card.uid === uid)
  if (index === 0) return container
  if (index > 0) {
    const nextDeck = [...deck]
    const [card] = nextDeck.splice(index, 1)
    return { ...container, deck: [card, ...nextDeck] }
  }
  if (!deck.length) return container
  return swapTestCards(container, keys, uid, deck[0].uid)
}

function uniqueByUid(...lists) {
  const seen = new Set()
  const result = []
  for (const card of lists.flat()) {
    if (!card || seen.has(card.uid)) continue
    seen.add(card.uid)
    result.push(card)
  }
  return result
}

// Zones shown in the test deck sheet, in table order.
export function getTestDeckZones({ game, preBattle, usePreparation }) {
  const source = usePreparation ? preBattle : game
  const discard = usePreparation
    ? uniqueByUid(preBattle.playerDiscard ?? [], preBattle.opponentDiscard ?? [])
    : uniqueByUid(game.draftDiscard ?? [], game.playerDiscards ?? [], game.opponentDiscards ?? [])

  return [
    { key: 'opponentHand', label: 'Opponent hand', cards: source.opponentHand ?? [] },
    !usePreparation && game.mode === 'draft' ? { key: 'draftRow', label: 'Pack', cards: game.draftRow ?? [] } : null,
    { key: 'playerHand', label: 'Your hand', cards: source.playerHand ?? [] },
    { key: 'deck', label: 'Deck · next draw first', cards: source.deck ?? [] },
    { key: 'discard', label: 'Discard', cards: discard },
  ].filter(Boolean)
}
