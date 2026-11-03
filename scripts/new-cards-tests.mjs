import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { getExpandedCoreDeck, getCoreCards } from '../src/game/cards.js'
import { getHandStats } from '../src/game/engine.js'
import { getTabletopProfile, scoreTabletopHand, resolveTabletopBattle, normalizePlayableTabletopRules } from '../src/game/tabletop.js'
import { buildTabletopResolutionPlan, finalLedgerSide } from '../src/game/tabletopResolution.js'
import { applyPreparationAction, createPreparationState, getPreparationActions } from '../src/game/preparationState.js'
import { completeOpponentPreBattle } from '../src/game/preBattle.js'
import { searchPreparationDecision, searchSidePreparation, preparationView } from '../src/game/searchAi.js'
import { createHeadlessGame, stepHeadlessGame, chooseHeadlessBaselineAction, encodeObservation } from '../src/game/headlessGame.js'
const rules = 'abilities-new-cards'
let serial = 0
const catalog = getExpandedCoreDeck({ tabletop: rules })
const card = id => ({ ...catalog.find(c => c.id === id), uid: `${id}-test-${serial++}` })
const hand = (...ids) => ids.map(card)
const prep = (cards, deck = []) => createPreparationState({ playerHand: cards, opponentHand: hand('bite'), deck })
const activate = (s, id) => applyPreparationAction(s, 'player', { type: 'prepare', sourceUid: s.playerHand.find(c => c.id === id).uid })
const discard = (s, id) => applyPreparationAction(s, 'player', { type: 'discard-preparation', sourceUid: s.playerPendingDiscard.sourceUid, targetUid: s.playerHand.find(c => c.id === id).uid })
const finish = s => applyPreparationAction(s, 'player', { type: 'finish-preparation-discard', sourceUid: s.playerPendingDiscard.sourceUid })

test('new mode has four exclusive cards, one regular / three Wild copies; old decks stay intact', () => {
  assert.equal(normalizePlayableTabletopRules(rules), rules)
  assert.equal(catalog.length, 73)
  assert.equal(getExpandedCoreDeck({ tabletop: rules, wildDeck: true }).length, 109)
  const added = ['no_stats_to_2', 'draw_2_discard_2', 'shield_ulti', 'discard_for_damage']
  for (const id of added) {
    assert.equal(catalog.filter(c => c.id === id).length, 1)
    for (const mode of [false, 'abilities-main', 'threshold', 'abilities-prototype']) assert(!getCoreCards({ tabletop: mode }).some(c => c.id === id))
  }
  assert(!catalog.some(c => ['chameleon', 'shortcut', 'any_off_each', 'double_dmg'].includes(c.id)))
  assert.equal(getExpandedCoreDeck({ tabletop: 'abilities-main' }).length, 69)
})

test('3 shields block Critters and Robots, Dragons stay immune, shield damage and copies scale', () => {
  const h = hand('shield_ulti', 'shield2', 'shield_is_dmg')
  assert.equal(getTabletopProfile(h).base, 5)
  assert.equal(getTabletopProfile(h).shields, 5)
  const engine = hand('robot2', 'robot_ulti')
  assert.equal(scoreTabletopHand(engine, 3, 'robot').score, 4)
  assert.equal(scoreTabletopHand(hand('dragon2','dragon_ulti'), 3, 'dragon').score, 4)
  let s = prep(hand('shield_ulti', 'copy_card_in_hand', 'shield_is_dmg'))
  s = applyPreparationAction(s, 'player', { type:'prepare', sourceUid:s.playerHand[1].uid, targetUid:s.playerHand[0].uid })
  assert.equal(getTabletopProfile(s.playerHand).base, 6)
})

test('statless replacement is all-or-nothing, nonstacking, with normal Balance and Overwhelming', () => {
  const h = hand('no_stats_to_2','no_stats_to_2','robot_attack','robot_attack')
  assert.deepEqual(getHandStats(h), { critter:2, robot:2, dragon:2 })
  assert.equal(scoreTabletopHand(h, 0, 'robot').score, 7)
  assert.deepEqual(getHandStats([...h, card('critter1')]), { critter:1, robot:0, dragon:0 })
  const dragons = hand('no_stats_to_2','dragons_breath','dragons_breath','dragons_breath','dragons_breath')
  assert.equal(scoreTabletopHand(dragons, 99, 'dragon').score, 12)
  assert.equal(scoreTabletopHand(dragons, 0, 'dragon').stats.dragon, 3)
  const r = resolveTabletopBattle(dragons, hand('bite'), { playerType:'dragon', opponentType:'critter' })
  const plan = buildTabletopResolutionPlan(r)
  assert.equal(plan.player.stats[0].cards[0].count, 2)
  assert.equal(finalLedgerSide(plan.player).total, 12)
})

