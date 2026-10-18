import cardsData from '../data/cards.json' with { type: 'json' }
import { simulateBattle } from '../src/game/engine.js'
import { completeOpponentPreBattle, getActivatablePreBattleCards } from '../src/game/preBattle.js'

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

function runOpponentPreparationRegressions() {
  const cardsById = Object.fromEntries(cardsData.cards.map((card) => [card.id, card]))
  const card = (id, uid = id) => withUid(cardsById[id], uid)
  const prepare = (opponentHand, deck = [], opponentDiscard = []) => ({
    playerHand: [card('draw_2_extra', 'unused-player-draw')],
    playerActivated: [],
    playerDiscard: [],
    opponentHand,
    opponentActivated: [],
    opponentDiscard,
    deck,
  })
  const assertFinished = (result) => {
    assert(getActivatablePreBattleCards(result.opponentHand, result.opponentActivated).length === 0,
      'Battle must have no remaining AI preparation actions')
    assert(completeOpponentPreBattle(result) === result, 'Finished preparation must not run twice')
    assert(result.playerActivated.length === 0, 'Battle must still skip unused human specials')
  }

  const opening = prepare([card('draw_2_extra'), card('swarm')], [
    card('draw_2_extra', 'drawn-special'), card('critter1', 'first-stat'),
    card('robot1'), card('critter1', 'second-stat'),
  ])
  const before = JSON.stringify(opening)
  const drawn = completeOpponentPreBattle(opening)
  assertFinished(drawn)
  assert(JSON.stringify(opening) === before, 'Preparation must not mutate the existing session state')
  assert(drawn.deck.length === 0 && drawn.opponentHand.length === 6, 'Newly drawn specials must also resolve')
  assert(simulateBattle(drawn.playerHand, drawn.opponentHand).rounds[0].opponentRoundDamage === 2,
    'The first combat round must use the fully prepared AI hand')

  const copied = completeOpponentPreBattle(prepare([card('copy_card_in_hand'), card('draw_2_extra')], [
    card('critter1'), card('robot1'), card('dragon1'), card('robot2'),
  ]))
  assertFinished(copied)
  assert(copied.opponentHand.length === 6 && copied.deck.length === 0, 'Copied draw must activate independently')
  assert(copied.opponentHand.some((entry) => entry.isCopiedCard && copied.opponentActivated.includes(entry.uid)),
    'Fresh copied special identity must be tracked as activated')

  const redrawn = completeOpponentPreBattle(prepare([card('draw_all_new_1')], [
    card('draw_2_extra'), card('critter1'), card('swarm'), card('robot1'),
  ]))
  assertFinished(redrawn)
  assert(redrawn.opponentHand.length === 4 && redrawn.opponentDiscard[0].id === 'draw_all_new_1',
    'AI redraw and its newly acquired draw special must finish before Battle')

  const recycled = completeOpponentPreBattle(prepare([card('recycle_card')],
    [card('critter1'), card('swarm')], [card('draw_2_extra')]))
  assertFinished(recycled)
  assert(recycled.opponentHand.length === 4 && recycled.opponentDiscard.length === 0,
    'Recycled special must be removed from its pile and activated')

  for (const blocked of [prepare([card('recycle_card')]), prepare([card('copy_card_in_hand')])]) {
    const result = completeOpponentPreBattle(blocked)
    assertFinished(result)
    assert(result.opponentActivated.length === 1, 'Unusable specials must be skipped once without stalling')
  }

  const exhausted = completeOpponentPreBattle(prepare([card('draw_2_extra')]))
  assertFinished(exhausted)
  assert(exhausted.opponentHand.length === 1, 'An empty deck must finish preparation without inventing cards')
}

runDevourSimultaneousRoundRegression()
runOpponentPreparationRegressions()

console.log('regression smoke passed')
