import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { getCoreCards, getExpandedCoreDeck } from '../src/game/cards.js'
import { getTabletopBonus, getTabletopProfile, getTabletopChoice, getCardTabletopTypes,
  scoreTabletopHand, resolveTabletopBattle, toTabletopCard, chooseTabletopType } from '../src/game/tabletop.js'
import { createPreparationState } from '../src/game/preparationState.js'
import { createDraftGame, applyDraftPick, resolveOpponentDraftPick, commitDraftDiscard, revealNextDraftPack } from '../src/game/draftMode.js'
import { createFiveHandDiscardGame, applyDiscardPhase } from '../src/game/fiveHandDiscard.js'
import { searchDecision } from '../src/game/searchAi.js'
import { pickBestCardForHand, getHandAverageDamage } from '../src/game/cardEvaluator.js'
import { createDevScenario, DEV_SCENARIO_NAMES } from '../src/game/devScenarios.js'

const definitions = new Map(getCoreCards().map((card) => [card.id, card]))
let serial = 0
const card = (id) => toTabletopCard({ ...definitions.get(id), uid: `${id}-test-${++serial}` })
const hand = (...ids) => ids.map(card)

test('tabletop decks preserve identities/copy counts; ordinary attacks are 2 with no cooldown', () => {
  for (const wildDeck of [false, true]) {
    const digital = getExpandedCoreDeck({ wildDeck })
    const tabletop = getExpandedCoreDeck({ wildDeck, tabletop: true })
    assert.equal(tabletop.length, wildDeck ? 102 : 70)
    assert.deepEqual(tabletop.map((entry) => entry.uid), digital.map((entry) => entry.uid))
    for (const entry of tabletop) assert.equal(entry.cd, 0)
    for (const id of ['swarm', 'robot_attack', 'dragons_breath']) {
      assert.equal(tabletop.find((entry) => entry.id === id).effect.dmg, 2)
    }
    assert.equal(digital.find((entry) => entry.id === 'dragons_breath').effect.dmg, 3)
    assert.equal(digital.find((entry) => entry.id === 'dragons_breath').cd, 3)
  }
})

test('power multiplies matching stats by every attack; class is based on power rather than stat count', () => {
  const robots = hand('robot1', 'robot2', 'robot_attack', 'robot_attack')
  assert.equal(getTabletopProfile(robots).base, 12)
  assert.equal(scoreTabletopHand(robots).score, 15)
  assert.equal(getHandAverageDamage(robots), 12)
  const mixed = hand('rabbit2', 'robot1', 'robot_attack', 'robot_attack', 'robot_attack')
  assert.deepEqual(getTabletopProfile(mixed).types, ['robot'])
  assert.equal(getTabletopProfile(hand('critter1')).base, 0)
})

test('cumulative bonus boundaries include zero and exact thresholds', () => {
  const boundaries = { critter: [[0, 0], [1, 1], [14, 1]], robot: [[6, 0], [7, 2], [10, 2], [11, 3]], dragon: [[10, 0], [11, 4], [13, 4], [14, 6]] }
  for (const [type, cases] of Object.entries(boundaries)) {
    for (const [power, expected] of cases) assert.equal(getTabletopBonus(type, power), expected)
  }
})

test('shields apply by attacking class before bonuses and cannot create negative power', () => {
  const robots = hand('robot1', 'robot2', 'robot_attack', 'robot_attack')
  const robotScore = scoreTabletopHand(robots, 3)
  assert.deepEqual([robotScore.base, robotScore.blocked, robotScore.power, robotScore.bonus, robotScore.score], [12, 3, 9, 2, 11])
  const critters = scoreTabletopHand(hand('critter1', 'swarm'), 4)
  assert.deepEqual([critters.shieldPenalty, critters.blocked, critters.power, critters.bonus, critters.score], [8, 2, 0, 0, 0])
  assert.equal(scoreTabletopHand(hand('dragon1', 'dragons_breath'), 20).score, 2)
  assert.equal(getTabletopProfile(hand('shield2', 'shield2')).shields, 2)
})