test('draw then discard is compulsory, private, allows discarding itself, and can restore Robot balance', () => {
  let s = prep(hand('robot2','robot_ulti','draw_2_discard_2'), hand('robot1','dragon1'))
  s = activate(s, 'draw_2_discard_2')
  assert.equal(s.playerHand.length, 5)
  assert.equal(s.playerDrawnCount, 2)
  assert(getPreparationActions(s).every(a => a.type === 'discard-preparation'))
  assert.throws(() => applyPreparationAction(s,'player',{type:'finish-preparation'}), /Illegal/)
  assert.equal(discard(s,'draw_2_discard_2').playerPendingDiscard.remaining, 1)
  s = discard(s,'robot1'); s = discard(s,'dragon1')
  assert.equal(s.playerPendingDiscard, null)
  assert.equal(s.playerDiscard.length, 2)
  assert.equal(scoreTabletopHand(s.playerHand,0,'robot').score, 7)
})

test('sacrifices repair Balance and statless hands; spent source cannot activate twice', () => {
  let s = prep(hand('robot2','robot1','robot_ulti','discard_for_damage'))
  s = discard(activate(s,'discard_for_damage'),'robot1')
  s = finish(s)
  assert.equal(scoreTabletopHand(s.playerHand,0,'robot').score, 8)
  assert.throws(() => activate(s,'discard_for_damage'), /Illegal/)
  s = prep(hand('no_stats_to_2','critter1','robot1','robot_attack','discard_for_damage'))
  s = discard(discard(activate(s,'discard_for_damage'),'critter1'),'robot1')
  s = finish(s)
  assert.equal(scoreTabletopHand(s.playerHand,0,'robot').score, 4)
  assert.deepEqual(getHandStats(s.playerHand), { critter:2, robot:2, dragon:2 })
})

test('Copy starts uncharged; Recycle returns sacrificed cards without losing stored power', () => {
  let s = prep(hand('discard_for_damage','robot1','copy_card_in_hand','recycle_card'))
  s = finish(discard(activate(s,'discard_for_damage'),'robot1'))
  const original = s.playerHand[0]
  s = applyPreparationAction(s,'player',{type:'prepare',sourceUid:s.playerHand.find(c=>c.id==='copy_card_in_hand').uid,targetUid:original.uid})
  const copy = s.playerHand.find(c=>c.isCopiedCard)
  assert.equal(copy.sacrificedPower, 0)
  assert.equal(original.sacrificedPower, 1)
  s = applyPreparationAction(s,'player',{type:'prepare',sourceUid:s.playerHand.find(c=>c.id==='recycle_card').uid,targetUid:s.playerDiscard[0].uid})
  assert(s.playerHand.some(c=>c.id==='robot1'))
  assert.equal(s.playerHand[0].sacrificedPower, 1)
  s = applyPreparationAction(s,'player',{type:'prepare',sourceUid:copy.uid})
  assert.equal(s.playerPendingDiscard.sourceUid, copy.uid)
})

test('exhausted decks require only available cards; zero sacrifice is legal', () => {
  let s = activate(prep(hand('draw_2_discard_2')), 'draw_2_discard_2')
  assert.equal(s.playerPendingDiscard.remaining, 1)
  s = discard(s,'draw_2_discard_2')
  assert.equal(s.playerPendingDiscard, null)
  s = activate(prep(hand('draw_2_discard_2'),hand('robot1')), 'draw_2_discard_2')
  assert.equal(s.playerPendingDiscard.remaining, 2)
  s = discard(s,'draw_2_discard_2')
  s = discard(s,'robot1')
  assert.equal(s.playerPendingDiscard,null)
  s = finish(activate(prep(hand('discard_for_damage')), 'discard_for_damage'))
  assert.equal(getTabletopProfile(s.playerHand).base,0)
})

test('baseline resolves every pending discard, including when no unused special remains', () => {
  const game = { playerHand: hand('bite'), opponentHand:hand('draw_2_discard_2','robot2','robot_ulti'),deck:hand('robot1','dragon1') }
  const s = completeOpponentPreBattle(createPreparationState(game))
  assert.equal(s.opponentPendingDiscard,null)
  assert.equal(s.opponentHand.length,3)
  assert.equal(scoreTabletopHand(s.opponentHand,0,'robot').score,7)
})

test('search carries pending choices and ignores actual hidden deck order', () => {
  const game = { mode:'draft',playerHand:hand('draw_2_discard_2','robot2','robot_ulti'), opponentHand:hand('bite'), deck:hand('robot1','dragon1','shield2','swarm'),draftDiscard:[] }
  const s = activate(createPreparationState(game),'draw_2_discard_2')
  const options = {minSamples:2,maxSamples:2,timeBudgetMs:0,seed:31,rollout:'rules'}
  const a = searchPreparationDecision(s,game,'player',options)
  const b = searchPreparationDecision({...s,deck:[...s.deck].reverse()},game,'player',options)
  assert.deepEqual(a.action,b.action)
  assert.equal(a.action.type,'discard-preparation')
  const complete = searchSidePreparation(s,game,'player',options).preparation
  assert.equal(complete.playerPendingDiscard,null)
})

