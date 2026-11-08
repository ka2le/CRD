import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { getCoreCards, getExpandedCoreDeck, buildShuffledDeck } from '../src/game/cards.js'
import { getHandStats } from '../src/game/engine.js'
import { getTabletopProfile, scoreTabletopHand, resolveTabletopBattle } from '../src/game/tabletop.js'
import { buildTabletopResolutionPlan, finalLedgerSide } from '../src/game/tabletopResolution.js'
import { createPreparationState, getPreparationActions, applyPreparationAction } from '../src/game/preparationState.js'
import { monsterDeckRecipe, normalizeMonsterDeck } from '../src/game/monsters.js'
import { createHeadlessGame, getHeadlessSpec, stepHeadlessGame, chooseHeadlessBaselineAction } from '../src/game/headlessGame.js'
import { createFiveHandDiscardGame, applyDiscardPhase, applyOpponentDiscardPhase } from '../src/game/fiveHandDiscard.js'

const options = { tabletop: 'monsters', wildDeck: false }
const catalog = getExpandedCoreDeck(options)
const definitions = getCoreCards({ ...options, includeDisabled: true })
let serial = 0
const card = id => ({ ...catalog.find(c => c.id === id), uid: `${id}-test-${serial++}` })
const hand = (...ids) => ids.map(card)
const prep = (cards, deck = []) => createPreparationState({ playerHand: cards, opponentHand: hand('bite'), deck })
const activate = (state, id, targetUid) => applyPreparationAction(state, 'player', {
  type: 'prepare', sourceUid: state.playerHand.find(c => c.id === id).uid, ...(targetUid ? { targetUid } : {}),
})

test('Monsters adds exactly the requested 23 copies and leaves NC untouched', () => {
  assert.equal(catalog.length, 96)
  const expected = { monster1: 7, monster_attack: 7, monster2: 1, monster3: 1, monster_ulti: 2,
    monster_draw_discard: 1, monster_transform: 1, monster_critter_dmg: 1, monster_robot_dmg: 1, monster_dragon_dmg: 1 }
  for (const [id, n] of Object.entries(expected)) assert.equal(catalog.filter(c => c.id === id).length, n)
  assert.equal(getExpandedCoreDeck({ tabletop: 'abilities-new-cards' }).length, 73)
  assert.equal(getExpandedCoreDeck({ tabletop: 'abilities-main' }).length, 69)
  assert.equal(getExpandedCoreDeck({ ...options, wildDeck: true }).length, 146)
  assert.equal(new Set(catalog.filter(c => c.id === 'monster1').map(c => c.images[c.imageIndex])).size, 7)
  assert.equal(new Set(catalog.filter(c => c.id === 'monster_attack').map(c => c.images[c.imageIndex])).size, 7)
})

test('fourth faction has real stats and attacks, no bonus, and one shield cost', () => {
  const h = hand('monster2', 'monster3', 'monster_attack', 'monster_ulti')
  assert.equal(getHandStats(h).monster, 5)
  const score = scoreTabletopHand(h, 2, 'monster')
  assert.equal(score.base, 15)
  assert.equal(score.score, 13)
  assert.equal(score.bonus, 0)
  assert.equal(score.winsTies, false)
  assert.equal(score.overwhelming, false)
  assert.equal(scoreTabletopHand(h, 100, 'monster').score, 0)
  const specialist = getTabletopProfile(hand('monster3', 'single_faction_2'))
  assert.equal(specialist.contributions.monster, 6)
  assert.equal(getTabletopProfile(hand('monster1', 'robot1', 'single_faction_2')).base, 0)
})

test('mixed products are neutral and do not count as Robot attacks', () => {
  const h = hand('monster2', 'rabbit2', 'robot2', 'dragon2', 'monster_critter_dmg', 'monster_robot_dmg', 'monster_dragon_dmg')
  const p = getTabletopProfile(h)
  assert.equal(p.base, 12)
  assert.equal(p.robotAttacks, 0)
  assert.deepEqual(p.types, ['critter', 'robot', 'dragon', 'monster'])
  assert.equal(scoreTabletopHand(h, 2, 'monster').score, 10)
  assert.equal(scoreTabletopHand(h, 2, 'dragon').score, 14) // +1 Dragon stat repowers its mixed product.
})