test('scores decide wins/ties with no rounds; zero and neutral-only hands are defined', () => {
  const robots = hand('robot1', 'robot2', 'robot_attack', 'robot_attack')
  const dragons = hand('dragon1', 'dragon1', 'dragon1', 'dragons_breath', 'dragons_breath', 'bite')
  assert.equal(resolveTabletopBattle(robots, dragons).winner, 'opponent')
  const elevenDragonPower = hand('joker', 'dragon2', 'dragons_breath', 'one_off_each', 'bite')
  const example = resolveTabletopBattle(robots, elevenDragonPower)
  assert.deepEqual([example.player.base, example.player.score, example.opponent.base, example.opponent.score, example.winner], [12, 15, 11, 15, 'tie'])
  assert.equal(resolveTabletopBattle(robots, robots).winner, 'tie')
  assert.equal(resolveTabletopBattle([], []).winner, 'tie')
  assert.deepEqual(resolveTabletopBattle([], []).rounds, [])
  assert.deepEqual(getTabletopProfile(hand('bite')).types, ['robot'])
  assert.equal(scoreTabletopHand(hand('bite'), 1).score, 1)
})

test('ties require a valid choice and multi-stat cards expose all eligible tied types', () => {
  const tied = hand('robot_dragon', 'robot_attack', 'dragons_breath')
  const profile = getTabletopProfile(tied)
  assert.deepEqual(profile.types, ['robot', 'dragon'])
  assert.deepEqual(getCardTabletopTypes(tied[0], profile), ['robot', 'dragon'])
  assert.throws(() => resolveTabletopBattle(tied, []), /Choose/)
  assert.throws(() => resolveTabletopBattle(tied, [], { playerType: 'critter' }), /Invalid/)
  assert.equal(resolveTabletopBattle(tied, [], { playerType: 'dragon' }).player.damageType, 'dragon')
  assert.equal(chooseTabletopType(tied), 'dragon')
  const neutralWithDevour = hand('bite', 'devour')
  assert.deepEqual(getCardTabletopTypes(neutralWithDevour[0], getTabletopProfile(neutralWithDevour)), ['robot'])
})

test('integer specials, stacked Punches and Devour produce reproducible power', () => {
  for (const [stat, attack] of [['rabbit2', 'murder_rabbit'], ['robot2', 'robot_ulti'], ['dragon2', 'dragon_ulti'], ['dragon2', 'devour']]) {
    const ultimate = card(attack)
    assert.equal(ultimate.effect.dmg, 4)
    assert.equal(getTabletopProfile([card(stat), ultimate]).base, 8)
  }
  assert.equal(getTabletopProfile(hand('robot1', 'robot_attack', 'critter1', 'swarm', 'bite', 'double_dmg')).base, 10)
  assert.equal(getTabletopProfile(hand('robot1', 'robot_attack', 'critter1', 'swarm', 'bite', 'double_dmg', 'double_dmg')).base, 16)
  assert.equal(getTabletopProfile(hand('swarm', 'double_dmg')).base, 0)
  assert.equal(getTabletopProfile(hand('shield2', 'shield2', 'shield_is_dmg')).base, 2)
  assert.equal(getTabletopProfile(hand('joker', 'one_off_each', 'any_off_each')).base, 4)
  const devour = getTabletopProfile(hand('rabbit2', 'swarm', 'dragon1', 'devour'))
  assert.equal(devour.base, 8)
  assert.deepEqual(devour.types, ['critter', 'dragon'])
})

test('both building modes keep tabletop cards through completion; AI values matching engines', () => {
  let draft = createDraftGame({ tabletop: true, seed: 7 })
  while (draft.phase !== 'battle-ready') {
    if (draft.phase === 'draft-player-pick') draft = applyDraftPick(draft, draft.draftRow[0].uid)
    else if (draft.phase === 'draft-opponent-thinking') draft = resolveOpponentDraftPick(draft)
    else if (draft.phase === 'draft-pack-clearing') draft = commitDraftDiscard(draft)
    else draft = revealNextDraftPack(draft)
  }
  let discard = createFiveHandDiscardGame({ tabletop: true, seed: 7 })
  discard = applyDiscardPhase(discard, [])
  discard = applyDiscardPhase(discard, [])
  for (const game of [draft, discard]) {
    assert.equal(game.phase, 'battle-ready')
    assert(game.playerHand.every((entry) => entry.tabletop))
    assert(game.opponentHand.every((entry) => entry.tabletop))
  }
  const attack = card('dragons_breath')
  assert.equal(pickBestCardForHand([card('robot_attack'), attack], hand('dragon2')).uid, attack.uid)
})

