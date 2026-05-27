import cardsData from '../data/cards.json' with { type: 'json' }
import { simulateBattle } from '../src/game/engine.js'

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function withUid(card, uid) {
  return {
    ...card,
    uid,
  }
}

function runDevourSimultaneousRoundRegression() {
  const cardsById = Object.fromEntries(cardsData.cards.map((card) => [card.id, card]))

  const playerHand = [
    withUid(cardsById.dragon1, 'dragon1-regression'),
    withUid(cardsById.devour, 'devour-regression'),
  ]

  const opponentHand = [
    {
      id: 'lethal_round_four_regression',
      uid: 'lethal-round-four-regression',
      name: 'Lethal Round Four Regression',
      type: 'action',
      stats: [],
      effect: { dmg: 21 },
      cd: 4,
    },
  ]

  const result = simulateBattle(playerHand, opponentHand)
  const round4 = result.rounds.find((round) => round.round === 4)

  assert(round4, 'Expected battle to resolve through round 4')
  assert(round4.playerRoundDamage === 7, `Expected Devour to deal 7 on round 4, got ${round4.playerRoundDamage}`)
  assert(round4.opponentRoundDamage === 21, `Expected opponent lethal damage to resolve on round 4, got ${round4.opponentRoundDamage}`)
  assert(result.playerTotalDamageDealt === 7, `Expected Devour damage in player total, got ${result.playerTotalDamageDealt}`)
  assert(result.opponentTotalDamageDealt === 21, `Expected opponent total damage to be 21, got ${result.opponentTotalDamageDealt}`)
}

runDevourSimultaneousRoundRegression()

console.log('regression smoke passed')
