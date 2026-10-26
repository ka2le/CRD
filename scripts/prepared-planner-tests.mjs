import test from 'node:test'
import assert from 'node:assert/strict'
import {solveTwoByTwo} from '../src/game/twoOrderPreparationCore.js'
import {createPreparedJointEvaluation} from '../src/game/preparedJointEvaluation.js'
import {getTwoOrderPreparation} from '../src/game/twoOrderPreparation.js'

test('native symmetric/asymmetric cycles use minimax probabilities; dominance stays pure',()=>{
  assert.equal(solveTwoByTwo([[1,-1],[-1,1]]).probabilityRow0,.5)
  const x=solveTwoByTwo([[1,-1],[-.5,1]])
  assert.ok(Math.abs(x.probabilityRow0-3/7)<1e-12)
  assert.equal(solveTwoByTwo([[.8,.4],[.1,-.2]]).kind,'pure')
})
test('private commitments are shared within one game but fresh across games',()=>{
  const game={}
  assert.equal(getTwoOrderPreparation(game),getTwoOrderPreparation(game))
  assert.notEqual(getTwoOrderPreparation(game),getTwoOrderPreparation({}))
  assert.notEqual(getTwoOrderPreparation(game,{actor:'player'}),getTwoOrderPreparation(game,{actor:'opponent'}))
  assert.notEqual(getTwoOrderPreparation(game,{discardSixLookup:false}),getTwoOrderPreparation(game))
})
test('zero sampled joint mass regenerates a prepared enemy on the available pool',()=>{
  let calls=0
  const game={playerHand:[{id:'own',uid:'own'}],opponentHand:[{id:'enemy',uid:'enemy'}],deck:[{id:'rare',uid:'rare'}]}
  const core={choose(state){
    calls++;assert.equal(state.actor,'opponent');assert.equal(state.game.deck.length,0)
    assert.equal(state.game.playerHand,game.playerHand)
    return {chosenIndex:0,values:[{distribution:new Map([['prepared',{hand:[{id:'prepared'}],consumed:{},weight:1}]])}]}
  }}
  const prep={createPreparationState:g=>({playerHand:g.playerHand,opponentHand:g.opponentHand,deck:g.deck})}
  const tt={chooseTabletopType:()=>null,resolveTabletopBattle(own,enemy){assert.equal(enemy[0].id,'prepared');return {winner:'tie',player:{score:7},opponent:{score:7}}}}
  const j=createPreparedJointEvaluation({core,prep,tt,profile:{}},game,'player')
  const value=j.model([{hand:[{id:'unusable'}],consumed:{rare:1},weight:1}],'fixture').evaluate([{id:'ours'}],{remaining:[]})
  assert.equal(value.reward,0);assert.equal(j.metrics.supportRepairs,1);assert.equal(calls,1)
})

// Search-only exact memoization must preserve complete distributions and budgets.
import { createDistributionPreparation } from '../src/game/preparedHandDistribution.js'
import * as exactSearch from '../src/game/searchAi.js'
import * as exactPrep from '../src/game/preparationState.js'
import * as exactRules from '../src/game/preBattle.js'
import * as exactTabletop from '../src/game/tabletop.js'
import { getCoreCards as exactCards } from '../src/game/cards.js'

test('pick5 exact memoization preserves draws, copies, recycling, distributions and node budgets', () => {
  const definitions = new Map(exactCards({ tabletop: 'abilities-main' }).map(c => [c.id, c]))
  let uid = 0
  const hand = ids => ids.map(id => exactTabletop.toTabletopCard({ ...definitions.get(id), uid: `memo-${uid++}` }, 'abilities-main'))
  const cases = [
    { own: ['robot1','robot_attack','critter1','dragon1','bite'], deck: [], discard: [] },
    { own: ['copy_card_in_hand','draw_2_extra','robot1','robot_attack','shield_is_dmg'], deck: ['dragon1','shield2','critter1','bite'], discard: [] },
    { own: ['draw_all_new_1','copy_card_in_hand','recycle_card','dragon1','dragon_ulti'], deck: ['robot1','robot_attack','bite','shield2','critter1','dragon1'], discard: ['robot_ulti','copy_card_in_hand'] },
  ]
  for (const fixture of cases) {
    const game = { mode: 'draft', playerHand: hand(fixture.own), opponentHand: hand(['dragon1','dragon2','dragon_ulti','shield2','bite']), deck: hand(fixture.deck), draftDiscard: hand(fixture.discard) }
    const state = { game, preparation: exactPrep.createPreparationState(game), actor: 'player' }, before = JSON.stringify(state)
    const core = createDistributionPreparation({ search: exactSearch, prep: exactPrep, rules: exactRules, tt: exactTabletop })
    for (const cache of [false, true]) {
      const settings = { chanceLimit: 4, maxDepth: 3, maxNodes: 1000, timeBudgetMs: 1e12, cache }
      const original = core.choose(state, { ...settings, exactMemo: false })
      const optimized = core.choose(state, { ...settings, exactMemo: true })
      for (const key of ['action','chosenIndex','baselineIndex','values','completedDepth','finishedTree','budgetHit','metrics']) assert.deepEqual(optimized[key], original[key])
      assert.deepEqual(optimized.iterations.map(({depth,frontier,nodes}) => ({depth,frontier,nodes})), original.iterations.map(({depth,frontier,nodes}) => ({depth,frontier,nodes})))
      assert.equal(JSON.stringify(state), before)
    }
  }
})
