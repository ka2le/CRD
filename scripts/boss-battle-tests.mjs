import test from 'node:test'
import assert from 'node:assert/strict'
import { BOSSES, BOSS_PRESETS, bossOptions, bossActiveRow, bossDraftRows, bossToolCharges, bossCanSwitchLatest, bossPocketCard, bossPocketWindow, bossCore, bossHand, bossReducer as step, createBossRun, matchesBossFilter, resolveBossBattle } from '../src/game/bossBattle.js'
import { getExpandedCoreDeck } from '../src/game/cards.js'
import { createPreparationState, getPreparationActions } from '../src/game/preparationState.js'
import { getTabletopProfile, scoreTabletopHand, chooseTabletopType } from '../src/game/tabletop.js'

const cards = getExpandedCoreDeck({ tabletop: 'abilities-new-cards' })
const hand = ids => ids.map((id, i) => ({ ...cards.find(c => c.id === id), uid: `${id}_fixture_${i}` }))
const start = options => step(createBossRun({ seed: 121, options: BOSS_PRESETS.original, ...options }), { type: 'start' })
function readyHand(s, seat = s.activeSeat) {
  const hand = s.prep[`${seat ? 'opponent' : 'player'}Hand`]
  const types = getTabletopProfile(hand).types
  if (types.length > 1 && !s.types[seat]) s = step(s, { type: 'faction', seat, faction: types[0] })
  return step(s, { type: 'prepare', seat, action: { type: 'finish-preparation' } })
}
function finishDraft(s, hook = () => {}) {
  for (let guard = 0; guard < 60 && s.phase !== 'prepare'; guard++) {
    hook(s)
    s = step(s, s.phase === 'draft' ? { type: 'pick', uid: bossActiveRow(s)[0].uid } : { type: s.phase === 'collect' ? 'collect' : 'next' })
  }
  assert.equal(s.phase, 'prepare')
  return s
}

test('filters use real printed stats and damage, including mixed stats, Guard and neutral attacks', () => {
  for (const id of ['robot_critter', 'critter_shield', 'joker']) {
    const c = cards.find(c => c.id === id)
    assert.equal(matchesBossFilter(c, 'stats'), true)
    assert.equal(matchesBossFilter(c, 'critter'), true)
  }
  for (const id of ['robot_attack', 'robot_ulti', 'bite', 'single_faction_2', 'one_off_each', 'shield_is_dmg', 'discard_for_damage']) assert.equal(matchesBossFilter(cards.find(c => c.id === id), 'attacks'), true, id)
  for (const id of ['draw_2_extra', 'copy_card_in_hand', 'shield2', 'critter1']) assert.equal(matchesBossFilter(cards.find(c => c.id === id), 'attacks'), false, id)
  assert.equal(matchesBossFilter(cards.find(c => c.id === 'murder_rabbit'), 'critter'), true)
})

test('every boss collects exactly its leftovers on all five packs, once, with conserved physical cards', () => {
  for (const b of BOSSES) {
    let s = start({ bossId: b.id })
    let expected = 0
    s = finishDraft(s, before => {
      if (before.phase === 'collect') expected += b.filter === 'random' ? Math.min(1, before.row.length) : before.row.filter(c => matchesBossFilter(c, b.filter)).length
    })
    assert.deepEqual(s.hands.map(h => h.length), [5, 5])
    assert.equal(s.absorbed.length, expected)
    const all = [...s.hands.flat(), ...s.absorbed, ...s.discard, ...s.deck, ...s.pockets.filter(Boolean)]
    assert.equal(all.length, 73)
    assert.equal(new Set(all.map(c => c.uid)).size, 73)
    assert.equal(s.prep.sharedDiscard, true)
    assert.equal(s.prep.playerDiscard, s.prep.opponentDiscard)
    assert.equal(s.prep.playerDiscard.some(c => s.absorbed.some(a => a.uid === c.uid)), false)
    assert.equal(step(s, { type: 'collect' }), s)
  }
})

test('random absorption is reproducible across saved reload and unrelated actions cannot consume RNG', () => {
  let s = start({ bossId: 'wildmouth' })
  s = step(s, { type: 'pick', uid: s.row[0].uid })
  s = step(s, { type: 'pick', uid: s.row[0].uid })
  assert.deepEqual(step(s, { type: 'collect' }), step(JSON.parse(JSON.stringify(s)), { type: 'collect' }))
  assert.equal(step(s, { type: 'pick', uid: s.row[0].uid }), s)
})

test('borrowed pick is repaid next pack; Pocket reserves an extra card without consuming a pick', () => {
  for (const firstSeat of [0, 1]) {
    let s = start()
    if (firstSeat) s = step(s, { type: 'pick', uid: s.row[0].uid })
    s = step(s, { type: 'double' })
    assert.equal(s.turns.filter(i => i === firstSeat).length, 2)
    const reserve = bossActiveRow(s)[0], turns = [...s.turns]
    s = step(s, { type: 'pocket', uid: reserve.uid })
    assert.deepEqual(s.turns, turns)
    assert.equal(s.pockets[firstSeat].uid, reserve.uid)
    s = step(s, { type: 'pick', uid: bossActiveRow(s)[0].uid })
    while (s.phase === 'draft') s = step(s, { type: 'pick', uid: s.row[0].uid })
    s = step(step(s, { type: 'collect' }), { type: 'next' })
    assert.equal(s.turns.includes(firstSeat), false)
    s = finishDraft(s)
    assert.deepEqual(s.hands.map(h => h.length), [5, 5])
    assert.equal(s.hands[firstSeat].some(c => c.uid === reserve.uid), false)
    assertPhysicalCards(s)
    assert.equal(bossToolCharges(s, firstSeat).double, 0)
    assert.equal(bossToolCharges(s, 1 - firstSeat).double, 1)
  }
})

test('shared-draft Refresh and Swap each spend only the initiating players charge', () => {
  let s = start()
  const old = s.row[0], replacement = s.deck[0]
  s = step(s, { type: 'refresh', uid: old.uid })
  assert.equal(s.row[0].uid, replacement.uid)
  assert.equal(s.refreshed[0].uid, old.uid)
  assert.equal(bossToolCharges(s, 0).refresh, 0)
  assert.equal(bossToolCharges(s, 1).refresh, 1)
  assert.equal(step(s, { type: 'refresh', uid: replacement.uid }), s)
  s = step(s, { type: 'pick', uid: s.row[0].uid })
  s = step(s, { type: 'pick', uid: s.row[0].uid })
  s = step(step(s, { type: 'collect' }), { type: 'next' })
  const a = s.hands[0][0], b = s.hands[1][0]
  s = step(s, { type: 'swap', a: a.uid, b: b.uid })
  assert.equal(s.hands[0][0].uid, b.uid)
  assert.equal(s.hands[1][0].uid, a.uid)
  assert.equal(bossToolCharges(s, 1).swap, 0)
  assert.equal(bossToolCharges(s, 0).swap, 1)
  assert.equal(s.absorbed.some(c => c.uid === old.uid), false)
})