test('browser search supports tabletop draft/discard and stays independent of hidden deck order', () => {
  const options = { minSamples: 2, maxSamples: 2, timeBudgetMs: 1e9, seed: 51 }
  const draft = createDraftGame({ tabletop: true, seed: 71, firstPicker: 'opponent' })
  const a = searchDecision(draft, 'opponent', options)
  assert(draft.draftRow.some((entry) => entry.uid === a.action.uid))
  assert.deepEqual(searchDecision({ ...draft, deck: [...draft.deck].reverse() }, 'opponent', options).values, a.values)
  const discard = applyDiscardPhase(createFiveHandDiscardGame({ tabletop: true, seed: 71 }), [], { deferOpponent: true })
  const b = searchDecision(discard, 'opponent', options)
  assert(b.action.selectedIds.every((uid) => discard.opponentHand.some((entry) => entry.uid === uid)))
})

test('session gates type choice, invalidates it after hand changes, preserves private AI prep and resets mode', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  try {
    const { sessionReducer } = await server.ssrLoadModule('/src/hooks/useGameSession.js')
    for (const name of DEV_SCENARIO_NAMES) {
      for (const mode of ['draft', 'discard']) {
        const initial = { settings: {}, battleInstance: 0, gameSessionKey: 0, dealId: 0 }
        const prepared = sessionReducer(initial, { type: 'LOAD_DEV_SCENARIO', payload: createDevScenario({ name, mode }) })
        assert.equal(prepared.game.phase, 'battle-ready')
        assert.equal(prepared.battleStarted, false)
        const result = sessionReducer(initial, { type: 'LOAD_DEV_SCENARIO', payload: createDevScenario({ name, mode, result: true }) })
        assert.equal(result.battleStarted, true)
        assert.equal(result.preBattle.opponentFinished, true)
        assert.doesNotThrow(() => resolveTabletopBattle(result.preBattle.playerHand, result.preBattle.opponentHand, {
          playerType: getTabletopChoice(result.preBattle).selectedType,
        }))
        const physicalIds = [...result.game.playerHand, ...result.game.opponentHand, ...result.game.deck].map((entry) => entry.uid)
        assert.equal(new Set(physicalIds).size, 102)
      }
    }
    assert.throws(() => createDevScenario({ name: 'tie', playerType: 'critter' }), /Invalid main damage type/)
    assert.throws(() => createDevScenario({ playerCards: ['not-a-card'] }), /Card unavailable/)
    for (const mode of ['draft', 'five-hand-discard']) {
      const playerHand = hand('robot_dragon', 'robot_attack', 'dragons_breath', 'copy_card_in_hand')
      const opponentHand = hand('draw_2_extra', 'robot1')
      const game = { mode, phase: 'battle-ready', playerHand, opponentHand, deck: hand('robot_attack', 'robot1'), playerDiscards: [], opponentDiscards: [] }
      let state = { game, settings: { tabletop: true, wildDeck: true, opponentAi: 'rules', gameMode: mode }, gameMode: mode,
        preBattle: createPreparationState(game), battleStarted: false, battleInstance: 0, gameSessionKey: 0, dealId: 1, nextDraftStartingPicker: 'player' }
      state = sessionReducer(state, { type: 'START_BATTLE' })
      assert.equal(state.battleStarted, false)
      assert.equal(state.preBattle.playerFinished, true)
      assert.deepEqual(state.preBattle.opponentHand, opponentHand)
      state = sessionReducer(state, { type: 'CHOOSE_TABLETOP_TYPE', uid: playerHand[0].uid })
      assert.equal(state.preBattle.tabletopTypeCardUid, playerHand[0].uid)
      state = sessionReducer(state, { type: 'CHOOSE_TABLETOP_TYPE', uid: playerHand[0].uid, damageType: 'dragon' })
      assert.equal(getTabletopChoice(state.preBattle).selectedType, 'dragon')
      assert.equal(getTabletopChoice({ ...state.preBattle, playerHand: [...playerHand, card('robot1')] }).selectedType, null)
      const started = sessionReducer(state, { type: 'START_BATTLE' })
      assert.equal(started.battleStarted, true)
      assert.equal(started.preBattle.opponentHand.length, 4)
      assert.equal(started.preBattle.deck.length, 0)
      const reset = sessionReducer(started, { type: 'UPDATE_SETTINGS', patch: { tabletop: false } })
      assert.equal(reset.battleStarted, false)
      assert(!reset.game.deck.some((entry) => entry.tabletop))
      assert.equal(getTabletopChoice(reset.preBattle).selectedType, null)
    }
  } finally { await server.close() }
})
