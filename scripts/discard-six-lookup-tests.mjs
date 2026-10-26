import test from 'node:test'
import fs from 'node:fs'
import assert from 'node:assert/strict'
import {createDiscardLookupAdapter} from '../src/game/discardSixLookupCore.js'
import * as tt from '../src/game/tabletop.js'
import * as prep from '../src/game/preparationState.js'
import * as search from '../src/game/searchAi.js'
import * as rules from '../src/game/preBattle.js'
import * as cards from '../src/game/cards.js'
import * as original from '../src/game/preparedHandDistribution.js'
import * as patched from '../src/game/preparedHandDistribution.js'
const bank=JSON.parse(fs.readFileSync(new URL('../data/dan-discard-six-combat-prior.json',import.meta.url))).histogram
const pool=cards.getExpandedCoreDeck({tabletop:'abilities-main',wildDeck:false})
const stat=pool.filter(c=>c.type==='stat'),discard=pool.find(c=>c.id==='draw_all_new_1')
const profile={chanceLimit:16,maxDepth:8,maxNodes:12000,timeBudgetMs:1e12,discardAllBias:0,exactMemo:false}
const comparable=x=>({action:x.action,chosenIndex:x.chosenIndex,completedDepth:x.completedDepth,finishedTree:x.finishedTree,budgetHit:x.budgetHit,
 values:x.values.map(v=>({...v,distribution:[...v.distribution]}))})
test('discard-six prior preserves fallback cases, mass, weighted values and input privacy',()=>{
const cases=[]
for(const [label,n,withDiscard,deckSize,supported] of [['supported-six',5,true,20,true],['fallback-eight',7,true,20,false],['short-deck-fallback',5,true,3,false],['no-activation',5,false,20,false]]){
 const own=[...stat.slice(0,n-Number(withDiscard)),...(withDiscard?[discard]:[])],enemy=stat.slice(10,15)
 const known=new Set([...own,...enemy].map(c=>c.uid)),deck=stat.filter(c=>!known.has(c.uid)).slice(0,deckSize)
 const game={mode:'draft',phase:'battle-ready',playerHand:own,opponentHand:enemy,deck,draftDiscard:[]},state={game,preparation:prep.createPreparationState(game),actor:'player'}
 const before=JSON.stringify(state),adapter=createDiscardLookupAdapter(tt,bank)
 const x=patched.createDistributionPreparation({search,prep,rules,tt:adapter.tt}).choose(state,{...profile,discardAllLookup:adapter.lookup})
 assert.equal(JSON.stringify(state),before);assert.equal(x.metrics.rolloutSteps,0)
 assert.equal(adapter.metrics.lookupQueries>0,supported)
 for(const value of x.values){assert.ok(value.reward>=-1-1e-9&&value.reward<=1+1e-9);assert.ok(Math.abs([...value.distribution.values()].reduce((a,b)=>a+b.weight,0)-1)<1e-8)}
 if(!supported){const y=original.createDistributionPreparation({search,prep,rules,tt}).choose(state,profile);assert.deepEqual(comparable(x),comparable(y))}
 cases.push({label,passed:true,lookup_queries:adapter.metrics.lookupQueries,fallback_exact:!supported})
}
const adapter=createDiscardLookupAdapter(tt,bank),enemy=stat.slice(10,15),v={enemyPublicHand:enemy,unseen:stat.slice(20)},expected=adapter.outcomes.reduce((a,o)=>{const value=adapter.compare(adapter.compact(o.hand),adapter.compact(enemy));return {reward:a.reward+o.weight*value.reward,margin:a.margin+o.weight*value.margin}},{reward:0,margin:0})
const value=adapter.lookup({unknown:v.unseen,v,opponentModel:null})
assert.equal(value.reward,expected.reward);assert.equal(value.margin,expected.margin)

assert.equal(cases.length,4)
})