test('ordinary preparation shares Recycle removals and discards but never feeds the boss', () => {
  let s = finishDraft(start())
  s = { ...s, prep: { ...s.prep, playerHand: hand(['recycle_card', 'draw_2_discard_2']), opponentHand: hand(['recycle_card']) } }
  const original = s.absorbed.length
  const action = getPreparationActions(s.prep, 'player').find(a => a.cardId === 'recycle_card' && a.type === 'prepare')
  assert.ok(action)
  s = step(s, { type: 'prepare', action })
  assert.equal(s.prep.opponentDiscard.some(c => c.uid === action.targetUid), false)
  const draw = getPreparationActions(s.prep, 'player').find(a => a.cardId === 'draw_2_discard_2' && a.type === 'prepare')
  s = step(s, { type: 'prepare', action: draw })
  assert.equal(s.prep.playerPendingDiscard.remaining, 2)
  assert.equal(step(s, { type: 'seat', seat: 1 }).activeSeat, 1)
  assert.equal(step(s, { type: 'prepare', seat: 0, action: { type: 'finish-preparation' } }), s)
  for (let i = 0; i < 2; i++) {
    const discard = getPreparationActions(s.prep, 'player')[0]
    s = step(s, { type: 'prepare', action: discard })
  }
  assert.equal(s.prep.playerPendingDiscard, null)
  assert.equal(s.absorbed.length, original)
})

test('Swap stays available through final absorption and during preparation in either draft mode', () => {
  for (const preset of Object.values(BOSS_PRESETS)) for (const rounds of [4, 5]) {
    const boundaries = []
    finishDraft(start({ options: { ...preset, rounds } }), s => {
      if (s.pack === rounds && ['collect', 'collected'].includes(s.phase)) boundaries.push(JSON.parse(JSON.stringify(s)))
    })
    assert.equal(boundaries.length, 2)
    for (const before of boundaries) {
      const a = before.hands[0][0], b = before.hands[1][0]
      const action = { type: 'swap', seat: 0, a: a.uid, b: b.uid }
      assert.equal(bossToolCharges(step({ ...before, options: { ...before.options, swap: false } }, action), 0).swap, 1)
      const swapped = step(before, action)
      assert.equal(swapped.phase, before.phase)
      assert.equal(bossToolCharges(swapped, 0).swap, 0)
      assert.equal(swapped.hands[0][0].uid, b.uid)
      assert.equal(swapped.hands[1][0].uid, a.uid)
      assert.deepEqual(swapped.deck, before.deck)
      assert.deepEqual(swapped.absorbed, before.absorbed)
      assertPhysicalCards(swapped)
      assert.equal(step(swapped, { type: 'swap', seat: 0, a: b.uid, b: a.uid }), swapped)
      const prep = finishDraft(swapped)
      assert.equal(prep.prep.playerHand[0].uid, b.uid)
      assert.equal(prep.prep.opponentHand[0].uid, a.uid)
      assert.deepEqual(step(prep, { type: 'replay-prep' }).prep, prep.prep)
      const untouchedPrep = finishDraft(before)
      assert.equal(bossToolCharges(untouchedPrep, 0).swap, 1)
      const lateSwap = step(untouchedPrep, action)
      assert.equal(lateSwap.prep.playerHand[0].uid, b.uid)
      assert.equal(lateSwap.prep.opponentHand[0].uid, a.uid)
      const result = readyHand(readyHand(untouchedPrep, 0), 1)
      assert.equal(step(result, action), result)
    }
  }
})

test('team applies shields per hero, doubles lower post-shield score and protects against boss using pooled shields', () => {
  let s = finishDraft(start({ bossId: 'briarback' }))
  s = { ...s, absorbed: [], types: ['robot', 'dragon'], prep: { ...s.prep,
    playerHand: hand(['robot1', 'robot1', 'robot_attack', 'robot_attack', 'shield2']),
    opponentHand: hand(['dragon2', 'dragon1', 'dragon_ulti', 'bite', 'shield2']) } }
  const r = resolveBossBattle(s)
  assert.equal(r.heroes[0].score, 5) // 4 + 3 - 2
  assert.equal(r.heroes[1].score, 10) // 8 triggers extra D stat: 4 * 2 + 2, shield immune
  assert.equal(r.teamPower, 20)
  assert.equal(r.shields, 4)
  assert.equal(r.boss.score, 0)
  assert.equal(r.winner, 'team')
  const h = bossHand(s)
  assert.equal(r.boss.score, scoreTabletopHand(h, 4, chooseTabletopType(h)).score)
  assert.equal(getTabletopProfile(bossCore('ironhide')).stats.robot, 2)
})

test('Ready preserves full encounter through serialization and locks the first hand', () => {
  let s = finishDraft(start())
  s = readyHand(s)
  assert.equal(s.activeSeat, 1)
  assert.equal(step(s, { type: 'seat', seat: 0 }), s)
  s = readyHand(JSON.parse(JSON.stringify(s)))
  assert.equal(s.phase, 'result')
  assert.deepEqual(s.result, resolveBossBattle(s))
})

test('Critter ties apply symmetrically to team and boss; both Critter flags cancel', () => {
  let s = finishDraft(start({ bossId: 'ironhide' }))
  s = { ...s, absorbed: hand(['robot_attack']), types: ['critter', 'dragon'], prep: { ...s.prep, playerHand: hand(['bite']), opponentHand: [] } }
  let r = resolveBossBattle(s)
  assert.equal(r.teamPower, r.boss.score)
  assert.equal(r.winner, 'team')
  r = resolveBossBattle({ ...s, types: ['dragon', 'dragon'] })
  assert.equal(r.winner, 'draw')
  s = { ...s, bossId: 'briarback', absorbed: [], types: ['robot', 'dragon'], prep: { ...s.prep, playerHand: hand(['robot1', 'robot_attack']) } }
  r = resolveBossBattle(s)
  assert.equal(r.teamPower, r.boss.score)
  assert.equal(r.winner, 'boss')
  r = resolveBossBattle({ ...s, types: ['robot', 'critter'] })
  assert.equal(r.winner, 'draw')
})

