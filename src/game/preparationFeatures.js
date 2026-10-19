import { getCoreCards } from './cards.js'
import { applyCopySelection } from './copyCard.js'
import { combatFeatures } from './headlessGame.js'
import { getActivatablePreBattleCards } from './preBattleEffects.js'

export const PREPARATION_FEATURES_VERSION = 'prep-afterstate-v1'

// Stateless afterstate description for each legal preparation action, computed ONLY from the
// acting seat's observation (own hand, own recycle pile, activated sources). Draws are not
// resolved: their unknown cards are left out and only the deterministic part is described.
export function describePreparationActions(observation, legalActions) {
  if (observation?.phase !== 'preparation' || observation.actor !== observation.side) {
    throw new Error('Preparation features need the acting seat\'s preparation observation')
  }
  const definitions = new Map(getCoreCards().map((card) => [card.id, card]))
  const restore = (card) => {
    const definition = definitions.get(card.id)
    if (!definition) throw new Error(`Unsupported observed card ${card.id}`)
    return { ...definition, uid: card.uid, imageIndex: 0 }
  }
  const hand = observation.playerHand.map(restore)
  const pile = observation.recycleCards.map(restore)
  const activated = observation.activatedUids ?? []
  return legalActions.map((action) => {
    let afterHand = hand
    let afterPile = pile
    let afterActivated = activated
    let pendingDraws = 0
    let replacesHand = false
    if (action.type === 'prepare' || action.type === 'skip-preparation') afterActivated = [...activated, action.sourceUid]
    if (action.type === 'prepare') {
      if (action.cardId === 'copy_card_in_hand') afterHand = applyCopySelection(hand, action.sourceUid, action.targetUid)
      else if (action.cardId === 'recycle_card') {
        afterHand = [...hand, pile.find((card) => card.uid === action.targetUid)]
        afterPile = pile.filter((card) => card.uid !== action.targetUid)
      } else if (action.cardId === 'draw_2_extra') pendingDraws = 2
      else if (action.cardId === 'draw_all_new_1') {
        pendingDraws = hand.length + 1
        replacesHand = true
        afterPile = [...pile, ...hand]
        afterHand = []
      }
    }
    const remaining = action.type === 'finish-preparation' ? [] : getActivatablePreBattleCards(afterHand, afterActivated)
    return {
      handIds: afterHand.map((card) => card.id),
      pileIds: afterPile.map((card) => card.id),
      remainingIds: remaining.map((card) => card.id),
      pendingDraws, replacesHand,
      combat: combatFeatures(afterHand),
    }
  })
}
