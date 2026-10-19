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

const definitions = new Map(getCoreCards({ tabletop: true }).map((card) => [card.id, card]))
let serial = 0
const card = (id) => toTabletopCard({ ...definitions.get(id), uid: `${id}-test-${++serial}` })
const hand = (...ids) => ids.map(card)

test('tabletop decks preserve identities/copy counts; ordinary attacks are 2 with no cooldown', () => {
  for (const wildDeck of [false, true]) {
    const digital = getExpandedCoreDeck({ wildDeck })
    const tabletop = getExpandedCoreDeck({ wildDeck, tabletop: true })
    assert.equal(digital.length, wildDeck ? 102 : 70)
    assert.equal(tabletop.length, wildDeck ? 108 : 72)
    assert.deepEqual(tabletop.filter((entry) => !entry.tabletopOnly).map((entry) => entry.uid), digital.map((entry) => entry.uid))
    for (const id of ['shortcut', 'chameleon']) {
      assert.equal(tabletop.filter((entry) => entry.id === id).length, wildDeck ? 3 : 1)
      assert(!digital.some((entry) => entry.id === id))
    }
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

test('integer specials and Devour produce reproducible power', () => {
  for (const [stat, attack] of [['rabbit2', 'murder_rabbit'], ['robot2', 'robot_ulti'], ['dragon2', 'dragon_ulti'], ['dragon2', 'devour']]) {
    const ultimate = card(attack)
    assert.equal(ultimate.effect.dmg, 4)
    assert.equal(getTabletopProfile([card(stat), ultimate]).base, 8)
  }
  assert.equal(getTabletopProfile(hand('robot1', 'robot_attack', 'critter1', 'swarm', 'bite', 'double_dmg')).base, 6)
  assert.equal(getTabletopProfile(hand('robot1', 'robot_attack', 'critter1', 'swarm', 'bite', 'double_dmg', 'double_dmg')).base, 6)
  assert.equal(getTabletopProfile(hand('swarm', 'double_dmg')).base, 0)
  assert.equal(getTabletopProfile(hand('shield2', 'shield2', 'shield_is_dmg')).base, 2)
  assert.equal(getTabletopProfile(hand('joker', 'one_off_each', 'any_off_each')).base, 4)
  const devour = getTabletopProfile(hand('rabbit2', 'swarm', 'dragon1', 'devour'))
  assert.equal(devour.base, 8)
  assert.deepEqual(devour.types, ['critter', 'dragon'])
})

test('2× card doubles only the earned faction bonus after shields and stacks for all factions', () => {
  const builds = [
    { ids: ['rabbit2', 'swarm'], base: 4, bonus: 1 },
    { ids: ['robot2', 'robot_attack', 'robot_attack'], base: 8, bonus: 2 },
    { ids: ['robot2', 'robot1', 'robot_attack', 'robot_attack'], base: 12, bonus: 3 },
    { ids: ['dragon2', 'dragon1', 'dragons_breath', 'dragons_breath'], base: 12, bonus: 4 },
    { ids: ['dragon2', 'dragon2', 'dragons_breath', 'dragons_breath'], base: 16, bonus: 6 },
  ]
  for (const { ids, base, bonus } of builds) {
    for (const copies of [1, 2, 3]) {
      const result = scoreTabletopHand([...hand(...ids), ...hand(...Array(copies).fill('double_dmg'))])
      assert.deepEqual([result.base, result.baseBonus, result.bonus, result.score], [base, bonus, bonus * 2 ** copies, base + bonus * 2 ** copies])
    }
  }
  const robots = hand('robot2', 'robot_attack', 'robot_attack', 'double_dmg')
  assert.deepEqual([scoreTabletopHand(robots, 1).power, scoreTabletopHand(robots, 1).bonus], [7, 4])
  assert.deepEqual([scoreTabletopHand(robots, 2).power, scoreTabletopHand(robots, 2).bonus], [6, 0])
  assert.equal(scoreTabletopHand(hand('critter1', 'swarm', 'double_dmg'), 1).score, 0)
  assert.equal(scoreTabletopHand(hand('double_dmg')).score, 0)
  const tied = getTabletopProfile(hand('robot_dragon', 'robot_attack', 'dragons_breath', 'double_dmg'))
  assert.deepEqual(tied.contributions, { critter: 0, robot: 2, dragon: 2 })
  assert.deepEqual(tied.types, ['robot', 'dragon'])
  const multiplier = card('double_dmg')
  assert.equal(pickBestCardForHand([multiplier, card('bite')], hand('robot2', 'robot1', 'robot_attack', 'robot_attack')).uid, multiplier.uid)
})

test('Shortcut advances earned bonus tiers after shields, caps and applies before 2× cards', () => {
  const robotBase = hand('robot1', 'robot_attack')
  assert.equal(scoreTabletopHand([...robotBase, card('shortcut')]).bonus, 2)
  assert.equal(scoreTabletopHand([...robotBase, ...hand('shortcut', 'shortcut')]).bonus, 3)
  assert.equal(scoreTabletopHand([...robotBase, ...hand('shortcut', 'shortcut', 'shortcut')]).bonus, 3)
  const shielded = scoreTabletopHand(hand('robot2', 'robot_attack', 'robot_attack', 'shortcut', 'double_dmg'), 2)
  assert.deepEqual([shielded.base, shielded.power, shielded.naturalBonus, shielded.baseBonus, shielded.bonus, shielded.score], [8, 6, 0, 2, 4, 10])
  assert.equal(scoreTabletopHand(hand('dragon1', 'dragons_breath', 'shortcut')).bonus, 4)
  assert.equal(scoreTabletopHand(hand('dragon1', 'dragons_breath', 'shortcut', 'shortcut')).bonus, 6)
  assert.equal(scoreTabletopHand(hand('critter1', 'swarm', 'shortcut')).bonus, 1)
  assert.equal(scoreTabletopHand(hand('robot1', 'robot_attack', 'shortcut'), 2).bonus, 0)
  assert.equal(scoreTabletopHand(hand('shortcut')).score, 0)
})

test('Chameleon permits every faction and uses the chosen bonus and shield cost for the whole hand', () => {
  const cards = hand('rabbit2', 'swarm', 'shortcut', 'chameleon')
  const profile = getTabletopProfile(cards)
  assert.deepEqual(profile.contributions, { critter: 4, robot: 0, dragon: 0 })
  assert.deepEqual(profile.types, ['critter', 'robot', 'dragon'])
  assert.deepEqual(getCardTabletopTypes(cards[3], profile), ['critter', 'robot', 'dragon'])
  const critter = scoreTabletopHand(cards, 1, 'critter')
  const robot = scoreTabletopHand(cards, 1, 'robot')
  const dragon = scoreTabletopHand(cards, 1, 'dragon')
  assert.deepEqual([critter.blocked, critter.bonus, critter.score], [2, 1, 3])
  assert.deepEqual([robot.blocked, robot.bonus, robot.score], [1, 2, 5])
  assert.deepEqual([dragon.blocked, dragon.bonus, dragon.score], [0, 4, 8])
  assert.throws(() => resolveTabletopBattle(cards, []), /Choose/)
  assert.equal(chooseTabletopType(cards), 'dragon')
  assert.equal(resolveTabletopBattle(cards, [], { playerType: 'robot' }).player.damageType, 'robot')
  assert.equal(pickBestCardForHand([card('chameleon'), card('bite')], hand('rabbit2', 'swarm', 'shortcut')).id, 'chameleon')
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
        assert.equal(new Set(physicalIds).size, 108)
      }
    }
    assert.throws(() => createDevScenario({ name: 'tie', playerType: 'critter' }), /Invalid main damage type/)
    assert.throws(() => createDevScenario({ playerCards: ['not-a-card'] }), /Card unavailable/)
    for (const mode of ['draft', 'discard']) {
      const payload = createDevScenario({ name: 'chameleon', mode, playerCards: ['rabbit2', 'swarm', 'chameleon', 'draw_2_extra', 'copy_card_in_hand'] })
      let state = sessionReducer({ settings: {}, battleInstance: 0, gameSessionKey: 0, dealId: 0 }, { type: 'LOAD_DEV_SCENARIO', payload })
      const chameleon = state.preBattle.playerHand.find((entry) => entry.id === 'chameleon')
      state = sessionReducer(state, { type: 'CHOOSE_TABLETOP_TYPE', uid: chameleon.uid })
      assert.equal(state.preBattle.tabletopTypeCardUid, chameleon.uid)
      state = sessionReducer(state, { type: 'CANCEL_TABLETOP_TYPE' })
      assert.equal(state.preBattle.tabletopTypeCardUid, null)
      state = sessionReducer(state, { type: 'CHOOSE_TABLETOP_TYPE', uid: chameleon.uid, damageType: 'dragon' })
      assert.equal(getTabletopChoice(state.preBattle).selectedType, 'dragon')
      const copy = state.preBattle.playerHand.find((entry) => entry.id === 'copy_card_in_hand')
      state = sessionReducer(state, { type: 'ACTIVATE_PLAYER_PRE_BATTLE_CARD', uid: copy.uid })
      state = sessionReducer(state, { type: 'ACTIVATE_PLAYER_PRE_BATTLE_CARD', uid: chameleon.uid })
      assert.equal(state.preBattle.playerHand.filter((entry) => entry.id === 'chameleon').length, 2)
      assert.equal(getTabletopChoice(state.preBattle).selectedType, null)
    }
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