test('sacrifice can cancel before committing, including an already charged recycled source', () => {
  let s = finishDraft(start())
  s = { ...s, prep: { ...s.prep, playerHand: [{ ...hand(['discard_for_damage'])[0], sacrificedPower: 3 }] } }
  const action = getPreparationActions(s.prep, 'player').find(a => a.type === 'prepare')
  s = step(s, { type: 'prepare', action })
  s = step(s, { type: 'cancel-sacrifice' })
  assert.equal(s.prep.playerPendingDiscard, null)
  assert.equal(s.prep.playerActivated.includes(action.sourceUid), false)
  assert.equal(s.prep.playerHand[0].sacrificedPower, 3)
})

function assertPhysicalCards(s) {
  const all = [...s.hands.flat(), ...s.absorbed, ...s.discard, ...s.deck, ...bossDraftRows(s).flat(), ...s.refreshed,
    ...[0, 1].map(i => bossPocketCard(s, i)).filter(Boolean)]
  assert.equal(all.length, 73)
  assert.equal(new Set(all.map(c => c.uid)).size, 73)
}

test('empty Pockets draw exactly once, then reusable pack exchanges conserve cards and never spend normal picks', () => {
  for (const options of Object.values(BOSS_PRESETS)) {
    let s = start({ options, testMode: true })
    assert.deepEqual(s.pockets, [null, null])
    assert.equal(s.deck.length + bossDraftRows(s).flat().length, 73)
    const card = bossActiveRow(s, 0)[0], replacement = s.deck[0], before = s
    assert.equal(step(s, { type: 'pocket', seat: 1, uid: card.uid }), s) // Off turn or wrong pack.
    s = step(s, { type: 'pocket', seat: 0, uid: card.uid })
    assert.equal(s.pockets[0].uid, card.uid)
    assert.equal(bossActiveRow(s, 0)[0].uid, replacement.uid)
    assert.equal(s.deck.length, before.deck.length - 1)
    assert.deepEqual(s.turns, before.turns)
    assert.deepEqual(s.hands, before.hands)
    assert.deepEqual(s.playerTools, before.playerTools)
    assert.deepEqual(step(s, { type: 'undo' }).pockets, [null, null])
    assertPhysicalCards(s)
    const second = bossActiveRow(s, 0)[1], deck = s.deck
    s = step(JSON.parse(JSON.stringify(s)), { type: 'pocket', seat: 0, uid: second.uid })
    assert.equal(bossActiveRow(s, 0)[1].uid, card.uid)
    assert.equal(s.pockets[0].uid, second.uid)
    assert.deepEqual(s.deck, deck)
    assert.deepEqual(s.turns, before.turns)
    assertPhysicalCards(s)
    s = step(s, { type: 'pick', seat: 0, uid: card.uid })
    assert.equal(s.hands[0][0].uid, card.uid)
    assert.equal(s.turns.includes(0), false)
    assert.equal(step(s, { type: 'pocket', seat: 0, uid: bossActiveRow(s, 0)[0].uid }), s)
    s = step(s, { type: 'pick', seat: 1, uid: bossActiveRow(s, 1)[0].uid })
    assert.equal(bossPocketWindow(s, 0), 'pack')
    const leftover = bossActiveRow(s, 0)[0]
    s = step(s, { type: 'pocket', seat: 0, uid: leftover.uid })
    assert.equal(s.pockets[0].uid, leftover.uid)
    assert.equal(bossActiveRow(s, 0).some(c => c.uid === second.uid), true)
    s = step(s, { type: 'collect' })
    assert.equal(s.absorbed.some(c => c.uid === leftover.uid), false)
    assert.equal(s.discard.some(c => c.uid === leftover.uid), false)
    assert.equal(step(s, { type: 'pocket', seat: 0, uid: s.hands[0][0].uid }), s)
    assertPhysicalCards(s)
    assert.deepEqual(step(s, { type: 'restart' }).pockets, [null, null])
  }
})

test('empty final Pockets draw hand replacements, and empty-deck or disabled exchanges cannot destroy a card', () => {
  for (const options of Object.values(BOSS_PRESETS)) {
    let boundary
    finishDraft(start({ options }), s => { if (s.phase === 'collected' && s.pack === options.rounds) boundary = s })
    const old = boundary.hands[1][0], drawn = boundary.deck[0]
    const s = step(boundary, { type: 'pocket', seat: 1, uid: old.uid })
    assert.equal(s.pockets[1].uid, old.uid)
    assert.equal(s.hands[1][0].uid, drawn.uid)
    assert.equal(s.deck.length, boundary.deck.length - 1)
    assertPhysicalCards(s)
    const emptyDeck = { ...boundary, deck: [] }
    assert.equal(step(emptyDeck, { type: 'pocket', seat: 1, uid: old.uid }), emptyDeck)
    const disabled = { ...boundary, options: { ...options, pockets: false } }
    assert.equal(step(disabled, { type: 'pocket', seat: 1, uid: old.uid }), disabled)
    const heldWithoutDeck = { ...s, deck: [] }
    const swapped = step(heldWithoutDeck, { type: 'pocket', seat: 1, uid: drawn.uid })
    assert.equal(swapped.hands[1][0].uid, old.uid)
    assert.deepEqual(swapped.deck, [])
  }
})

test('legacy saves keep unused Pocket cards but never duplicate a previously spent Pocket', () => {
  for (const used of [false, true]) {
    let s = start()
    const old = s.row[0]
    s = step(s, { type: 'pick', uid: old.uid })
    delete s.pocketMode
    s.pockets = [old, null]
    s.pocketUsed = [used, false]
    if (!used) s.hands[0] = [] // Old starting Pocket remained outside the hand.
    assert.equal(bossPocketCard(s, 0)?.uid ?? null, used ? null : old.uid)
    s = step(s, { type: 'pick', uid: s.row[0].uid })
    const reserve = s.row[0], drawn = s.deck[0], beforeDeck = s.deck.length
    s = step(s, { type: 'pocket', seat: 0, uid: reserve.uid })
    assert.equal(s.pockets[0].uid, reserve.uid)
    assert.equal(s.row[0].uid, used ? drawn.uid : old.uid)
    assert.equal(s.deck.length, beforeDeck - Number(used))
    assertPhysicalCards(s)
  }
})

