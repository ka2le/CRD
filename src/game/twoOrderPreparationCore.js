import {createDistributionPreparation} from './preparedHandDistribution.js'
import {createPreparedJointEvaluation} from './preparedJointEvaluation.js'

// Solve a two-plan zero-sum game. Randomize only for a genuine interior cycle;
// the restricted-model guaranteed score must be at least the best pure row.
export function solveTwoByTwo(m) {
  if(m.length!==2||m.some(r=>r.length!==2||r.some(v=>!Number.isFinite(v))))throw Error('Finite2x2matrix required')
  const [[a,b],[c,d]]=m,low=[Math.min(a,b),Math.min(c,d)],den=a-b-c+d
  const pure=low[1]>low[0]+1e-10?1:0
  if(Math.abs(den)>1e-10){
    const p=(d-c)/den,q=(d-b)/den,value=(a*d-b*c)/den
    if(p>1e-10&&p<1-1e-10&&q>1e-10&&q<1-1e-10&&value>low[pure]+1e-10)
      return {kind:'cycle',probabilityRow0:p,restrictedValue:value,bestPureValue:low[pure],opponentProbabilityColumn0:q}
  }
  return {kind:'pure',probabilityRow0:pure===0?1:0,restrictedValue:low[pure],bestPureValue:low[pure]}
}
const secureCoin=()=>globalThis.crypto.getRandomValues(new Uint32Array(1))[0]/4294967296

export function createTwoOrderPreparation({search,prep,rules,tt},{rng=secureCoin,...settings}={}) {
  const core=createDistributionPreparation({search,prep,rules,tt})
  const profile={chanceLimit:16,maxDepth:8,maxNodes:12000,timeBudgetMs:1e12,discardAllBias:0,...settings}
  const cache=new Map(),other=s=>s==='player'?'opponent':'player'
  const counts=cards=>{const out={};for(const c of cards)out[c.id]=(out[c.id]??0)+1;return out}
  const cardKey=hand=>hand.map(c=>[c.id,c.uid,c.stats,c.effect,c.tabletopAttackUnits]).sort()
  function publicCommitment(game,side){
    const deck=[...game.deck].sort((a,b)=>a.uid.localeCompare(b.uid)),pool=counts(deck)
    const key=JSON.stringify([side,cardKey(game.playerHand),cardKey(game.opponentHand),pool])
    if(cache.has(key))return cache.get(key)
    const g={...game,deck,phase:'battle-ready'},state={game:g,preparation:prep.createPreparationState(g)}
    const jointFor=actor=>createPreparedJointEvaluation({core,prep,tt,profile},g,actor)
    let planningSupportRepairs=0
    const plan=(actor,target=null)=>{
      const evaluator=jointFor(actor)
      const result=core.choose({...state,actor},{...profile,opponentModel:target?evaluator.model(target,'two-order-prepared-opponent-target-v1'):null})
      planningSupportRepairs+=evaluator.metrics.supportRepairs
      return {outcomes:[...result.values[result.chosenIndex].distribution.values()],action:result.action,nodes:result.metrics.nodes,budgetHit:result.budgetHit}
    }
    const enemy0=plan(other(side)),ownA=plan(side,enemy0.outcomes)
    const ownSeed=plan(side),enemy1=plan(other(side),ownSeed.outcomes),ownB=plan(side,enemy1.outcomes)
    const evaluator=jointFor(side)
    const matrix=[ownA,ownB].map(own=>[enemy0,enemy1].map(enemy=>evaluator.compare(own.outcomes,enemy.outcomes).reward))
    const solution=solveTwoByTwo(matrix),draw=solution.kind==='cycle'?rng():null
    if(draw!==null&&(!(draw>=0)||!(draw<1)))throw Error('Coin must be in[0,1)')
    const row=draw===null?(solution.probabilityRow0===1?0:1):(draw<solution.probabilityRow0?0:1)
    const value={target:(row===0?enemy0:enemy1).outcomes,pool,
      metadata:{...solution,draw,selectedRow:row,matrix,planningSupportRepairs:planningSupportRepairs+evaluator.metrics.supportRepairs,planningNodes:[enemy0,ownA,ownSeed,enemy1,ownB].reduce((n,p)=>n+p.nodes,0),
        budgetHits:[enemy0,ownA,ownSeed,enemy1,ownB].filter(p=>p.budgetHit).length,
        assumption:'Two bounded planning orders, approximate shared-pool probabilities; not full-game equilibrium or universal exploitability guarantee.'}}
    if(cache.size>=128)cache.delete(cache.keys().next().value)
    cache.set(key,value);return value
  }
  function choose(state){
    if(!state.preparation||state.game.mode!=='draft')throw Error('Actual Draft preparation only')
    const commitment=publicCommitment(state.game,state.actor)
    const evaluator=createPreparedJointEvaluation({core,prep,tt,profile},state.game,state.actor)
    const result=core.choose(state,{...profile,opponentModel:evaluator.model(commitment.target,'two-order-prepared-opponent-target-v1')})
    return {...result,values:result.values.map(v=>{const copy={...v};delete copy.distribution;return copy}),version:'two-order-mixed-actual-preparation-v1',
      planningOrders:commitment.metadata,sharedPoolSupportRepairs:evaluator.metrics.supportRepairs,randomization:'One private commitment per preparation; continuation adapts to own reveals against committed prepared target'}
  }
  return {choose,publicCommitment,clearCache:()=>cache.clear(),profile}
}
