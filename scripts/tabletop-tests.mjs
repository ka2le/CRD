import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { getCoreCards, getExpandedCoreDeck } from '../src/game/cards.js'
import { getTabletopBonus, getTabletopProfile, getTabletopChoice, getCardTabletopTypes,
  scoreTabletopHand, resolveTabletopBattle, toTabletopCard, chooseTabletopType, normalizeTabletopRules } from '../src/game/tabletop.js'
import { createPreparationState } from '../src/game/preparationState.js'
import { createDraftGame, applyDraftPick, resolveOpponentDraftPick, commitDraftDiscard, revealNextDraftPack } from '../src/game/draftMode.js'
import { createFiveHandDiscardGame, applyDiscardPhase } from '../src/game/fiveHandDiscard.js'
import { searchDecision } from '../src/game/searchAi.js'
import { pickBestCardForHand, getHandAverageDamage } from '../src/game/cardEvaluator.js'
import { createDevScenario, DEV_SCENARIO_NAMES } from '../src/game/devScenarios.js'
import { createHeadlessGame, stepHeadlessGame, chooseHeadlessBaselineAction, getHeadlessSpec, encodeObservation } from '../src/game/headlessGame.js'

const definitions = new Map(getCoreCards({ tabletop: 'threshold' }).map((card) => [card.id, card]))
let serial = 0
const card = (id) => toTabletopCard({ ...definitions.get(id), uid: `${id}-test-${++serial}` }, 'threshold')
const hand = (...ids) => ids.map(card)
const prototypeCard = (id) => toTabletopCard({ ...definitions.get(id), uid: `${id}-ability-${++serial}` }, 'abilities-prototype')
const prototypeHand = (...ids) => ids.map(prototypeCard)
const mainHand = (...ids) => ids.map((id) => toTabletopCard({ ...definitions.get(id), uid: `${id}-flex-${++serial}` }, 'abilities-main'))

test('headless deals real tabletop pools, advertises a distinct rules version and resolves the shared scorer', () => {
  for (const tabletop of ['threshold', 'abilities-prototype', 'abilities-main']) {
    const spec = getHeadlessSpec({ tabletop })
    assert(spec.rulesVersion.includes(tabletop))
    assert.equal(spec.poolCards.length, tabletop === 'threshold' ? 108 : tabletop === 'abilities-main' ? 96 : 99)
    assert.equal(spec.cardTypes.find((c) => c.id === 'robot_attack').effect.dmg, 1)
    for (const mode of ['draft', 'five-hand-discard']) {
      let state = createHeadlessGame({ tabletop, mode, control: 'both', seed: 131 })
      while (!state.terminal) state = stepHeadlessGame(state, chooseHeadlessBaselineAction(state))
      const result = resolveTabletopBattle(state.battleResult.playerHand, state.battleResult.opponentHand,
        { playerType: chooseTabletopType(state.battleResult.playerHand) })
      assert.deepEqual(state.battleResult, result)
      assert.equal(encodeObservation(state, 'player').battle.playerTotalDamageDealt, result.player.score)
    }
  }
})

test('all three tabletop decks use 1/2 damage and correct card pools; digital stays intact', () => {
  assert.equal(normalizeTabletopRules(true), 'abilities-main')
  assert.equal(normalizeTabletopRules('abilities-main'), 'abilities-main')
  for (const wildDeck of [false, true]) {
    const digital = getExpandedCoreDeck({ wildDeck })
    assert.equal(digital.length, wildDeck ? 102 : 70)
    assert.equal(digital.find((c) => c.id === 'dragons_breath').effect.dmg, 3)
    for (const rules of ['threshold', 'abilities-prototype', 'abilities-main']) {
      const deck = getExpandedCoreDeck({ wildDeck, tabletop: rules })
      assert(deck.every((c) => c.tabletop === rules && c.cd === 0))
      assert.equal(deck.some((c) => c.id === 'shortcut'), rules === 'threshold')
      assert.equal(deck.some((c) => c.id === 'double_dmg'), rules === 'threshold')
      assert.equal(deck.some((c) => c.id === 'chameleon'), rules !== 'abilities-main')
      for (const id of ['swarm', 'robot_attack', 'dragons_breath', 'bite']) assert.equal(deck.find((c) => c.id === id).effect.dmg, 1)
      for (const id of ['murder_rabbit', 'robot_ulti', 'dragon_ulti', 'devour']) assert.equal(deck.find((c) => c.id === id).effect.dmg, 2)
    }
  }
})