test('both draft modes freely exchange only this rounds latest picks until absorption, preserving charges and reload/undo', () => {
  for (const preset of Object.values(BOSS_PRESETS)) {
    let s = start({ options: { ...preset, swap: false }, testMode: true })
    assert.equal(bossCanSwitchLatest(s), false)
    s = step(s, { type: 'pick', uid: bossActiveRow(s)[0].uid })
    assert.equal(step(s, { type: 'switch-latest' }), s)
    s = step(s, { type: 'pick', uid: bossActiveRow(s)[0].uid })
    const before = JSON.parse(JSON.stringify(s)), latest = [...s.latestPicks]
    assert.equal(bossCanSwitchLatest(s), true)
    s = step(JSON.parse(JSON.stringify(s)), { type: 'switch-latest' })
    assert.deepEqual(s.hands.map(h => h.at(-1).uid), latest.toReversed())
    assert.deepEqual(s.playerTools, before.playerTools)
    assert.deepEqual(s.turns, before.turns)
    assert.deepEqual(bossDraftRows(s), bossDraftRows(before))
    assertPhysicalCards(s)
    assert.deepEqual(step(s, { type: 'undo' }).hands, before.hands)
    s = step(s, { type: 'switch-latest' })
    assert.deepEqual(s.hands, before.hands)
    s = step(s, { type: 'collect' })
    assert.equal(bossCanSwitchLatest(s), false)
    assert.equal(step(s, { type: 'switch-latest' }), s)
    s = step(s, { type: 'next' })
    assert.deepEqual(s.latestPicks, [null, null])
    assert.equal(step(s, { type: 'switch-latest' }), s)
    const older = s.hands.map(h => h[0].uid)
    while (s.phase === 'draft') s = step(s, { type: 'pick', uid: bossActiveRow(s)[0].uid })
    s = step(s, { type: 'switch-latest' })
    assert.deepEqual(s.hands.map(h => h[0].uid), older)
    assertPhysicalCards(s)
  }
})

test('free exchange preserves the reserved Pocket and only switches the last borrowed pick, never a skipped round', () => {
  for (const preset of Object.values(BOSS_PRESETS)) {
    let s = start({ options: preset })
    s = step(s, { type: 'double', seat: 0 })
    while (s.phase === 'draft') s = step(s, { type: 'pick', uid: bossActiveRow(s)[0].uid })
    const first = s.hands[0][0].uid, last = s.hands[0].at(-1).uid
    assert.equal(s.latestPicks[0], last)
    const reserve = bossActiveRow(s, 0)[0]
    s = step(s, { type: 'pocket', seat: 0, uid: reserve.uid })
    assert.equal(s.latestPicks[0], last)
    s = step(s, { type: 'switch-latest' })
    assert.equal(s.hands[0][0].uid, first)
    assert.equal(s.hands[1].at(-1).uid, last)
    assert.equal(s.pockets[0].uid, reserve.uid)
    assertPhysicalCards(s)
    s = step(step(s, { type: 'collect' }), { type: 'next' })
    while (s.phase === 'draft') s = step(s, { type: 'pick', uid: bossActiveRow(s)[0].uid })
    assert.equal(bossCanSwitchLatest(s), false)
    assert.equal(step(s, { type: 'switch-latest' }), s)
  }
})

test('shared personal tools respect pick order and migrate legacy shared charges without restoring spent powers', () => {
  let s = start()
  assert.equal(step(s, { type: 'pocket', seat: 1 }), s)
  assert.equal(step(s, { type: 'pick', seat: 1, uid: s.row[0].uid }), s)
  delete s.personalTools
  s.tools = { refresh: 0, swap: 1, double: 1 }
  for (const seat of [0, 1]) assert.equal(bossToolCharges(s, seat).refresh, 0)
  s = step(s, { type: 'double', seat: 1 })
  assert.deepEqual(s.turns, [1, 0, 1])
  assert.equal(bossToolCharges(s, 1).double, 0)
  assert.equal(bossToolCharges(s, 0).double, 1)
  for (const seat of [0, 1]) assert.equal(bossToolCharges(s, seat).refresh, 0)
})

test('new default gives each player an independent four-card pack and absorbs every leftover', () => {
  for (const b of BOSSES) {
    let s = step(createBossRun({ seed: 44, bossId: b.id }), { type: 'start' })
    assert.equal(bossOptions(s).weakerBonus, false)
    assert.deepEqual(s.rows.map(r => r.length), [4, 4])
    assert.equal(step(s, { type: 'pick', seat: 0, uid: s.rows[1][0].uid }), s)
    s = step(s, { type: 'pick', uid: s.rows[0][0].uid })
    assert.deepEqual(s.rows.map(r => r.length), [3, 4])
    assert.equal(step(s, { type: 'refresh', seat: 1, uid: s.rows[0][0].uid }), s)
    s = finishDraft(s, assertPhysicalCards)
    assert.deepEqual(s.hands.map(h => h.length), [5, 5])
    assert.equal(s.absorbed.length, 30)
    assert.equal(s.discard.length, 0)
    assertPhysicalCards(s)
    const result = resolveBossBattle(s)
    assert.equal(result.weakerBonus, 0)
    assert.equal(result.teamPower, result.heroes[0].score + result.heroes[1].score)
  }
})

test('separate players pick in either order each round; only both finished allows collection', () => {
  for (const rounds of [4, 5]) {
    let s = start({ options: { ...BOSS_PRESETS.separate, rounds } })
    for (let round = 1; round <= rounds; round++) {
      const first = round % 2 ? 1 : 0, second = 1 - first
      const a = s.rows[first][0], b = s.rows[second][0]
      s = step(s, { type: 'pick', uid: a.uid })
      assert.equal(s.hands[first].at(-1).uid, a.uid)
      assert.equal(s.phase, 'draft')
      assert.deepEqual(s.turns, [second])
      assert.equal(step(s, { type: 'collect' }), s)
      assert.equal(step(s, { type: 'pick', uid: s.rows[first][0].uid }), s)
      s = JSON.parse(JSON.stringify(s))
      s = step(s, { type: 'pick', seat: second, uid: b.uid })
      assert.equal(s.hands[second].at(-1).uid, b.uid)
      assert.equal(s.phase, 'collect')
      assertPhysicalCards(s)
      s = step(step(s, { type: 'collect' }), { type: 'next' })
    }
    assert.equal(s.phase, 'prepare')
    assert.deepEqual(s.hands.map(h => h.length), [rounds, rounds])
    assert.equal(s.absorbed.length, rounds * 6)
  }
})

