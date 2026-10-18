import { applyCopySelection, getCopyTargetCandidates, pickAiCopyTarget } from './copyCard.js'
import { pickBestCardForHand } from './cardEvaluator.js'

export const PRE_BATTLE_CARD_IDS = new Set([
  'draw_2_extra',
  'draw_all_new_1',
  'copy_card_in_hand',
  'recycle_card',
])

function drawCards(deck, count) {
  return {
    drawn: deck.slice(0, count),
    rest: deck.slice(count),
  }
}

export function isPreBattleActivatableCard(card) {
  if (!card) return false
  return PRE_BATTLE_CARD_IDS.has(card.id)
}

export function getActivatablePreBattleCards(hand = [], activatedCardUids = []) {
  const activatedSet = new Set(activatedCardUids)
  return hand.filter((card) => isPreBattleActivatableCard(card) && !activatedSet.has(card.uid))
}

export function getPreBattleCopyCandidates(hand = [], sourceUid = null) {
  return getCopyTargetCandidates(hand).filter((card) => card.uid !== sourceUid)
}

// Resolve privately at the Battle boundary, including specials acquired along the way.
export function completeOpponentPreBattle(preBattle) {
  let current = preBattle
  let card = getActivatablePreBattleCards(current.opponentHand, current.opponentActivated)[0]

  while (card) {
    const activated = [...current.opponentActivated, card.uid]

    if (card.id === 'recycle_card') {
      const discard = current.opponentDiscard ?? []
      const recycled = pickBestCardForHand(discard, current.opponentHand) ?? discard[0]
      current = {
        ...current,
        opponentHand: recycled ? [...current.opponentHand, recycled] : current.opponentHand,
        opponentDiscard: recycled ? discard.filter((entry) => entry.uid !== recycled.uid) : discard,
        opponentActivated: activated,
      }
    } else {
      const candidates = getPreBattleCopyCandidates(current.opponentHand, card.uid)
      const target = card.id === 'copy_card_in_hand'
        ? pickBestCardForHand(candidates, current.opponentHand.filter((entry) => entry.uid !== card.uid))
        : null
      const result = resolvePreBattleActivation({
        hand: current.opponentHand,
        deck: current.deck,
        discard: current.opponentDiscard,
        cardUid: card.uid,
        selectionUid: target?.uid ?? null,
      })
      current = {
        ...current,
        opponentHand: result.hand,
        deck: result.deck,
        opponentDiscard: result.discard,
        opponentActivated: activated,
      }
    }

    // Empty recycle piles and copy hands without a target are skipped once.
    card = getActivatablePreBattleCards(current.opponentHand, current.opponentActivated)[0]
  }

  return current
}

export function resolvePreBattleActivation({
  hand = [],
  deck = [],
  cardUid,
  selectionUid = null,
  discard = [],
}) {
  const card = hand.find((entry) => entry.uid === cardUid)
  if (!card) {
    return {
      hand,
      deck,
      discard,
      activated: null,
    }
  }

  if (card.id === 'draw_2_extra') {
    const drawResult = drawCards(deck, 2)
    return {
      hand: [...hand, ...drawResult.drawn],
      deck: drawResult.rest,
      discard,
      activated: {
        uid: card.uid,
        id: card.id,
        name: card.name,
        drawnCards: drawResult.drawn,
        count: drawResult.drawn.length,
      },
    }
  }

  if (card.id === 'draw_all_new_1') {
    const nextDiscard = [...discard, ...hand]
    const drawResult = drawCards(deck, hand.length + 1)

    return {
      hand: drawResult.drawn,
      deck: drawResult.rest,
      discard: nextDiscard,
      activated: {
        uid: card.uid,
        id: card.id,
        name: card.name,
        discardedCards: hand,
        drawnCards: drawResult.drawn,
        count: drawResult.drawn.length,
      },
    }
  }

  if (card.id === 'copy_card_in_hand') {
    if (!selectionUid) {
      return {
        hand,
        deck,
        discard,
        activated: {
          uid: card.uid,
          id: card.id,
          name: card.name,
          armed: true,
        },
      }
    }

    const targetUid = selectionUid ?? pickAiCopyTarget(hand)?.uid ?? null
    const resolvedHand = applyCopySelection(hand, cardUid, targetUid)

    return {
      hand: resolvedHand,
      deck,
      discard,
      activated: {
        uid: card.uid,
        id: card.id,
        name: card.name,
        targetUid,
      },
    }
  }

  if (card.id === 'recycle_card') {
    return {
      hand,
      deck,
      discard,
      activated: {
        uid: card.uid,
        id: card.id,
        name: card.name,
        recycle: true,
      },
    }
  }

  return {
    hand,
    deck,
    discard,
    activated: null,
  }
}
