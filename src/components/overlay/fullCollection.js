import { expandCardPool, getCoreCards } from '../../game/cards.js'

export function getFullCollection() {
  const tabletop = 'abilities-new-cards'
  const definitions = new Map()
  for (const mode of ['draft', '6draft']) {
    for (const card of getCoreCards({ mode, tabletop, wildDeck: false })) {
      if (card.copies > (definitions.get(card.id)?.copies ?? 0)) definitions.set(card.id, card)
    }
  }
  return expandCardPool([...definitions.values()], { tabletop, wildDeck: false })
}