test('either separate player can use tools before the other picks, with per-seat debt and undo', () => {
  let s = start({ options: BOSS_PRESETS.separate, testMode: true })
  const old = s.rows[1][0], replacement = s.deck[0]
  s = step(s, { type: 'refresh', uid: old.uid })
  assert.equal(s.rows[1][0].uid, replacement.uid)
  assert.equal(s.rows[0].length, 4)
  const refreshed = s
  s = step(s, { type: 'double', seat: 1 })
  assert.equal(s.turns.filter(i => i === 1).length, 2)
  const reserve = s.rows[1][0]
  s = step(s, { type: 'pocket', seat: 1, uid: reserve.uid })
  assert.equal(s.pockets[1].uid, reserve.uid)
  assert.deepEqual(s.hands.map(h => h.length), [0, 0])
  s = step(s, { type: 'pick', seat: 1, uid: s.rows[1][0].uid })
  assert.equal(s.hands[0].length, 0)
  s = step(s, { type: 'pick', seat: 0, uid: s.rows[0][0].uid })
  assert.equal(s.phase, 'draft')
  const beforeLast = JSON.parse(JSON.stringify(s))
  s = step(s, { type: 'pick', seat: 1, uid: s.rows[1][0].uid })
  assert.equal(s.phase, 'collect')
  const undone = step(JSON.parse(JSON.stringify(s)), { type: 'undo' })
  assert.deepEqual(undone.turns, beforeLast.turns)
  assert.deepEqual(undone.hands, beforeLast.hands)
  s = step(step(s, { type: 'collect' }), { type: 'next' })
  assert.deepEqual(s.turns, [0])
  assert.equal(step(s, { type: 'pocket', seat: 1 }), s)
  assert.equal(step(s, { type: 'pick', seat: 1, uid: s.rows[1][0].uid }), s)
  s = finishDraft(s, assertPhysicalCards)
  assert.deepEqual(s.hands.map(h => h.length), [5, 5])
  assertPhysicalCards(s)
  // Without another pick in between, the other player's entire tool use undoes.
  assert.equal(bossToolCharges(step(refreshed, { type: 'undo' }), 1).refresh, 1)
})

test('mixed options preserve four/five-card budgets, own-pack tools, filters and physical cards', () => {
  for (const rounds of [4, 5]) for (const absorption of ['all', 'boss']) for (const boss of BOSSES) for (const seat of [0, 1]) {
    let s = start({ bossId: boss.id, options: { ...BOSS_PRESETS.separate, rounds, absorption } })
    if (seat) s = step(s, { type: 'pick', uid: bossActiveRow(s)[0].uid })
    s = step(s, { type: 'refresh', uid: bossActiveRow(s)[0].uid })
    s = step(s, { type: 'double' })
    s = step(s, { type: 'pocket', uid: bossActiveRow(s)[0].uid })
    s = finishDraft(s, assertPhysicalCards)
    assert.deepEqual(s.hands.map(h => h.length), [rounds, rounds])
    assertPhysicalCards(s)
    if (absorption === 'boss' && boss.filter !== 'random') assert.ok(s.absorbed.every(c => matchesBossFilter(c, boss.filter)))
    if (absorption === 'boss' && boss.filter === 'random') assert.equal(s.absorbed.length, rounds * 2)
    assert.equal(step(s, { type: 'double' }), s)
  }
})

test('disabled draft tools are enforced in the reducer and legacy saves retain original scoring', () => {
  let s = start({ options: { ...BOSS_PRESETS.separate, pockets: false, refresh: false, double: false, swap: false } })
  for (const type of ['pocket', 'double', 'refresh']) assert.equal(step(s, { type, uid: bossActiveRow(s)[0].uid }), s)
  s = step(s, { type: 'pick', uid: bossActiveRow(s)[0].uid })
  s = step(s, { type: 'pick', uid: bossActiveRow(s)[0].uid })
  s = step(step(s, { type: 'collect' }), { type: 'next' })
  assert.equal(step(s, { type: 'swap', a: s.hands[0][0].uid, b: s.hands[1][0].uid }), s)
  s = finishDraft(start())
  delete s.options; delete s.rows; delete s.draftStart; delete s.prepStart; delete s.history
  assert.deepEqual(bossOptions(s), BOSS_PRESETS.original)
  const r = resolveBossBattle(s)
  assert.equal(r.weakerBonus, Math.min(...r.heroes.map(h => h.score)))
  assert.deepEqual(step(s, { type: 'replay-prep' }).prep, s.prep)
})

test('restart repeats the deal, options redraft safely, prep replay restores shared draws and ready flags', () => {
  let s = start({ options: BOSS_PRESETS.separate, testMode: true })
  for (let seed = 1; !bossActiveRow(s).some(c => c.id === 'draw_2_extra'); seed++) s = start({ seed, options: BOSS_PRESETS.separate, testMode: true })
  const original = JSON.parse(JSON.stringify(s))
  s = step(s, { type: 'refresh', uid: bossActiveRow(s).find(c => c.id !== 'draw_2_extra').uid })
  s = step(s, { type: 'pick', uid: bossActiveRow(s).find(c => c.id === 'draw_2_extra').uid })
  s = finishDraft(s)
  const beforePrep = JSON.parse(JSON.stringify(s))
  // A real shared-deck draw must be restored, including the same future draw.
  const drawCard = s.prep.playerHand.find(c => c.id === 'draw_2_extra')
  const draw = getPreparationActions(s.prep, 'player').find(a => a.sourceUid === drawCard.uid && a.type === 'prepare')
  s = step(s, { type: 'prepare', action: draw })
  assert.equal(s.prep.deck.length, beforePrep.prep.deck.length - 2)
  s = readyHand(s, 0)
  s = readyHand(s, 1)
  s = JSON.parse(JSON.stringify(s))
  const replay = step(s, { type: 'replay-prep' })
  assert.deepEqual(replay.prep, beforePrep.prep)
  assert.deepEqual(replay.absorbed, beforePrep.absorbed)
  assert.deepEqual(replay.cleared, beforePrep.cleared)
  assert.deepEqual(replay.types, [null, null])
  assert.equal(replay.phase, 'prepare')
  assert.equal(replay.result, null)
  const restarted = step(s, { type: 'restart' })
  assert.deepEqual(restarted.rows, original.rows)
  assert.deepEqual(restarted.deck, original.deck)
  assert.deepEqual(restarted.tools, original.tools)
  assertPhysicalCards(restarted)
  const configured = step(s, { type: 'options', options: BOSS_PRESETS.original })
  assert.equal(configured.phase, 'setup')
  assert.equal(configured.seed, original.seed)
  assert.deepEqual(configured.options, BOSS_PRESETS.original)
  assert.deepEqual(step(configured, { type: 'start' }).row.length, 5)
})

