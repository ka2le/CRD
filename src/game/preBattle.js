// Compatibility surface for UI/effect consumers. Policies use the same decisions as training.
export {
  PRE_BATTLE_CARD_IDS,
  isPreBattleActivatableCard,
  getActivatablePreBattleCards,
  getPreBattleCopyCandidates,
  resolvePreBattleActivation,
} from './preBattleEffects.js'
import { getActivatablePreBattleCards } from './preBattleEffects.js'
import { applyPreparationAction, getPreparationActions } from './preparationState.js'
import { pickBestCardForHand } from './cardEvaluator.js'

export function pickPreparationAction(state, side = 'opponent') {
  const actions = getPreparationActions(state, side)
  const source = getActivatablePreBattleCards(state[`${side}Hand`], state[`${side}Activated`])[0]
  if (!source) return actions.find((action) => action.type === 'finish-preparation')
  const candidates = actions.filter((action) => action.type === 'prepare' && action.sourceUid === source.uid)
  if (!candidates.length) return actions.find((action) => action.type === 'skip-preparation' && action.sourceUid === source.uid)
  if (!candidates[0].targetUid) return candidates[0]
  const hand = state[`${side}Hand`]
  const targets = source.id === 'recycle_card' ? state[`${side}Discard`] : hand
  const eligible = targets.filter((card) => candidates.some((action) => action.targetUid === card.uid))
  const target = pickBestCardForHand(eligible, source.id === 'copy_card_in_hand'
    ? hand.filter((card) => card.uid !== source.uid) : hand)
  return candidates.find((action) => action.targetUid === target?.uid) ?? candidates[0]
}

// Browser baseline only: training can select each action itself instead.
export function completeOpponentPreBattle(preBattle) {
  let current = preBattle
  while (getActivatablePreBattleCards(current.opponentHand, current.opponentActivated).length) {
    current = applyPreparationAction(current, 'opponent', pickPreparationAction(current, 'opponent'))
  }
  return current
}