test('power, neutral specials, shields, zero scores and choice validation', () => {
  const robots = hand('robot1', 'robot2', 'robot_attack', 'robot_attack')
  assert.equal(getTabletopProfile(robots).base, 6)
  assert.equal(getHandAverageDamage(robots), 6)
  assert.equal(scoreTabletopHand(robots, 3).score, 3)
  assert.equal(scoreTabletopHand(hand('critter1', 'swarm'), 4).score, 0)
  assert.equal(scoreTabletopHand(hand('dragon1', 'dragons_breath'), 20).score, 1)
  assert.equal(getTabletopProfile(hand('joker', 'one_off_each', 'any_off_each')).base, 4)
  assert.equal(getTabletopProfile(hand('shield2', 'shield2', 'shield_is_dmg')).base, 2)
  assert.equal(resolveTabletopBattle([], []).winner, 'tie')
  assert.equal(scoreTabletopHand(hand('bite'), 1).score, 0)
  const tied = hand('robot_dragon', 'robot_attack', 'dragons_breath')
  assert.deepEqual(getTabletopProfile(tied).types, ['robot', 'dragon'])
  assert.deepEqual(getCardTabletopTypes(tied[0], getTabletopProfile(tied)), ['robot', 'dragon'])
  assert.throws(() => resolveTabletopBattle(tied, []), /Choose/)
  assert.throws(() => resolveTabletopBattle(tied, [], { playerType: 'critter' }), /Invalid/)
  assert.equal(chooseTabletopType(tied), 'dragon')
})

test('threshold boundaries, post-shield checks, Shortcut and multiplier stacking', () => {
  for (const [type, at, bonus] of [['critter', 1, 2], ['robot', 4, 3], ['dragon', 8, 4]]) {
    assert.equal(getTabletopBonus(type, 0), 0)
    assert.equal(getTabletopBonus(type, at - 1), 0)
    assert.equal(getTabletopBonus(type, at), bonus)
  }
  const robots = hand('robot2', 'robot_attack', 'robot_attack')
  assert.equal(scoreTabletopHand(robots).score, 7)
  assert.equal(scoreTabletopHand(robots, 1).score, 3)
  assert.equal(scoreTabletopHand([...robots, ...hand('double_dmg', 'double_dmg')]).score, 16)
  assert.equal(scoreTabletopHand(hand('robot1', 'robot_attack', 'shortcut', 'double_dmg')).score, 7)
  assert.equal(scoreTabletopHand(hand('robot1', 'robot_attack', 'shortcut'), 1).score, 0)
  assert.equal(scoreTabletopHand(hand('shortcut', 'double_dmg')).score, 0)
  const chameleon = hand('rabbit2', 'swarm', 'shortcut', 'chameleon')
  assert.deepEqual(['critter', 'robot', 'dragon'].map((type) => scoreTabletopHand(chameleon, 1, type).score), [0, 4, 6])
  assert.equal(chooseTabletopType(chameleon), 'dragon')
  const devour = hand('rabbit2', 'swarm', 'dragon1', 'devour')
  assert.deepEqual(getTabletopProfile(devour).types, ['critter', 'dragon'])
  assert.equal(getTabletopProfile(devour).base, 4)
})

test('Prototype Adapt retains mixed stats, is optional and converts one card', () => {
  assert.equal(scoreTabletopHand(prototypeHand('critter1', 'critter1', 'critter1')).base, 2)
  assert.equal(scoreTabletopHand(prototypeHand('critter1', 'swarm')).adaptedUid, null)
  const cards = prototypeHand('rabbit2', 'critter1', 'critter1')
  const profile = getTabletopProfile(cards)
  assert.equal(profile.base, 3)
  assert.equal(cards.find((c) => c.uid === profile.adaptedUid).id, 'critter1')
  const mixed = getTabletopProfile(prototypeHand('robot_critter', 'critter1', 'robot_attack'))
  assert.deepEqual([mixed.stats.robot, mixed.stats.critter, mixed.base], [1, 1, 2])
})