test('test-mode undo survives reload, shortcuts preserve real picks and can restore draft/prep', () => {
  let s = start({ options: BOSS_PRESETS.separate })
  assert.equal(step(s, { type: 'jump-prep' }), s)
  assert.equal(step(s, { type: 'undo' }), s)
  s = step(s, { type: 'test-mode', enabled: true })
  const first = bossActiveRow(s)[2]
  s = step(s, { type: 'pick', uid: first.uid })
  let undone = step(JSON.parse(JSON.stringify(s)), { type: 'undo' })
  assert.equal(undone.hands[0].length, 0)
  assert.equal(bossActiveRow(undone)[2].uid, first.uid)
  const jumped = step(s, { type: 'jump-prep' })
  assert.equal(jumped.phase, 'prepare')
  assert.equal(jumped.prep.playerHand[0].uid, first.uid)
  assertPhysicalCards(jumped)
  undone = step(jumped, { type: 'undo' })
  assert.equal(undone.phase, 'draft')
  assert.equal(undone.hands[0][0].uid, first.uid)
  const draft = step(jumped, { type: 'replay-draft' })
  assert.equal(draft.phase, 'draft')
  assert.deepEqual(draft.hands, [[], []])
  assertPhysicalCards(draft)
})

test('separate players each get all powers; own-pack Refresh and both borrowed picks stay independent', () => {
  for (const rounds of [4, 5]) {
    let s = start({ options: { ...BOSS_PRESETS.separate, rounds }, testMode: true })
    const fresh = { refresh: 1, swap: 1, double: 1 }
    for (const seat of [0, 1]) assert.deepEqual(bossToolCharges(s, seat), fresh)
    assert.equal(step(s, { type: 'refresh', seat: 0, uid: s.rows[1][0].uid }), s)
    for (const seat of [1, 0]) {
      const otherRow = s.rows[1 - seat], replacement = s.deck[0]
      s = step(s, { type: 'refresh', seat, uid: s.rows[seat][0].uid })
      assert.equal(s.rows[seat][0].uid, replacement.uid)
      assert.deepEqual(s.rows[1 - seat], otherRow)
      assert.equal(bossToolCharges(s, seat).refresh, 0)
      assert.equal(step(s, { type: 'refresh', seat, uid: s.rows[seat][0].uid }), s)
      if (seat === 1) assert.deepEqual(bossToolCharges(s, 0), fresh)
    }
    s = step(s, { type: 'double', seat: 0 })
    assert.equal(bossToolCharges(s, 1).double, 1)
    const beforeSecond = JSON.parse(JSON.stringify(s))
    s = step(s, { type: 'double', seat: 1 })
    assert.deepEqual(s.debt, [true, true])
    assert.equal(s.turns.length, 4)
    assert.deepEqual(bossToolCharges(step(JSON.parse(JSON.stringify(s)), { type: 'undo' }), 1), bossToolCharges(beforeSecond, 1))
    for (const seat of [1, 0]) {
      const reserve = s.rows[seat][0]
      s = step(s, { type: 'pocket', seat, uid: reserve.uid })
      assert.equal(s.pockets[seat].uid, reserve.uid)
      s = step(s, { type: 'pick', seat, uid: s.rows[seat][0].uid })
      s = step(s, { type: 'pick', seat, uid: s.rows[seat][0].uid })
      assert.equal(s.hands[seat].length, 2)
    }
    assert.equal(s.phase, 'collect')
    const beforeSwaps = JSON.parse(JSON.stringify(s.hands))
    for (const seat of [1, 0]) {
      s = step(JSON.parse(JSON.stringify(s)), { type: 'swap', seat, a: s.hands[0][0].uid, b: s.hands[1][0].uid })
      assert.equal(bossToolCharges(s, seat).swap, 0)
      assert.equal(step(s, { type: 'swap', seat, a: s.hands[0][0].uid, b: s.hands[1][0].uid }), s)
      if (seat === 1) assert.equal(bossToolCharges(s, 0).swap, 1)
      assertPhysicalCards(s)
    }
    assert.deepEqual(s.hands, beforeSwaps)
    s = step(step(s, { type: 'collect' }), { type: 'next' })
    assert.equal(s.phase, 'collect') // Both players pass their second round.
    assert.deepEqual(s.turns, [])
    assert.deepEqual(s.hands.map(h => h.length), [2, 2])
    s = finishDraft(s, assertPhysicalCards)
    assert.deepEqual(s.hands.map(h => h.length), [rounds, rounds])
    for (const seat of [0, 1]) assert.deepEqual(bossToolCharges(s, seat), { refresh: 0, swap: 0, double: 0 })
    const restarted = step(s, { type: 'restart' })
    for (const seat of [0, 1]) assert.deepEqual(bossToolCharges(restarted, seat), fresh)
    assertPhysicalCards(restarted)
  }
})

test('old separate saves preserve spent shared charges and materialize personal remaining charges', () => {
  let s = start({ options: BOSS_PRESETS.separate })
  delete s.playerTools
  s.tools = { refresh: 0, swap: 1, double: 0 }
  for (const seat of [0, 1]) assert.deepEqual(bossToolCharges(s, seat), s.tools)
  s = step(s, { type: 'pick', seat: 0, uid: s.rows[0][0].uid })
  s = step(s, { type: 'pick', seat: 1, uid: s.rows[1][0].uid })
  s = step(s, { type: 'swap', seat: 1, a: s.hands[0][0].uid, b: s.hands[1][0].uid })
  assert.equal(bossToolCharges(s, 0).swap, 1)
  assert.equal(bossToolCharges(s, 1).swap, 0)
  for (const seat of [0, 1]) assert.equal(bossToolCharges(s, seat).refresh, 0)
})

