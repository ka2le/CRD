import test from 'node:test'
import assert from 'node:assert/strict'
import additions from '../data/new-cards.json' with { type: 'json' }
import * as cards from '../src/game/cards.js'
import * as h from '../src/game/headlessGame.js'
import * as prep from '../src/game/preparationState.js'
import * as search from '../src/game/searchAi.js'
import * as rules from '../src/game/preBattle.js'
import * as tt from '../src/game/tabletop.js'
import {expandedFelixAdapter,chooseFelixDecision} from '../src/game/felixBot.js'
import {createProbabilityPreparation} from '../src/game/probabilityPreparationCore.js'
const mode='abilities-new-cards',catalog=cards.getExpandedCoreDeck({tabletop:mode})
let serial=0
const hand=ids=>ids.map(id=>({...(catalog.find(c=>c.id===id)??{...additions.cards.find(c=>c.id===id),tabletop:mode}),uid:`fixture-${serial++}`}))

test('expanded numeric hand profiles match official passive effects and charged damage',()=>{
  const cases=[['single_faction_2','robot2','robot_attack'],['single_faction_2','dragon2','dragon_ulti'],['no_stats_to_2','robot_attack','dragon_ulti','critter_shield'],['no_stats_to_2','no_stats_to_2','single_faction_2'],['draw_2_discard_2','discard_for_damage','critter_shield'],['single_faction_2','critter1','robot1']]
  for(const ids of cases)expandedFelixAdapter.oracle(hand(ids),hand(['shield2']))
  const charged=hand(['discard_for_damage','no_stats_to_2','robot_attack']);charged[0].sacrificedPower=3
  expandedFelixAdapter.oracle(charged,hand(['critter_shield']))
  const rng=cards.createSeededRng(3199)
  for(let i=0;i<500;i++)expandedFelixAdapter.oracle(cards.shuffle(catalog,{rng}).slice(0,5),cards.shuffle(catalog,{rng}).slice(0,5))
})

test('Felix keeps neural decisions at every expanded draft pick',()=>{
  let state=h.createHeadlessGame({mode:'draft',tabletop:mode,wildDeck:false,seed:4182,control:'both'})
  while(!state.preparation){const result=chooseFelixDecision(state.game,state.actor);assert(!result.fallback);assert.equal(result.checkpointSha256,'e9b03e264b3e486fa93fb8f7a084a62b683540d405c7a57bcf8ce85d632958af');assert.equal(result.kernel,'FelixNC-neural-draft');state=h.stepHeadlessGame(state,result.action)}
})

test('planner draws real chance cards and completes compulsory pending discards',()=>{
  const game={mode:'draft',playerHand:hand(['robot2','robot_ulti','draw_2_discard_2']),opponentHand:hand(['bite']),deck:hand(['robot1','dragon1']),draftDiscard:[]}
  let p=prep.createPreparationState(game)
  const core=createProbabilityPreparation({search,prep,rules,tt})
  const options={exactChance:true,maxDepth:7,maxNodes:100000,timeBudgetMs:1e12,trace:true}
  const result=core.choose({game,preparation:p,actor:'player'},options)
  assert(result.trace.some(e=>e.action.cardId==='draw_2_discard_2'&&e.action.type==='prepare'&&e.drawn.length===2))
  const activation=prep.getPreparationActions(p).find(a=>a.type==='prepare');p=prep.applyPreparationAction(p,'player',activation)
  const cached=core.choose({game,preparation:p,actor:'player'},options)
  const uncached=core.choose({game,preparation:p,actor:'player'},{...options,cache:false})
  assert.deepEqual(cached.action,uncached.action);assert.equal(cached.action.type,'discard-preparation')
  assert.deepEqual(cached.values,uncached.values)
  const reversed=core.choose({game,preparation:{...p,deck:[...p.deck].reverse()},actor:'player'},options)
  assert.deepEqual(cached.action,reversed.action)
})