test('Prototype Perfect Balance +3 requires Robot main type, counts ultimate as two and hybrid as one', () => {
  assert.equal(scoreTabletopHand(prototypeHand('robot2', 'robot_attack', 'robot_attack')).score, 7)
  assert.equal(scoreTabletopHand(prototypeHand('robot2', 'robot_attack', 'robot_attack'), 2).score, 5)
  assert.equal(scoreTabletopHand(prototypeHand('robot1', 'robot_ulti')).score, 2)
  assert.equal(scoreTabletopHand(prototypeHand('robot2', 'robot_ulti')).score, 7)
  assert.equal(scoreTabletopHand(prototypeHand('joker', 'one_off_each')).score, 4)
  const mixed = prototypeHand('robot1', 'robot_attack', 'rabbit2', 'swarm', 'chameleon')
  assert.equal(scoreTabletopHand(mixed, 0, 'critter').bonus, 0)
  assert.equal(scoreTabletopHand(mixed, 0, 'robot').bonus, 3)
})

test('Prototype Overwhelming tests Dragon contribution before shields and adds a stat', () => {
  const below = prototypeHand('dragon2', 'dragon1', 'dragon_ulti')
  assert.equal(scoreTabletopHand(below).overwhelming, false)
  const above = prototypeHand('dragon2', 'dragon2', 'dragon_ulti')
  assert.deepEqual([scoreTabletopHand(above).dragonBase, scoreTabletopHand(above).base], [8, 10])
})

test('Abilities main uses Perfect Balance with shields 1/2/0 and never swaps cards', () => {
  const hand = mainHand('robot2', 'robot_ulti', 'chameleon')
  const saved = structuredClone(hand)
  const robot = scoreTabletopHand(hand, 1, 'robot')
  assert.deepEqual([robot.base, robot.power, robot.bonus, robot.score], [4, 2, 3, 5])
  assert.equal(robot.reconfigured, null)
  assert.equal(scoreTabletopHand(hand, 20, 'robot').score, 3)
  assert.equal(scoreTabletopHand(hand, 1, 'critter').bonus, 0)
  assert.equal(scoreTabletopHand(hand, 1, 'dragon').shieldPenalty, 0)
  assert.equal(scoreTabletopHand(hand, 1, 'critter').shieldPenalty, 1)
  assert.deepEqual(hand, saved)
  assert.equal(getTabletopProfile(mainHand('robot2', 'robot2')).base, 0)
  const dragon = scoreTabletopHand(mainHand('dragon2', 'dragon1', 'dragon_ulti'), 1)
  assert.deepEqual([dragon.dragonBase, dragon.stats.dragon, dragon.score], [6, 3, 6])
})

test('Abilities main Dragon uses contribution 7+, adds one stat once, and recomputes hybrids', () => {
  const six = scoreTabletopHand(mainHand('dragon2', 'dragon1', 'dragon_ulti'))
  assert.deepEqual([six.dragonBase, six.stats.dragon, six.base, six.bonus], [6, 3, 6, 0])
  assert.equal(scoreTabletopHand(mainHand('dragon2', 'dragon1', 'dragons_breath', 'bite')).overwhelming, false)
  const dragon = scoreTabletopHand(mainHand('dragon2', 'dragon2', 'dragon_ulti'))
  assert.deepEqual([dragon.base, dragon.bonus, dragon.score], [10, 0, 10])
  assert.equal(scoreTabletopHand(mainHand('dragon1', 'dragons_breath', 'rabbit2', 'swarm', 'swarm')).overwhelming, false)
  assert.equal(scoreTabletopHand(mainHand('dragon2', 'dragon2', 'dragon2', 'dragon1', 'dragons_breath')).score, 8)
  const hybrid = scoreTabletopHand(mainHand('joker', 'dragon2', 'dragon_ulti', 'one_off_each', 'any_off_each'))
  assert.deepEqual([hybrid.dragonBase, hybrid.stats.dragon, hybrid.contributions.robot, hybrid.neutral, hybrid.score], [6, 3, 3, 5, 14])
  assert.equal(scoreTabletopHand(prototypeHand('dragon2', 'dragon2', 'dragon2', 'dragon1', 'dragons_breath')).score, 8)
})