test('transformation chooses any original faction, changes every current pip, and leaves later draws alone', () => {
  for (const faction of ['critter', 'robot', 'dragon']) {
    const initial = prep(hand('monster_transform', 'monster2', 'monster3', 'monster_ulti', 'draw_2_extra'), hand('monster1'))
    const choices = getPreparationActions(initial).filter(a => a.cardId === 'monster_transform' && a.type === 'prepare')
    assert.deepEqual(choices.map(a => a.targetUid), ['critter', 'robot', 'dragon'])
    assert.throws(() => activate(initial, 'monster_transform', 'monster'), /Illegal/)
    let state = activate(initial, 'monster_transform', faction)
    assert.equal(getHandStats(state.playerHand).monster, 0)
    assert.equal(getHandStats(state.playerHand)[faction], 5)
    assert.equal(getTabletopProfile(state.playerHand).base, 0)
    assert.equal(getHandStats(initial.playerHand).monster, 5, 'does not mutate old state')
    state = activate(state, 'draw_2_extra')
    assert.equal(getHandStats(state.playerHand).monster, 1)
    assert.equal(getHandStats(state.playerHand)[faction], 5)
    assert.equal(getTabletopProfile(state.playerHand).base, 2)
  }
})

test('Monster draw/discard snapshots pips, blocks other specials, permits source discard, handles zero and exhaustion', () => {
  let state = prep(hand('monster2', 'monster_draw_discard', 'monster_transform'), hand('monster3', 'monster1', 'bite'))
  state = activate(state, 'monster_draw_discard')
  assert.equal(state.playerPendingDiscard.remaining, 2)
  assert.equal(state.playerDrawnCount, 2)
  assert(getPreparationActions(state).every(a => a.type === 'discard-preparation'))
  for (const id of ['monster2', 'monster_draw_discard']) state = applyPreparationAction(state, 'player', {
    type: 'discard-preparation', sourceUid: state.playerPendingDiscard.sourceUid, targetUid: state.playerHand.find(c => c.id === id).uid,
  })
  assert.equal(state.playerPendingDiscard, null)
  assert.equal(getHandStats(state.playerHand).monster, 4)
  const zero = activate(prep(hand('monster_draw_discard'), hand('bite')), 'monster_draw_discard')
  assert.equal(zero.playerPendingDiscard, null)
  assert.equal(zero.deck.length, 1)
  const exhausted = activate(prep(hand('monster3', 'monster_draw_discard')), 'monster_draw_discard')
  assert.equal(exhausted.playerPendingDiscard.remaining, 2, 'discard debt capped by available hand')
})

test('deck recipes are exact physical counts, include disabled cards, roundtrip, and reject undersized dealing', () => {
  const recipe = monsterDeckRecipe(definitions, { ...options, monsterDeck: { monster1: 3, shield_ulti: 2, no_stats_to_2: 1, swarm: 0 } })
  const deck = getExpandedCoreDeck(recipe)
  assert.equal(deck.length, recipe.total)
  for (const [id, count] of Object.entries(recipe.monsterDeck)) assert.equal(deck.filter(c => c.id === id).length, count)
  assert.equal(new Set(deck.map(c => c.uid)).size, deck.length)
  assert.deepEqual(getExpandedCoreDeck({ ...recipe, wildDeck: true }), deck, 'explicit counts override Wild multipliers')
  assert.equal(monsterDeckRecipe(definitions, JSON.parse(JSON.stringify(recipe))).recipeId, recipe.recipeId)
  assert.deepEqual(normalizeMonsterDeck({ monster1: -1, monster3: 31, monster2: 2.5, bogus: 1, swarm: 0 }, definitions), { swarm: 0 })
  const empty = Object.fromEntries(definitions.map(c => [c.id, 0]))
  assert.throws(() => buildShuffledDeck({ ...options, monsterDeck: empty }), /at least 36/)
  assert.equal(getHeadlessSpec(recipe).poolCards.length, deck.length)
  assert.equal(getHeadlessSpec(recipe).rulesVersion, 'monsters-v1')
})

test('both game modes finish using the same configured deck and deterministic baseline', () => {
  for (const mode of ['draft', 'five-hand-discard']) {
    const config = { ...options, mode, control: 'both', seed: 812, monsterDeck: { monster1: 14, monster_attack: 14, no_stats_to_2: 1 } }
    let state = createHeadlessGame(config)
    assert.equal(state.game.handSize, 6)
    if (mode === 'draft') assert.equal(state.game.draftRow.length, 6)
    else { assert.equal(state.game.playerHand.length, 6); assert.equal(state.game.opponentHand.length, 6) }
    let turns = 0
    while (!state.terminal) {
      assert(++turns < 250)
      state = stepHeadlessGame(state, chooseHeadlessBaselineAction(state))
    }
    assert.equal(state.game.playerHand.length, 6)
    assert.equal(state.game.opponentHand.length, 6)
    if (mode === 'draft') assert.equal(state.game.packNumber, 6)
    assert(['player', 'opponent', 'tie'].includes(state.battleResult.winner))
    assert(Number.isFinite(state.battleResult.player.score))
    assert(Number.isFinite(state.battleResult.opponent.score))
  }
})