function prepFixture(playerIds, opponentIds) {
  const s = createBossRun({ seed: 771, options: { ...BOSS_PRESETS.separate, rounds: 4 }, testMode: true })
  const deck = [...s.deck]
  const take = id => {
    const index = deck.findIndex(c => c.id === id)
    assert.ok(index >= 0, id)
    return deck.splice(index, 1)[0]
  }
  const hands = [playerIds.map(take), opponentIds.map(take)]
  return step({ ...s, phase: 'prepare', hands, deck,
    prep: createPreparationState({ mode: '20cards', playerHand: hands[0], opponentHand: hands[1], deck }) }, { type: 'replay-prep' })
}
function prepareCard(s, seat, id, targetUid) {
  const side = seat ? 'opponent' : 'player'
  const action = getPreparationActions(s.prep, side).find(a => a.type === 'prepare' && a.cardId === id && (targetUid === undefined || a.targetUid === targetUid))
  assert.ok(action, `${seat}: ${id}`)
  return step(s, { type: 'prepare', seat, action })
}
function assertPrepPhysical(s) {
  const all = [...s.prep.playerHand, ...s.prep.opponentHand, ...s.prep.deck, ...s.prep.playerDiscard,
    ...s.absorbed, ...s.refreshed, ...[0, 1].map(i => bossPocketCard(s, i)).filter(Boolean)]
  assert.equal(all.length, 73)
  assert.equal(new Set(all.map(c => c.uid)).size, 73)
  assert.deepEqual(s.prep.playerDiscard, s.prep.opponentDiscard)
}

test('Player 2 prepares and readies first while Player 1 is unfinished, with one atomic shared draw deck', () => {
  let s = prepFixture(['draw_2_discard_2', 'copy_card_in_hand', 'robot1', 'robot_attack'], ['draw_2_extra', 'discard_for_damage', 'recycle_card', 'dragon1'])
  const original = s, draws = s.prep.deck.slice(0, 4)
  s = prepareCard(s, 1, 'draw_2_extra')
  assert.deepEqual(s.prep.playerHand, original.prep.playerHand)
  assert.deepEqual(s.prep.opponentHand.slice(-2), draws.slice(0, 2))
  const faction = getTabletopProfile(s.prep.opponentHand).types[0]
  s = step(s, { type: 'faction', seat: 1, faction })
  s = prepareCard(s, 0, 'draw_2_discard_2')
  assert.deepEqual(s.prep.playerHand.slice(-2), draws.slice(2, 4))
  assert.equal(s.types[1], faction)
  s = readyHand(s, 1)
  assert.equal(s.phase, 'prepare')
  assert.equal(s.prep.opponentFinished, true)
  assert.equal(s.prep.playerFinished, false)
  assert.equal(step(s, { type: 'prepare', seat: 0, action: { type: 'finish-preparation' } }), s)
  assert.equal(step(s, { type: 'faction', seat: 1, faction }), s)
  while (s.prep.playerPendingDiscard) s = step(s, { type: 'prepare', seat: 0, action: getPreparationActions(s.prep, 'player')[0] })
  s = readyHand(s, 0)
  assert.equal(s.phase, 'result')
  assert.deepEqual(s.result, resolveBossBattle(s))
  assertPrepPhysical(s)
  const replay = step(s, { type: 'replay-prep' })
  assert.deepEqual(replay.prep, original.prep)
})

test('both hands hold independent pending discards across reload; cancelling and Recycle never alter the other debt', () => {
  let s = prepFixture(['draw_2_discard_2', 'copy_card_in_hand', 'robot1', 'robot_attack'], ['draw_2_extra', 'discard_for_damage', 'recycle_card', 'dragon1'])
  const source = s.prep.opponentHand.find(c => c.id === 'discard_for_damage')
  s = { ...s, prep: { ...s.prep, opponentHand: s.prep.opponentHand.map(c => c.uid === source.uid ? { ...c, sacrificedPower: 3 } : c) } }
  s = prepareCard(s, 1, 'discard_for_damage')
  s = prepareCard(s, 0, 'draw_2_discard_2')
  s = JSON.parse(JSON.stringify(s))
  assert.equal(s.prep.playerPendingDiscard.remaining, 2)
  assert.equal(s.prep.opponentPendingDiscard.remaining, null)
  s = step(s, { type: 'cancel-sacrifice', seat: 1 })
  assert.equal(s.prep.opponentPendingDiscard, null)
  assert.equal(s.prep.opponentHand.find(c => c.uid === source.uid).sacrificedPower, 3)
  assert.equal(s.prep.playerPendingDiscard.remaining, 2)
  const discard = getPreparationActions(s.prep, 'player').find(a => a.type === 'discard-preparation' && a.targetUid !== s.prep.playerPendingDiscard.sourceUid)
  s = step(s, { type: 'prepare', seat: 0, action: discard })
  const recycle = getPreparationActions(s.prep, 'opponent').find(a => a.cardId === 'recycle_card' && a.targetUid === discard.targetUid)
  s = step(s, { type: 'prepare', seat: 1, action: recycle })
  assert.equal(s.prep.opponentHand.some(c => c.uid === discard.targetUid), true)
  assert.equal(s.prep.playerPendingDiscard.remaining, 1)
  assert.equal(s.prep.playerDiscard.some(c => c.uid === discard.targetUid), false)
  assert.equal(step(s, { type: 'prepare', seat: 1, action: recycle }), s)
  assertPrepPhysical(s)
})

test('Copy and faction choices act on their own seat regardless of focus, and either Ready order resolves once', () => {
  for (const order of [[1, 0], [0, 1]]) {
    let s = prepFixture(['copy_card_in_hand', 'robot1', 'robot_attack', 'critter1'], ['draw_2_extra', 'discard_for_damage', 'recycle_card', 'dragon1'])
    s = prepareCard(s, 1, 'draw_2_extra')
    assert.equal(s.activeSeat, 1)
    const faction = getTabletopProfile(s.prep.opponentHand).types[0]
    s = step(s, { type: 'faction', seat: 1, faction })
    const robot = s.prep.playerHand.find(c => c.id === 'robot1')
    s = prepareCard(s, 0, 'copy_card_in_hand', robot.uid)
    assert.equal(s.prep.playerHand.filter(c => c.id === 'robot1').length, 2)
    assert.equal(s.types[1], faction)
    assertPrepPhysical(s)
    for (const seat of order) s = readyHand(s, seat)
    assert.equal(s.phase, 'result')
    assert.deepEqual(s.result, resolveBossBattle(s))
    assert.equal(step(s, { type: 'prepare', seat: 1, action: { type: 'finish-preparation' } }), s)
  }
})

