import { buildShuffledDeck } from './cards.js'
import { chooseDiscardIds } from './cardEvaluator.js'

function drawCards(deck, count) {
  return {
    drawn: deck.slice(0, count),
    rest: deck.slice(count),
  }
}

function applyDiscardSelection(hand, deck, selectedIds) {
  const selected = new Set(selectedIds)
  const refillCount = selectedIds.length
  const refill = drawCards(deck, refillCount)
  let refillIndex = 0

  const nextHand = hand.map((card) => {
    if (!selected.has(card.uid)) return card

    const replacement = refill.drawn[refillIndex]
    refillIndex += 1
    return replacement ?? card
  })

  const discarded = hand.filter((card) => selected.has(card.uid))

  return {
    hand: nextHand,
    deck: refill.rest,
    discarded,
  }
}

function resolveOpponentDiscardPass(game, options = {}) {
  const {
    opponentDiscardStrategy = chooseDiscardIds,
    opponentDiscardCount = 2,
  } = options
  const discardIds = opponentDiscardStrategy(game.opponentHand, { discardCount: opponentDiscardCount, game })
  const debugEntry = {
    pass: (game.opponentDiscardsUsed ?? 0) + 1,
    handBefore: game.opponentHand.map((card) => card.id),
    discardIds,
    discardCards: game.opponentHand.filter((card) => discardIds.includes(card.uid)).map((card) => card.id),
  }

  if (!discardIds.length) {
    return {
      hand: game.opponentHand,
      deck: game.deck,
      discarded: [],
      debugEntry,
    }
  }

  const result = applyDiscardSelection(game.opponentHand, game.deck, discardIds)

  return {
    hand: result.hand,
    deck: result.deck,
    discarded: result.discarded,
    debugEntry: {
      ...debugEntry,
      handAfter: result.hand.map((card) => card.id),
    },
  }
}

export function createFiveHandDiscardGame(options = {}) {
  const deck = options.deck ? [...options.deck] : buildShuffledDeck(options)

  const playerStart = drawCards(deck, 5)
  const afterPlayer = playerStart.rest
  const opponentStart = drawCards(afterPlayer, 5)

  return {
    mode: 'five-hand-discard',
    phase: 'player-discard-1',
    deck: opponentStart.rest,
    playerHand: playerStart.drawn,
    opponentHand: opponentStart.drawn,
    playerDiscardsUsed: 0,
    playerDiscards: [],
    opponentDiscardsUsed: 0,
    opponentDiscards: [],
    opponentDebug: {
      openingHand: opponentStart.drawn.map((card) => card.id),
      passes: [],
      finalHand: opponentStart.drawn.map((card) => card.id),
      totalDiscards: 0,
    },
    recentMoves: [],
  }
}

export function applyDiscardPhase(game, selectedIds, options = {}) {
  const {
    includeRecentMoves = true,
    opponentDiscardStrategy = chooseDiscardIds,
    opponentDiscardCount = 2,
  } = options
  const selected = new Set(selectedIds)
  const refillCount = selectedIds.length
  const refill = drawCards(game.deck, refillCount)
  let refillIndex = 0
  const moves = []
  const opponentMoves = []

  const nextPlayerHand = game.playerHand.map((card) => {
    if (!selected.has(card.uid)) return card

    moves.push({
      kind: 'card-move',
      card,
      from: { section: 'player-hand', slot: card.uid },
      to: { section: 'player-discard', slot: 'default' },
      face: 'up',
      durationMs: 180,
      delayMs: moves.length * 55,
      rotateDeg: 8,
    })

    const replacement = refill.drawn[refillIndex]
    refillIndex += 1

    if (replacement) {
      moves.push({
        kind: 'card-move',
        card: replacement,
        from: { section: 'draw-deck', slot: 'default' },
        to: { section: 'player-hand', slot: replacement.uid },
        face: 'down',
        durationMs: 220,
        delayMs: 90 + ((refillIndex - 1) * 70),
      })
    }

    return replacement ?? card
  })

  const playerDiscarded = game.playerHand.filter((card) => selected.has(card.uid))

  const afterPlayerGame = {
    ...game,
    deck: refill.rest,
    playerHand: nextPlayerHand,
    playerDiscards: [...game.playerDiscards, ...playerDiscarded],
  }

  const opponentResult = resolveOpponentDiscardPass(afterPlayerGame, {
    opponentDiscardStrategy,
    opponentDiscardCount,
  })
  opponentResult.discarded.forEach((card, index) => {
    opponentMoves.push({
      kind: 'card-move',
      card,
      from: { section: 'opponent-hand', slot: card.uid },
      to: { section: 'player-discard', slot: 'default' },
      face: 'up',
      durationMs: 180,
      delayMs: index * 55,
      rotateDeg: -8,
    })
  })

  const nextDiscardsUsed = game.playerDiscardsUsed + 1
  const nextOpponentDiscardsUsed = (game.opponentDiscardsUsed ?? 0) + 1
  const isDone = nextDiscardsUsed >= 2
  const nextOpponentDebug = {
    ...(game.opponentDebug ?? { openingHand: game.opponentHand.map((card) => card.id), passes: [] }),
    passes: [...(game.opponentDebug?.passes ?? []), opponentResult.debugEntry],
    finalHand: opponentResult.hand.map((card) => card.id),
    totalDiscards: [...game.opponentDiscards, ...opponentResult.discarded].length,
  }

  return {
    ...afterPlayerGame,
    deck: opponentResult.deck,
    opponentHand: opponentResult.hand,
    playerDiscards: [...afterPlayerGame.playerDiscards, ...opponentResult.discarded],
    opponentDiscards: [...game.opponentDiscards, ...opponentResult.discarded],
    opponentDiscardsUsed: nextOpponentDiscardsUsed,
    opponentDebug: nextOpponentDebug,
    playerDiscardsUsed: nextDiscardsUsed,
    phase: isDone ? 'battle-ready' : `player-discard-${nextDiscardsUsed + 1}`,
    recentMoves: includeRecentMoves ? [...moves, ...opponentMoves] : [],
  }
}
