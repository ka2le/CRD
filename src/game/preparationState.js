import {
  getActivatablePreBattleCards,
  getPreBattleCopyCandidates,
  resolvePreBattleActivation,
} from './preBattleEffects.js'

export function createPreparationState(game) {
  const draftDiscard = game.draftDiscard ?? []
  return {
    playerHand: [...game.playerHand],
    opponentHand: [...game.opponentHand],
    deck: [...(game.deck ?? [])],
    // Preserve the browser's existing per-side pool semantics.
    playerDiscard: [...(game.playerDiscards ?? draftDiscard)],
    opponentDiscard: [...(game.opponentDiscards ?? draftDiscard)],
    playerActivated: [],
    opponentActivated: [],
    playerPendingDiscard: null,
    opponentPendingDiscard: null,
    playerFinished: false,
    opponentFinished: false,
    playerDrawnCount: 0,
    opponentDrawnCount: 0,
  }
}

function assertSide(side) {
  if (side !== 'player' && side !== 'opponent') throw new Error(`Unknown preparation side ${side}`)
}

// Source and target are one decision. Opening/cancelling a UI picker is presentation only.
export function getPreparationActions(state, side = 'player') {
  assertSide(side)
  if (state[`${side}Finished`]) return []
  const hand = state[`${side}Hand`]
  const pending = state[`${side}PendingDiscard`]
  if (pending) {
    const base = { sourceUid: pending.sourceUid, cardId: pending.cardId }
    return [
      ...hand.map((card) => ({ type: 'discard-preparation', ...base, targetUid: card.uid })),
      ...(pending.remaining === null ? [{ type: 'finish-preparation-discard', ...base }] : []),
    ]
  }
  const discard = state[`${side}Discard`] ?? []
  const actions = []
  for (const card of getActivatablePreBattleCards(hand, state[`${side}Activated`])) {
    const base = { type: 'prepare', sourceUid: card.uid, cardId: card.id }
    if (card.id === 'copy_card_in_hand') {
      for (const target of getPreBattleCopyCandidates(hand, card.uid)) {
        actions.push({ ...base, targetUid: target.uid })
      }
    } else if (card.id === 'recycle_card') {
      for (const target of discard) actions.push({ ...base, targetUid: target.uid })
    } else {
      actions.push(base)
    }
    actions.push({ type: 'skip-preparation', sourceUid: card.uid, cardId: card.id })
  }
  actions.push({ type: 'finish-preparation' })
  return actions
}

export function applyPreparationAction(state, side, action) {
  const legal = getPreparationActions(state, side).find((candidate) => (
    candidate.type === action?.type
    && candidate.sourceUid === action.sourceUid
    && candidate.targetUid === action.targetUid
    && (action.cardId === undefined || candidate.cardId === action.cardId)
  ))
  if (!legal) throw new Error(`Illegal preparation action for ${side}`)
  if (legal.type === 'finish-preparation') return { ...state, [`${side}Finished`]: true }

  const handKey = `${side}Hand`
  const discardKey = `${side}Discard`
  const pendingKey = `${side}PendingDiscard`
  if (legal.type === 'finish-preparation-discard') return { ...state, [pendingKey]: null }
  if (legal.type === 'discard-preparation') {
    const pending = state[pendingKey]
    const target = state[handKey].find((card) => card.uid === legal.targetUid)
    const remaining = pending.remaining === null ? null : pending.remaining - 1
    const hand = state[handKey].filter((card) => card.uid !== target.uid).map((card) => (
      card.uid === pending.sourceUid && pending.cardId === 'discard_for_damage'
        ? { ...card, sacrificedPower: (card.sacrificedPower ?? 0) + 1 } : card
    ))
    return { ...state, [handKey]: hand, [discardKey]: [...state[discardKey], target],
      [pendingKey]: remaining === 0 || (pending.cardId === 'discard_for_damage' && target.uid === pending.sourceUid)
        ? null : { ...pending, remaining } }
  }
  const activatedKey = `${side}Activated`
  const activated = [...(state[activatedKey] ?? []), legal.sourceUid]
  if (legal.type === 'skip-preparation') return { ...state, [activatedKey]: activated }

  if (legal.cardId === 'draw_2_discard_2' || legal.cardId === 'discard_for_damage') {
    const drawing = legal.cardId === 'draw_2_discard_2'
    const drawn = drawing ? state.deck.slice(0, 2) : []
    const hand = [...state[handKey], ...drawn]
    const remaining = drawing ? Math.min(2, hand.length) : null
    return { ...state, [handKey]: hand, [activatedKey]: activated,
      deck: state.deck.slice(drawn.length),
      [`${side}DrawnCount`]: (state[`${side}DrawnCount`] ?? 0) + drawn.length,
      [pendingKey]: remaining === 0 ? null : { sourceUid: legal.sourceUid, cardId: legal.cardId, remaining } }
  }

  let result
  if (legal.cardId === 'recycle_card') {
    const target = state[discardKey].find((card) => card.uid === legal.targetUid)
    result = {
      hand: [...state[handKey], target],
      deck: state.deck,
      discard: state[discardKey].filter((card) => card.uid !== target.uid),
    }
  } else {
    result = resolvePreBattleActivation({
      hand: state[handKey],
      discard: state[discardKey],
      deck: state.deck,
      cardUid: legal.sourceUid,
      selectionUid: legal.targetUid,
    })
  }
  return {
    ...state,
    [handKey]: result.hand,
    [discardKey]: result.discard,
    [activatedKey]: activated,
    [`${side}DrawnCount`]: (state[`${side}DrawnCount`] ?? 0) + state.deck.length - result.deck.length,
    deck: result.deck,
  }
}
