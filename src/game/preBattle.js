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
import { evaluateTabletopHand } from './tabletopAi.js'

export function pickPreparationAction(state, side = 'opponent') {
  const actions = getPreparationActions(state, side)
  if (state[`${side}PendingDiscard`]) {
    const value = (action) => {
      const next = applyPreparationAction(state, side, action)
      const activated = new Set(next[`${side}Activated`])
      // Spent specials carry no future preparation value.
      const hand = next[`${side}Hand`].map((card) => activated.has(card.uid)
        && ['monster_draw_discard', 'monster_transform', 'draw_2_extra', 'draw_2_discard_2', 'recycle_card', 'draw_all_new_1'].includes(card.id)
        ? { ...card, id: 'spent_special' } : card)
      let score = evaluateTabletopHand(hand)
      // Recognize the multi-discard path to a statless engine.
      if (hand.some((card) => card.id === 'no_stats_to_2') && hand.some((card) => card.type === 'stat')) {
        const stats = hand.filter((card) => card.type === 'stat')
        const pending = next[`${side}PendingDiscard`]
        if (pending && (pending.remaining === null || pending.remaining >= stats.length)) {
          const without = hand.filter((card) => card.type !== 'stat').map((card) =>
            card.uid === pending.sourceUid && pending.cardId === 'discard_for_damage'
              ? { ...card, sacrificedPower: (card.sacrificedPower ?? 0) + stats.length } : card)
          score = Math.max(score, evaluateTabletopHand(without))
        }
      }
      return score
    }
    const ordered = [...actions].sort((a, b) => Number(b.type === 'finish-preparation-discard') - Number(a.type === 'finish-preparation-discard'))
    return ordered.reduce((best, action) => value(action) > value(best) ? action : best)
  }
  const source = getActivatablePreBattleCards(state[`${side}Hand`], state[`${side}Activated`])[0]
  if (!source) return actions.find((action) => action.type === 'finish-preparation')
  const candidates = actions.filter((action) => action.type === 'prepare' && action.sourceUid === source.uid)
  if (!candidates.length) return actions.find((action) => action.type === 'skip-preparation' && action.sourceUid === source.uid)
  if (source.id === 'monster_transform') return candidates.reduce((best, action) =>
    evaluateTabletopHand(applyPreparationAction(state, side, action)[`${side}Hand`]) >
    evaluateTabletopHand(applyPreparationAction(state, side, best)[`${side}Hand`]) ? action : best)
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
  while (!current.opponentFinished && (current.opponentPendingDiscard || getActivatablePreBattleCards(current.opponentHand, current.opponentActivated).length)) {
    current = applyPreparationAction(current, 'opponent', pickPreparationAction(current, 'opponent'))
  }
  return current
}
