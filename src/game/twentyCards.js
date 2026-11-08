import { buildShuffledDeck } from './cards.js'
import { pickBestCardForHand } from './cardEvaluator.js'

export const emptyLineup = () => Array(15).fill(null)

export function createTwentyCardsGame(options = {}) {
  const deck = options.deck ? [...options.deck] : buildShuffledDeck(options)
  if (deck.length < 40) throw new Error('20Cards needs at least 40 cards')
  return { mode: '20cards', phase: 'lineup', deck: deck.slice(40),
    playerPool: deck.slice(0, 20), opponentPool: deck.slice(20, 40),
    playerLineup: emptyLineup(), opponentLineup: emptyLineup(),
    playerLocked: false, opponentLocked: false, playerHand: [], opponentHand: [],
    playerDiscards: [], opponentDiscards: [], roundIndex: 0, roundResults: [], recentMoves: [] }
}

export function placeLineupCard(game, side, uid, slot) {
  if (game.phase !== 'lineup' || game[`${side}Locked`] || !Number.isInteger(slot) || slot < -1 || slot >= 15) return game
  if (!game[`${side}Pool`].some(card => card.uid === uid)) return game
  const lineup = [...game[`${side}Lineup`]]
  const from = lineup.indexOf(uid)
  if (slot === -1) { if (from < 0) return game; lineup[from] = null }
  else {
    if (from >= 0) lineup[from] = lineup[slot]
    lineup[slot] = uid
  }
  return { ...game, [`${side}Lineup`]: lineup }
}

export function chooseBotLineup(pool) {
  let remaining = [...pool]
  const result = []
  for (let lane = 0; lane < 3; lane += 1) {
    const hand = []
    for (let slot = 0; slot < 5; slot += 1) {
      const card = pickBestCardForHand(remaining, hand)
      hand.push(card); result.push(card.uid)
      remaining = remaining.filter(entry => entry.uid !== card.uid)
    }
  }
  return result
}

export function beginTwentyCardsRound(game, deck = game.deck) {
  const handFor = side => game[`${side}Lineup`].slice(game.roundIndex * 5, game.roundIndex * 5 + 5)
    .map(uid => game[`${side}Pool`].find(card => card.uid === uid))
  return { ...game, phase: 'battle-ready', deck, playerHand: handFor('player'), opponentHand: handFor('opponent'),
    playerDiscards: [], opponentDiscards: [] }
}

export function lockLineup(game, side) {
  if (game.phase !== 'lineup' || game[`${side}Locked`]) return game
  const lineup = game[`${side}Lineup`]
  if (lineup.length !== 15 || new Set(lineup).size !== 15 || lineup.some(uid => !game[`${side}Pool`].some(card => card.uid === uid))) return game
  const next = { ...game, [`${side}Locked`]: true }
  return next.playerLocked && next.opponentLocked ? beginTwentyCardsRound(next) : next
}

export function twentyCardsScore(results) {
  const player = results.filter(winner => winner === 'player').length
  const opponent = results.filter(winner => winner === 'opponent').length
  const complete = player >= 2 || opponent >= 2 || results.length >= 3
  return { player, opponent, complete, winner: complete ? player >= 2 ? 'player' : opponent >= 2 ? 'opponent' : 'tie' : null }
}
