import { getExpandedCoreDeck } from './cards.js'
import { chooseTabletopType, getTabletopProfile } from './tabletop.js'

const SCENARIOS = {
  plain: {
    player: ['dragon2', 'dragons_breath', 'robot1', 'critter1', 'recycle_card'],
    opponent: ['robot2', 'robot_attack', 'dragon1', 'critter1', 'copy_card_in_hand'],
  },
  bonuses: {
    player: ['dragon2', 'dragon2', 'dragons_breath', 'dragons_breath', 'critter1'],
    opponent: ['robot2', 'robot1', 'robot_attack', 'robot_attack', 'critter1'],
  },
  shields: {
    player: ['rabbit2', 'critter1', 'swarm', 'swarm', 'shield2'],
    opponent: ['robot2', 'robot1', 'robot_attack', 'robot_attack', 'shield2'],
  },
  tie: {
    player: ['robot_dragon', 'robot_attack', 'dragons_breath', 'shield2', 'critter1'],
    opponent: ['rabbit2', 'swarm', 'shield2', 'dragon1', 'robot1'],
  },
  preparation: {
    player: ['draw_2_extra', 'copy_card_in_hand', 'dragon2', 'dragons_breath', 'recycle_card'],
    opponent: ['robot1', 'robot_attack', 'shield2', 'critter1', 'dragon1'],
  },
}

export const DEV_SCENARIO_NAMES = Object.keys(SCENARIOS)

// Deterministic real card instances, using the actual deck and normal reducer.
export function createDevScenario({ name = 'bonuses', mode = 'draft', result = false, playerType = null,
  playerCards, opponentCards } = {}) {
  const preset = SCENARIOS[name]
  if (!preset) throw new Error(`Unknown scenario: ${name}. Choose ${DEV_SCENARIO_NAMES.join(', ')}`)
  const gameMode = mode === 'discard' ? 'five-hand-discard' : mode
  if (!['draft', 'five-hand-discard'].includes(gameMode)) throw new Error(`Unknown game mode: ${mode}`)
  const deck = getExpandedCoreDeck({ wildDeck: true, tabletop: true })
  function take(id) {
    const index = deck.findIndex((card) => card.id === id)
    if (index < 0) throw new Error(`Card unavailable in scenario deck: ${id}`)
    return deck.splice(index, 1)[0]
  }
  const playerHand = (playerCards ?? preset.player).map(take)
  const opponentHand = (opponentCards ?? preset.opponent).map(take)
  if (playerType && !getTabletopProfile(playerHand).types.includes(playerType)) {
    throw new Error(`Invalid main damage type for this scenario: ${playerType}`)
  }
  return {
    game: {
      mode: gameMode, phase: 'battle-ready', devScenario: name,
      playerHand, opponentHand, deck,
      draftRow: [], draftDiscard: [], playerDiscards: [], opponentDiscards: [],
      packNumber: 5, picksThisPack: 2, currentPicker: null, firstPicker: 'player', pendingOpponentPickUid: null,
      playerDiscardsUsed: 2, opponentDiscardsUsed: 2, recentMoves: [],
    },
    result,
    playerType: playerType ?? (result ? chooseTabletopType(playerHand) : null),
  }
}