test('both Draft and Discard finish with new cards, regular and Wild, and preserve scored state in observations', () => {
  for (const mode of ['draft','five-hand-discard']) for (const wildDeck of [false,true]) for (let seed=1;seed<=8;seed++) {
    let s = createHeadlessGame({mode,tabletop:rules,wildDeck,seed,control:'both'})
    let n=0
    while(!s.terminal) { assert(++n<400); s=stepHeadlessGame(s,chooseHeadlessBaselineAction(s)) }
    assert.equal(s.battleResult.player.rules,rules)
    const obs=encodeObservation(s,'player')
    for (const c of obs.playerHand) assert.equal(c.sacrificedPower,s.preparation.playerHand.find(x=>x.uid===c.uid).sacrificedPower)
  }
})

test('browser and both room seats enforce pending choices, persist them, and expose correct mode/help/bots', async () => {
  const vite=await createServer({server:{middlewareMode:true},appType:'custom'})
  try {
    const {sessionReducer}=await vite.ssrLoadModule('/src/hooks/useGameSession.js')
    const {getRulesText}=await vite.ssrLoadModule('/src/components/overlay/rulesText.js')
    const {normalizeOpponentSettings,getOpponentAiOptions}=await vite.ssrLoadModule('/src/game/opponentAi.js')
    const room=await vite.ssrLoadModule('/src/network/roomGame.js')
    assert(getRulesText(rules).includes('Abilities+NewCards'))
    assert(getRulesText(rules).includes('Draw 2 / Discard 2'))
    assert.equal(normalizeOpponentSettings({gameMode:'draft',opponentAi:'dan'},{tabletop:rules}).opponentAi,'shallow')
    assert.deepEqual(getOpponentAiOptions('five-hand-discard',rules).map(x=>x.id),['rules','shallow','search'])
    for (const seat of ['host','guest']) {
      const game={mode:'draft',phase:'battle-ready',playerHand:hand('draw_2_discard_2','robot2','robot_ulti'),opponentHand:hand('draw_2_discard_2','robot2','robot_ulti'),deck:hand('robot1','dragon1'),draftDiscard:[]}
      let s={settings:{tabletop:rules,opponentAi:'rules'},game,preBattle:createPreparationState(game),otherUi:{},battleStarted:false,dealId:1,gameSessionKey:0}
      let view=room.seatView(s,seat)
      s=room.applyRoomAction(s,seat,{type:'ACTIVATE_PLAYER_PRE_BATTLE_CARD',uid:view.preBattle.playerHand[0].uid})
      view=room.seatView(s,seat)
      assert.equal(view.preBattle.playerPendingDiscard.remaining,2)
      assert.equal(view.preBattle.opponentPendingDiscard,null)
      assert.throws(()=>room.applyRoomAction(s,seat,{type:'START_BATTLE'}),/Finish discarding/)
      assert.equal(sessionReducer(view,{type:'START_BATTLE'}),view)
      s=JSON.parse(JSON.stringify(s))
      for (const id of ['robot1','dragon1']) {
        view=room.seatView(s,seat)
        s=room.applyRoomAction(s,seat,{type:'DISCARD_PLAYER_PREPARATION_CARD',uid:view.preBattle.playerHand.find(c=>c.id===id).uid})
      }
      view=room.seatView(s,seat)
      assert.equal(view.preBattle.playerPendingDiscard,null)
      assert.equal(view.preBattle.playerDiscard.length,2)
    }
  } finally {await vite.close()}
})


test('private enemy sacrifice power does not leak into searched worlds', () => {
  const game = { mode: 'five-hand-discard', playerHand:hand('draw_2_extra','robot1'), opponentHand:hand('discard_for_damage','dragon1'), deck:hand('swarm'), playerDiscards:[], opponentDiscards:[] }
  const a = createPreparationState(game)
  const b = {...a, opponentHand:a.opponentHand.map(c => c.id === 'discard_for_damage' ? {...c,sacrificedPower:9} : c)}
  assert.deepEqual(preparationView(a,game,'player'),preparationView(b,game,'player'))
})

test('full redraw removes stored power, and recycling does not reset a used activation', () => {
  let s=prep(hand('discard_for_damage','robot1','draw_all_new_1'),hand('recycle_card','bite','shield2'))
  s=finish(discard(activate(s,'discard_for_damage'),'robot1'))
  const charged=s.playerHand.find(c=>c.id==='discard_for_damage')
  s=activate(s,'draw_all_new_1')
  assert.equal(getTabletopProfile(s.playerHand).base,2)
  s=applyPreparationAction(s,'player',{type:'prepare',sourceUid:s.playerHand[0].uid,targetUid:charged.uid})
  assert.equal(getTabletopProfile(s.playerHand).base,3)
  assert(!getPreparationActions(s).some(a=>a.type==='prepare'&&a.sourceUid===charged.uid))
})
