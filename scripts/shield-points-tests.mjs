import test from 'node:test'
import assert from 'node:assert/strict'
import { getCoreCards, getExpandedCoreDeck } from '../src/game/cards.js'
import { getTabletopProfile, scoreTabletopHand, MAIN_ABILITY_SHIELD_COST, MAIN_ABILITY_RULES } from '../src/game/tabletop.js'
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
    assert.equal(getTabletopProfile(shieldHand).neutral,points)
    const critter=scoreTabletopHand(cards('rabbit2','swarm','swarm','bite'),points,'critter')
    const robot=scoreTabletopHand(cards('robot2','robot_ulti'),points,'robot')
    const dragon=scoreTabletopHand(cards('dragon2','dragon_ulti'),points,'dragon')
    assert.equal(critter.shieldPenalty,points)
    assert.equal(robot.shieldPenalty,points)
    assert.equal(robot.bonus,3)
    assert.equal(dragon.shieldPenalty,0)
  }
  assert.equal(getTabletopProfile(cards('shield2','shield_is_dmg','shield_is_dmg')).neutral,4)
})

test('copying a Shield retains both points, and the animation counts the full card value',()=>{
  const own=cards('copy_card_in_hand','shield2','shield_is_dmg')
  const game={mode:'draft',phase:'battle-ready',playerHand:own,opponentHand:cards('robot2','robot_ulti'),deck:[],draftDiscard:[]}
  let prep=createPreparationState(game)
  const action=getPreparationActions(prep,'player').find(a=>a.type==='prepare'&&a.targetUid===own[1].uid)
  assert(action)
  prep=applyPreparationAction(prep,'player',action)
  assert.equal(getTabletopProfile(prep.playerHand).shields,4)
  assert.equal(getTabletopProfile(prep.playerHand).neutral,4)
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
  }
})