test('each hand must choose its own eligible damage type before Ready when there is a choice', () => {
  let s = prepFixture(['copy_card_in_hand', 'robot1', 'robot_attack', 'critter1'], ['draw_2_extra', 'discard_for_damage', 'recycle_card', 'dragon1'])
  assert.ok(getTabletopProfile(s.prep.opponentHand).types.length > 1)
  assert.equal(step(s, { type: 'prepare', seat: 1, action: { type: 'finish-preparation' } }), s)
  s = step(s, { type: 'faction', seat: 1, faction: getTabletopProfile(s.prep.opponentHand).types[0] })
  assert.equal(s.activeSeat, 1)
  s = readyHand(s, 1)
  assert.equal(s.prep.opponentFinished, true)
  assert.equal(s.prep.playerFinished, false)
  assert.equal(s.types[0], null)
  s = readyHand(s, 0)
  assert.equal(s.phase, 'result')
})

test('after the last pick, Refresh and Pocket change leftovers, and 2-now borrows without altering hand budgets', () => {
  for (const rounds of [4, 5]) {
    let s = start({ options: { ...BOSS_PRESETS.separate, rounds } })
    s = step(s, { type: 'pick', seat: 0, uid: s.rows[0][0].uid })
    s = step(s, { type: 'pick', seat: 1, uid: s.rows[1][0].uid })
    assert.equal(s.phase, 'collect')
    s = step(s, { type: 'refresh', seat: 0, uid: s.rows[0][0].uid })
    assert.equal(bossToolCharges(s, 0).refresh, 0)
    s = step(s, { type: 'double', seat: 0 })
    assert.equal(s.phase, 'draft')
    assert.deepEqual(s.turns, [0])
    s = step(s, { type: 'pick', seat: 0, uid: s.rows[0][0].uid })
    const old = s.rows[0][0], hands = s.hands
    s = step(s, { type: 'pocket', seat: 0, uid: old.uid })
    assert.equal(s.pockets[0].uid, old.uid)
    assert.equal(s.rows[0].some(c => c.uid === old.uid), false)
    assert.deepEqual(s.hands, hands)
    assert.deepEqual(s.hands.map(h => h.length), [2, 1])
    assertPhysicalCards(s)
    s = step(step(s, { type: 'collect' }), { type: 'next' })
    assert.deepEqual(s.turns, [1])
    s = finishDraft(s, assertPhysicalCards)
    assert.deepEqual(s.hands.map(h => h.length), [rounds, rounds])
    assertPrepPhysical(s)
  }
})

test('final Pocket exchanges replace only the owners hand before prep and remain outside combat and prep actions', () => {
  for (const options of Object.values(BOSS_PRESETS)) {
    let s = start({ options, testMode: true })
    const reserve = bossActiveRow(s)[0]
    s = step(s, { type: 'pocket', uid: reserve.uid })
    let boundary
    finishDraft(s, before => { if (before.phase === 'collected' && before.pack === options.rounds) boundary = before })
    s = JSON.parse(JSON.stringify(boundary))
    const before = s, old = s.hands[0][0], deck = s.deck
    assert.equal(bossPocketWindow(s, 0), 'hand')
    assert.equal(step(s, { type: 'pocket', seat: 0, uid: s.hands[1][0].uid }), s)
    s = step(s, { type: 'pocket', seat: 0, uid: old.uid })
    assert.equal(s.hands[0][0].uid, reserve.uid)
    assert.equal(s.pockets[0].uid, old.uid)
    assert.deepEqual(s.hands[1], before.hands[1])
    assert.deepEqual(s.deck, deck)
    assert.deepEqual(s.discard, before.discard)
    assertPhysicalCards(s)
    assert.deepEqual(step(s, { type: 'undo' }).pockets, before.pockets)
    s = step(s, { type: 'next' })
    assert.equal(s.prep.playerHand[0].uid, reserve.uid)
    assert.equal(bossPocketWindow(s, 0), null)
    assert.equal(step(s, { type: 'pocket', seat: 0, uid: reserve.uid }), s)
    assertPrepPhysical(s)
    assert.deepEqual(step(s, { type: 'replay-prep' }).pockets, s.pockets)
  }
})

test('prep Swap moves actual prepared cards and their activation history, reopens both hands and clears both type choices', () => {
  let s = prepFixture(['draw_2_extra', 'robot1', 'robot_attack', 'critter1'], ['copy_card_in_hand', 'discard_for_damage', 'recycle_card', 'dragon1'])
  const original = JSON.parse(JSON.stringify(s))
  s = prepareCard(s, 0, 'draw_2_extra')
  s = readyHand(s, 0)
  const a = s.prep.playerHand.find(c => c.id === 'draw_2_extra'), b = s.prep.opponentHand.find(c => c.id === 'dragon1')
  const beforeDeck = s.prep.deck
  s = step(s, { type: 'swap', seat: 1, a: a.uid, b: b.uid })
  assert.equal(s.prep.playerHand.some(c => c.uid === b.uid), true)
  assert.equal(s.prep.opponentHand.some(c => c.uid === a.uid), true)
  assert.equal(s.prep.opponentActivated.includes(a.uid), true)
  assert.equal(s.prep.playerActivated.includes(a.uid), false)
  assert.equal(getPreparationActions(s.prep, 'opponent').some(a => a.type === 'prepare' && a.sourceUid === s.prep.opponentHand.find(c => c.id === 'draw_2_extra').uid), false)
  assert.equal(s.prep.playerFinished, false)
  assert.equal(s.prep.opponentFinished, false)
  assert.deepEqual(s.types, [null, null])
  assert.deepEqual(s.prep.deck, beforeDeck)
  assert.equal(bossToolCharges(s, 0).swap, 1)
  assert.equal(bossToolCharges(s, 1).swap, 0)
  assertPrepPhysical(s)
  const replay = step(s, { type: 'replay-prep' })
  assert.deepEqual(replay.prep, original.prep)
  assert.equal(bossToolCharges(replay, 1).swap, 1)
})

test('hand-changing powers preserve required discard transactions instead of invalidating their sources', () => {
  let s = prepFixture(['draw_2_discard_2', 'copy_card_in_hand', 'robot1', 'robot_attack'], ['draw_2_extra', 'discard_for_damage', 'recycle_card', 'dragon1'])
  s = prepareCard(s, 0, 'draw_2_discard_2')
  assert.equal(step(s, { type: 'swap', seat: 1, a: s.prep.playerHand[1].uid, b: s.prep.opponentHand[0].uid }), s)
  assert.equal(step(s, { type: 'pocket', seat: 0, uid: s.prep.playerHand[1].uid }), s)
  const debt = s.prep.playerPendingDiscard
  assert.equal(step(s, { type: 'pocket', seat: 1, uid: s.prep.opponentHand[0].uid }), s)
  assert.deepEqual(s.prep.playerPendingDiscard, debt)
  assertPrepPhysical(s)
})
