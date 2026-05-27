import { buildShuffledDeck } from './cards.js'
import { pickDraftCard } from './draftAi.js'

function drawCards(deck, count) {
  return {
    drawn: deck.slice(0, count),
    rest: deck.slice(count),
  }
}

function getNextFirstPicker(currentFirstPicker) {
  return currentFirstPicker === 'player' ? 'opponent' : 'player'
}

function withDraftAnimation(card, draftAnimation = 'idle') {
  return {
    ...card,
    draftAnimation,
  }
}

function markCards(cards, draftAnimation = 'idle') {
  return cards.map((card) => withDraftAnimation(card, draftAnimation))
}

function clearRowAnimation(cards) {
  return cards.map((card) => withDraftAnimation(card, 'idle'))
}

function getRecentMoves(includeRecentMoves, moves) {
  return includeRecentMoves ? moves : []
}

function finalizeIfDraftComplete(game) {
  if (game.playerHand.length >= 5 && game.opponentHand.length >= 5) {
    return {
      ...game,
      phase: 'battle-ready',
      currentPicker: null,
      pendingOpponentPickUid: null,
      draftRow: [],
    }
  }

  return null
}

export function createDraftGame({
  firstPicker = 'player',
  wildDeck = false,
  seed,
  rng,
  deck: providedDeck = null,
  opponentStrategy = null,
  includeRecentMoves = true,
  openingDraftAnimation = 'idle',
} = {}) {
  const deck = providedDeck ? [...providedDeck] : buildShuffledDeck({ wildDeck, seed, rng })
  const openingDraw = drawCards(deck, 5)
  const openingRow = markCards(openingDraw.drawn, openingDraftAnimation)
  const pendingOpponentPickUid = firstPicker === 'opponent'
    ? (pickDraftCard(openingRow, { hand: [], strategy: opponentStrategy })?.uid ?? null)
    : null
  const openingMoves = openingRow.map((card, index) => ({
    kind: 'card-move',
    card,
    from: { section: 'draft-deck', slot: 'default' },
    to: { section: 'draft-row', slot: card.uid },
    face: 'down',
    durationMs: 200,
    delayMs: index * 150,
  }))

  return {
    mode: 'draft',
    phase: firstPicker === 'opponent' ? 'draft-opponent-thinking' : 'draft-player-pick',
    deck: openingDraw.rest,
    draftRow: openingRow,
    draftDiscard: [],
    playerHand: [],
    opponentHand: [],
    firstPicker,
    currentPicker: firstPicker,
    pendingOpponentPickUid,
    picksThisPack: 0,
    packNumber: 1,
    recentMoves: getRecentMoves(includeRecentMoves, openingMoves),
  }
}

export function applyDraftPick(game, pickedCardUid, options = {}) {
  const {
    opponentStrategy = null,
    includeRecentMoves = true,
  } = options

  if (game.phase !== 'draft-player-pick') return game
  if (game.currentPicker !== 'player') return game
  if (game.playerHand.length >= 5) return game

  const pickedCard = game.draftRow.find((card) => card.uid === pickedCardUid)
  if (!pickedCard) return game

  const remainingRow = game.draftRow.filter((card) => card.uid !== pickedCardUid)
  const recentMoves = [{
    kind: 'card-move',
    card: pickedCard,
    from: { section: 'draft-row', slot: pickedCard.uid },
    to: { section: 'player-hand', slot: pickedCard.uid },
    face: 'up',
    durationMs: 220,
  }]
  const nextGame = {
    ...game,
    draftRow: clearRowAnimation(remainingRow),
    playerHand: [...game.playerHand, withDraftAnimation(pickedCard, 'picked')],
    picksThisPack: game.picksThisPack + 1,
    pendingOpponentPickUid: null,
    recentMoves: getRecentMoves(includeRecentMoves, recentMoves),
  }

  const completed = finalizeIfDraftComplete(nextGame)
  if (completed) return completed

  if (nextGame.picksThisPack >= 2) {
    return {
      ...nextGame,
      currentPicker: null,
      phase: 'draft-pack-clearing',
    }
  }

  const opponentPick = pickDraftCard(remainingRow, { hand: nextGame.opponentHand, strategy: opponentStrategy })
  return {
    ...nextGame,
    currentPicker: 'opponent',
    phase: 'draft-opponent-thinking',
    pendingOpponentPickUid: opponentPick?.uid ?? null,
  }
}

