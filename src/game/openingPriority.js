import opening from '../../data/draft-opening-priority.json' with { type: 'json' }

export const OPENING_PRIORITY_VERSION = opening.version
const scores = new Map(opening.cards.map(c => [c.card, c.score]))

// Shared opening component. Explicit historical Dan v6 keeps its original table.
export function chooseOpeningPriority(game, side = 'opponent') {
  if (game[`${side}Hand`]?.length !== 0 || !game.draftRow.length ||
      !game.draftRow.every(c => c.tabletop === 'abilities-main' && scores.has(c.id))) return null
  const values = game.draftRow.map(c => scores.get(c.id))
  const chosenIndex = values.indexOf(Math.max(...values))
  return { action: { type: 'draft-pick', uid: game.draftRow[chosenIndex].uid },
    values, chosenIndex, samples: 0, stage: 'opening-ranking',
    openingVersion: OPENING_PRIORITY_VERSION, labelSemantics: opening.semantics }
}
