import test from 'node:test'
import assert from 'node:assert/strict'
import { getCoreCards, getExpandedCoreDeck } from '../src/game/cards.js'
import { getTabletopProfile, scoreTabletopHand, MAIN_ABILITY_SHIELD_COST, MAIN_ABILITY_RULES, getShieldDamageMultiplier } from '../src/game/tabletop.js'
import { descriptor, makeAdapter } from '../src/game/felixEffects.js'
import * as tt from '../src/game/tabletop.js'
import * as catalog from '../src/game/cards.js'
import { getHeadlessSpec } from '../src/game/headlessGame.js'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { createPreparationState, getPreparationActions, applyPreparationAction } from '../src/game/preparationState.js'
import { buildTabletopResolutionPlan } from '../src/game/tabletopResolution.js'
import { resolveTabletopBattle } from '../src/game/tabletop.js'
const deck=getExpandedCoreDeck({tabletop:'abilities-main',wildDeck:false})
const cards=(...ids)=>ids.map((id,i)=>({...deck.find(c=>c.id===id),uid:id+'-points-'+i}))

test('two shield points block Critter and Robot equally and fuel Shield is Damage',()=>{
  assert.equal(MAIN_ABILITY_RULES.shieldValue,2)
  assert.deepEqual(MAIN_ABILITY_SHIELD_COST,{critter:1,robot:1,dragon:0})
  for(const count of [1,2,3]){
    const shieldHand=cards(...Array(count).fill('shield2'),'shield_is_dmg')
    const points=getTabletopProfile(shieldHand).shields
    assert.equal(points,2*count)
    assert.equal(getTabletopProfile(shieldHand).neutral,points*2)
    const critter=scoreTabletopHand(cards('rabbit2','swarm','swarm','bite'),points,'critter')
    const robot=scoreTabletopHand(cards('robot2','robot_ulti'),points,'robot')
    const dragon=scoreTabletopHand(cards('dragon2','dragon_ulti'),points,'dragon')
    assert.equal(critter.shieldPenalty,points)
    assert.equal(robot.shieldPenalty,points)
    assert.equal(robot.bonus,3)
    assert.equal(dragon.shieldPenalty,0)
  }
  assert.equal(getTabletopProfile(cards('shield2','shield_is_dmg','shield_is_dmg')).neutral,8)
})

test('copying a Shield retains both points, and the animation counts the full card value',()=>{
  const own=cards('copy_card_in_hand','shield2','shield_is_dmg')
  const game={mode:'draft',phase:'battle-ready',playerHand:own,opponentHand:cards('robot2','robot_ulti'),deck:[],draftDiscard:[]}
  let prep=createPreparationState(game)
  const action=getPreparationActions(prep,'player').find(a=>a.type==='prepare'&&a.targetUid===own[1].uid)
  assert(action)
  prep=applyPreparationAction(prep,'player',action)
  assert.equal(getTabletopProfile(prep.playerHand).shields,4)
  assert.equal(getTabletopProfile(prep.playerHand).neutral,8)
  const result=resolveTabletopBattle(prep.playerHand,game.opponentHand,{playerType:'critter',opponentType:'robot'})
  const plan=buildTabletopResolutionPlan(result)
  assert.equal(plan.opponent.shields.cost,1)
  assert.equal(Object.values(plan.opponent.shields.pointsByUid).reduce((a,b)=>a+b,0),4)
  assert.equal(plan.opponent.shields.penalty,4)
  assert.equal(plan.opponent.final.total,3)
})

test('legacy tabletop and digital shield values remain separate from the new main rule',()=>{
  assert.equal(getCoreCards().find(c=>c.id==='shield2').effect.shield,2)
  for(const rules of ['threshold','abilities-prototype']){
    const shield=getExpandedCoreDeck({tabletop:rules,wildDeck:false}).find(c=>c.id==='shield2')
    assert.equal(shield.effect.shield,1)
    assert.equal(getTabletopProfile([shield]).shields,1)
    const damage=getExpandedCoreDeck({tabletop:rules,wildDeck:false}).find(c=>c.id==='shield_is_dmg')
    assert.equal(getTabletopProfile([shield,damage]).neutral,1)
    assert.equal(descriptor(damage)[9],1)
  }
  assert.equal(getShieldDamageMultiplier(false),1)
})

test('all main rules and building modes use two neutral power per shield point',()=>{
  for(const tabletop of ['abilities-main','abilities-new-cards','monsters'])for(const mode of ['draft','five-hand-discard','6draft']){
    const deck=getExpandedCoreDeck({tabletop,mode,wildDeck:false})
    const hand=ids=>ids.map((id,i)=>({...deck.find(c=>c.id===id),uid:`${mode}-${i}`}))
    const own=hand(['shield_is_dmg','shield2','shield2'])
    const profile=getTabletopProfile(own)
    assert.equal(profile.shields,4);assert.equal(profile.neutral,8)
    assert.equal(descriptor(own[0])[9],2)
    assert.equal(scoreTabletopHand(own,3,'critter').score,5)
    assert.equal(scoreTabletopHand(own,3,'dragon').score,8)
    const result=resolveTabletopBattle(own,hand(['bite']),{playerType:'critter',opponentType:'critter'})
    const plan=buildTabletopResolutionPlan(result)
    assert.equal(plan.player.direct.find(a=>a.uid===own[0].uid).power,8)
    if(tabletop!=='abilities-main'){
      assert.equal(getTabletopProfile(hand(['shield_is_dmg','critter_shield'])).neutral,2)
    }
    if(tabletop!=='monsters'){
      makeAdapter(tt,catalog,{totalThreshold:true,dragonOnly:true,blockBonus:true},{tabletop,mode}).oracle(own,hand(['shield2']))
    }
    const version=getHeadlessSpec({tabletop,mode,wildDeck:false}).rulesVersion
    assert.match(version, /v14|v7|shield-damage2/)
  }
})

test('card print, inspect, help and copied rules show the same shield multiplier',async()=>{
  const server=await createServer({server:{middlewareMode:true},appType:'custom'})
  try{
    const {default:CardVisual}=await server.ssrLoadModule('/src/components/card/CardVisual.jsx')
    const {getCardSummary}=await server.ssrLoadModule('/src/components/card/cardMeta.js')
    const {getRulesText}=await server.ssrLoadModule('/src/components/overlay/rulesText.js')
    const {default:HelpSheet}=await server.ssrLoadModule('/src/components/overlay/HelpSheet.jsx')
    for(const rules of [false,'threshold','abilities-prototype','abilities-main','abilities-new-cards','monsters']){
      const card=getExpandedCoreDeck({tabletop:rules,wildDeck:false}).find(c=>c.id==='shield_is_dmg')
      const main=['abilities-main','abilities-new-cards','monsters'].includes(rules)
      const html=renderToStaticMarkup(createElement(CardVisual,{card}))
      assert.equal((html.match(/alt="power"/g)??[]).length,main?2:1)
      if(!main)continue
      assert.match(getCardSummary(card).text,/Adds 2 neutral power per shield point/)
      for(const mode of ['draft','five-hand-discard','6draft']){
        assert.match(getRulesText(rules,mode),/Shield is Damage adds 2 neutral power per shield point/)
        assert.match(renderToStaticMarkup(createElement(HelpSheet,{open:true,tabletop:rules,mode})),/Shield is Damage adds 2 neutral power per shield point/)
      }
    }
  }finally{await server.close()}
})