test('Abilities main Critter tiebreak is symmetric; same-faction and untyped zero draws remain', () => {
  const critter = mainHand('critter1', 'swarm')
  const dragon = mainHand('dragon1', 'dragons_breath')
  assert.equal(resolveTabletopBattle(critter, dragon).winner, 'player')
  assert.equal(resolveTabletopBattle(dragon, critter).winner, 'opponent')
  assert.equal(resolveTabletopBattle(critter, critter).winner, 'tie')
  assert.equal(resolveTabletopBattle(dragon, dragon).winner, 'tie')
  assert.equal(resolveTabletopBattle(critter, dragon).reason, 'critter-tiebreak')
  const chameleon = mainHand('dragon1', 'dragons_breath', 'chameleon')
  assert.equal(chooseTabletopType(chameleon), 'critter')
  assert.equal(resolveTabletopBattle(chameleon, dragon, { playerType: 'critter' }).winner, 'player')
})

test('all rules reach draft/discard completion and search ignores hidden deck order', () => {
  const options = { minSamples: 2, maxSamples: 2, timeBudgetMs: 1e9, seed: 51 }
  for (const rules of ['threshold', 'abilities-prototype', 'abilities-main']) {
    let draft = createDraftGame({ tabletop: rules, seed: 7, firstPicker: 'opponent' })
    const result = searchDecision(draft, 'opponent', options)
    assert.deepEqual(searchDecision({ ...draft, deck: [...draft.deck].reverse() }, 'opponent', options).values, result.values)
    while (draft.phase !== 'battle-ready') {
      if (draft.phase === 'draft-player-pick') draft = applyDraftPick(draft, draft.draftRow[0].uid)
      else if (draft.phase === 'draft-opponent-thinking') draft = resolveOpponentDraftPick(draft)
      else if (draft.phase === 'draft-pack-clearing') draft = commitDraftDiscard(draft)
      else draft = revealNextDraftPack(draft)
    }
    let discard = applyDiscardPhase(createFiveHandDiscardGame({ tabletop: rules, seed: 71 }), [], { deferOpponent: true })
    const choice = searchDecision(discard, 'opponent', options)
    assert(choice.action.selectedIds.every((uid) => discard.opponentHand.some((c) => c.uid === uid)))
    discard = applyDiscardPhase(createFiveHandDiscardGame({ tabletop: rules, seed: 71 }), [])
    discard = applyDiscardPhase(discard, [])
    assert([...draft.playerHand, ...discard.playerHand].every((c) => c.tabletop === rules))
    assert.equal(pickBestCardForHand([card('robot_attack'), card('dragons_breath')], hand('dragon2')).id, 'dragons_breath')
  }
})

test('session gates type choice, invalidates it after hand changes, preserves private AI prep and resets mode', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
  try {
    const { sessionReducer } = await server.ssrLoadModule('/src/hooks/useGameSession.js')
    for (const name of DEV_SCENARIO_NAMES) {
      for (const mode of ['draft', 'discard']) {
        const initial = { settings: {}, battleInstance: 0, gameSessionKey: 0, dealId: 0 }
        const prepared = sessionReducer(initial, { type: 'LOAD_DEV_SCENARIO', payload: createDevScenario({ name, mode, rules: 'threshold' }) })
        assert.equal(prepared.game.phase, 'battle-ready')
        assert.equal(prepared.battleStarted, false)
        const result = sessionReducer(initial, { type: 'LOAD_DEV_SCENARIO', payload: createDevScenario({ name, mode, result: true, rules: 'threshold' }) })
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
      const payload = createDevScenario({ name: 'chameleon', mode, rules: 'threshold', playerCards: ['rabbit2', 'swarm', 'chameleon', 'draw_2_extra', 'copy_card_in_hand'] })
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

test('Critter * Robot * Dragon counts as a Robot attack only when it deals damage; Critter + Robot + Dragon is out of the Abilities decks', () => {
  for (const make of [prototypeHand, mainHand]) {
    // No Critter stat: product is zero, so it does not count and Robot stat 1 vs 0 attacks is unbalanced.
    const dud = getTabletopProfile(make('robot1', 'dragon1', 'one_off_each'))
    assert.equal(dud.robotAttacks, 0)
    assert.equal(dud.balanced, false)
    // One of each: it deals 1 damage and counts as the single Robot attack.
    const hit = getTabletopProfile(make('robot1', 'dragon1', 'critter1', 'one_off_each'))
    assert.equal(hit.robotAttacks, 1)
    assert.equal(hit.balanced, true)
  }
  for (const rules of ['abilities-prototype', 'abilities-main']) {
    assert(!getCoreCards({ tabletop: rules }).some((card) => card.id === 'any_off_each'))
  }
  assert(getCoreCards({ tabletop: 'threshold' }).some((card) => card.id === 'any_off_each'))
})