test('animated ledger includes Monster stats, attack units, and shield penalty', () => {
  const result = resolveTabletopBattle(hand('monster3', 'monster_ulti'), hand('shield2', 'bite'))
  const plan = buildTabletopResolutionPlan(result)
  assert.equal(plan.player.stats.find(x => x.type === 'monster').total, 3)
  assert.equal(plan.player.pulses.find(x => x.type === 'monster').cards[0].units, 2)
  assert.equal(plan.player.shields.cost, 1)
  assert.equal(finalLedgerSide(plan.player).damage.monster, 6)
  assert.equal(finalLedgerSide(plan.player).total, 4)
})

test('six-card Discard redraws all six twice per seat without duplicates at the minimum deck size', () => {
  const counts = Object.fromEntries(definitions.map(c => [c.id, 0]))
  counts.monster1 = 18
  counts.monster_attack = 18
  let game = createFiveHandDiscardGame({ ...options, monsterDeck: counts, seed: 91 })
  for (let pass = 0; pass < 2; pass++) {
    game = applyDiscardPhase(game, game.playerHand.map(c => c.uid), { deferOpponent: true })
    game = applyOpponentDiscardPhase(game, game.opponentHand.map(c => c.uid))
    assert.equal(game.playerHand.length, 6)
    assert.equal(game.opponentHand.length, 6)
  }
  assert.equal(game.phase, 'battle-ready')
  assert.equal(game.deck.length, 0)
  // The player's public discard pool already includes the opponent's discards.
  assert.equal(game.opponentDiscards.length, 12)
  assert.equal(game.playerDiscards.length, 24)
  const all = [...game.playerHand, ...game.opponentHand, ...game.playerDiscards]
  assert.equal(all.length, 36)
  assert.equal(new Set(all.map(c => c.uid)).size, 36)
})

test('browser reducer, saved settings and guest seat preserve Monsters and transformation', async () => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  try {
    const { sessionReducer, normalizePlaySettings } = await server.ssrLoadModule('/src/hooks/useGameSession.js')
    const { createDevScenario } = await server.ssrLoadModule('/src/game/devScenarios.js')
    const { applyRoomAction, seatView } = await server.ssrLoadModule('/src/network/roomGame.js')
    const { getOpponentAiOptions } = await server.ssrLoadModule('/src/game/opponentAi.js')
    const settings = normalizePlaySettings({ testing: true, tabletop: 'monsters', opponentAi: 'felix', monsterDeck: { monster1: 8 } })
    assert.equal(settings.tabletop, 'monsters')
    assert.equal(settings.opponentAi, 'rules')
    assert.deepEqual(getOpponentAiOptions('draft', 'monsters').map(x => x.id), ['rules', 'search'])
    assert.deepEqual(normalizePlaySettings(JSON.parse(JSON.stringify(settings))), settings)
    const initial = { settings, battleInstance: 0, gameSessionKey: 0, dealId: 0 }
    let state = sessionReducer(initial, { type: 'LOAD_DEV_SCENARIO', payload: createDevScenario({ name: 'monsters', rules: 'monsters',
      opponentCards: ['monster_transform', 'monster2', 'monster_attack', 'shield2', 'bite'] }) })
    for (const seat of ['host', 'guest']) {
      const view = seatView(state, seat)
      const source = view.preBattle.playerHand.find(c => c.id === 'monster_transform')
      state = applyRoomAction(state, seat, { type: 'ACTIVATE_PLAYER_PRE_BATTLE_CARD', uid: source.uid })
      assert.equal(seatView(state, seat).preBattle.monsterTransformUid, source.uid)
      state = applyRoomAction(state, seat, { type: 'CHOOSE_MONSTER_TRANSFORM', damageType: 'robot' })
      assert.equal(getHandStats(seatView(state, seat).preBattle.playerHand).monster, 0)
      assert.equal(getHandStats(seatView(state, seat).preBattle.playerHand).robot, 2)
    }
    const nc = normalizePlaySettings(settings, { testing: false })
    assert.equal(nc.tabletop, 'abilities-new-cards')
    assert.deepEqual(nc.monsterDeck, settings.monsterDeck, 'recipe remains remembered when leaving mode')
  } finally { await server.close() }
})