export function resolveOpponentDraftPick(game, options = {}) {
  const {
    opponentStrategy = null,
    includeRecentMoves = true,
  } = options

  if (game.phase !== 'draft-opponent-thinking') return game
  if (game.currentPicker !== 'opponent') return game
  if (game.opponentHand.length >= 5) return game

  const opponentPick = game.draftRow.find((card) => card.uid === game.pendingOpponentPickUid)
  if (!opponentPick) {
    const fallbackPick = pickDraftCard(game.draftRow, { hand: game.opponentHand, strategy: opponentStrategy })
    if (!fallbackPick) {
      return {
        ...game,
        phase: 'draft-pack-clearing',
        currentPicker: null,
        pendingOpponentPickUid: null,
      }
    }

    return resolveOpponentDraftPick({
      ...game,
      pendingOpponentPickUid: fallbackPick.uid,
    }, options)
  }

  const remainingRow = game.draftRow.filter((card) => card.uid !== opponentPick.uid)
  const recentMoves = [{
    kind: 'card-move',
    card: opponentPick,
    from: { section: 'draft-row', slot: opponentPick.uid },
    to: { section: 'opponent-hand', slot: opponentPick.uid },
    face: 'up',
    durationMs: 220,
  }]
  const nextGame = {
    ...game,
    draftRow: clearRowAnimation(remainingRow),
    opponentHand: [...game.opponentHand, withDraftAnimation(opponentPick, 'picked')],
    picksThisPack: game.picksThisPack + 1,
    pendingOpponentPickUid: null,
    recentMoves: getRecentMoves(includeRecentMoves, recentMoves),
  }

  const completed = finalizeIfDraftComplete(nextGame)
  if (completed) return completed

  if (nextGame.picksThisPack >= 2) {
    return {
      ...nextGame,
      currentPicker: null,
      phase: 'draft-pack-clearing',
    }
  }

  return {
    ...nextGame,
    currentPicker: 'player',
    phase: 'draft-player-pick',
  }
}

export function commitDraftDiscard(game, options = {}) {
  const { includeRecentMoves = true } = options

  if (game.phase !== 'draft-pack-clearing') return game
  const recentMoves = game.draftRow.map((card, index) => ({
    kind: 'card-move',
    card,
    from: { section: 'draft-row', slot: card.uid },
    to: { section: 'draft-discard', slot: 'default' },
    face: 'up',
    durationMs: 180,
    delayMs: index * 60,
    rotateDeg: 10,
  }))

  return {
    ...game,
    phase: 'draft-pack-dealing',
    draftDiscard: [...game.draftDiscard, ...markCards(game.draftRow, 'discarded')],
    draftRow: [],
    recentMoves: getRecentMoves(includeRecentMoves, recentMoves),
  }
}

export function revealNextDraftPack(game, options = {}) {
  const {
    opponentStrategy = null,
    includeRecentMoves = true,
    draftAnimation = 'dealing',
  } = options

  if (game.phase !== 'draft-pack-dealing') return game

  const nextFirstPicker = getNextFirstPicker(game.firstPicker)
  const nextPackDraw = drawCards(game.deck, 5)
  const nextRow = markCards(nextPackDraw.drawn, draftAnimation)
  const pendingOpponentPickUid = nextFirstPicker === 'opponent'
    ? (pickDraftCard(nextRow, { hand: game.opponentHand, strategy: opponentStrategy })?.uid ?? null)
    : null
  const recentMoves = nextRow.map((card, index) => ({
    kind: 'card-move',
    card,
    from: { section: 'draft-deck', slot: 'default' },
    to: { section: 'draft-row', slot: card.uid },
    face: 'down',
    durationMs: 200,
    delayMs: index * 150,
  }))

  return {
    ...game,
    phase: nextFirstPicker === 'opponent' ? 'draft-opponent-thinking' : 'draft-player-pick',
    deck: nextPackDraw.rest,
    draftRow: nextRow,
    firstPicker: nextFirstPicker,
    currentPicker: nextFirstPicker,
    picksThisPack: 0,
    packNumber: game.packNumber + 1,
    pendingOpponentPickUid,
    recentMoves: getRecentMoves(includeRecentMoves, recentMoves),
  }
}
