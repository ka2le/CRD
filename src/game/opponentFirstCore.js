import { createDistributionPreparation } from './preparedHandDistribution.js'
import { createPreparedJointEvaluation } from './preparedJointEvaluation.js'

export function createOpponentFirstPolicy({ search, prep, rules, tt, h }, options={}) {
  const core=createDistributionPreparation({search,prep,rules,tt})
  const profile={chanceLimit:16,maxDepth:8,maxNodes:12000,timeBudgetMs:1e12,discardAllBias:0,...options}
  const cache=new Map(),other=s=>s==='player'?'opponent':'player'
  const counts=cs=>{const v={};for(const c of cs)v[c.id]=(v[c.id]??0)+1;return v}
  const keyCards=cs=>cs.map(c=>[c.id,c.uid,c.stats,c.effect,c.tabletopAttackUnits]).sort()
  function target(game,side) {
    const deck=[...game.deck].sort((a,b)=>a.uid.localeCompare(b.uid)),pool=counts(deck)
    const key=JSON.stringify([side,keyCards(game.playerHand),keyCards(game.opponentHand),pool])
    if(cache.has(key))return cache.get(key)
    const publicGame={...game,deck,phase:'battle-ready'}
    const state={game:publicGame,preparation:prep.createPreparationState(publicGame),actor:other(side)}
    const result=core.choose(state,profile),outcomes=[...result.values[result.chosenIndex].distribution.values()]
    const mass=outcomes.reduce((n,v)=>n+v.weight,0)
    if(Math.abs(mass-1)>1e-8)throw Error('Opponent preparation distribution not normalized')
    const entry={outcomes,pool,nodes:result.metrics.nodes,budgetHit:result.budgetHit,
      rootAction:result.action,leafModel:result.leafModel}
    if(cache.size>=128)cache.delete(cache.keys().next().value)
    cache.set(key,entry);return entry
  }
  function choosePreparation(state) {
    if(!state.preparation||state.game.mode!=='draft')throw Error('Draft preparation required')
    // Build rival's policy from PUBLIC raw starting hands, never its real private
    // preparation or our subsequently revealed private cards. Then respond to it.
    const t=target(state.game,state.actor),evaluator=createPreparedJointEvaluation({core,prep,tt,profile},state.game,state.actor),result=core.choose(state,{...profile,opponentModel:evaluator.model(t.outcomes,'opponent-first-prepared-response-v1')})
    return {...result,values:result.values.map(v=>{const value={...v};delete value.distribution;return value}),
      version:'opponent-first-prepared-response-v1',sharedPoolSupportRepairs:evaluator.metrics.supportRepairs,opponentOutcomes:t.outcomes.length,
      opponentNodes:t.nodes,opponentBudgetHit:t.budgetHit,opponentRootAction:t.rootAction,
      assumption:'Opponent adaptive plan optimized against our public raw hand, then our adaptive best response; not a joint equilibrium.',
      approximateSharedPoolConditioning:true}
  }
  function evaluate(state,side) {
    const result=choosePreparation({...state,actor:side}),v=result.values[result.chosenIndex]
    return {reward:v.reward,margin:v.margin,nodes:result.metrics.nodes+result.opponentNodes,
      budgetHits:Number(result.budgetHit)+Number(result.opponentBudgetHit),opponentOutcomes:result.opponentOutcomes}
  }
  function chooseFifth(state) {
    const side=state.actor,enemy=other(side),row=state.game.draftRow
    if(state.preparation||state.game[side+'Hand'].length!==4||![4,5].includes(state.game[enemy+'Hand'].length))throw Error('Final Draft pick required')
    const matrix=[],values=[],margins=[],local=new Map(),started=performance.now()
    const get=s=>{
      const key=JSON.stringify([keyCards(s.game.playerHand),keyCards(s.game.opponentHand)])
      if(!local.has(key))local.set(key,evaluate(s,side));return local.get(key)
    }
    for(const c of row) {
      const next=h.stepHeadlessGame(state,{type:'draft-pick',uid:c.uid})
      const cells=next.preparation?[get(next)]:next.game.draftRow.map(reply=>get(h.stepHeadlessGame(next,{type:'draft-pick',uid:reply.uid})))
      let worst=cells[0]
      for(const v of cells.slice(1))if(v.reward<worst.reward-1e-10||(Math.abs(v.reward-worst.reward)<=1e-10&&v.margin<worst.margin-1e-10))worst=v
      matrix.push(cells);values.push(worst.reward);margins.push(worst.margin)
    }
    let chosenIndex=0
    for(let i=1;i<row.length;i++)if(values[i]>values[chosenIndex]+1e-10||(Math.abs(values[i]-values[chosenIndex])<=1e-10&&margins[i]>margins[chosenIndex]+1e-10))chosenIndex=i
    return {action:{type:'draft-pick',uid:row[chosenIndex].uid},chosenIndex,values,margins,matrix,samples:0,
      comparisons:matrix.reduce((n,r)=>n+r.length,0),uniquePairs:local.size,elapsedMs:performance.now()-started,
      version:'opponent-first-prepared-response-pick5-v1',leafModel:'opponent-first-prepared-response-v1',
      assumption:'Good opponent prep first; own prep responds; worst final draft reply. Approximate sequential model, not equilibrium.'}
  }
  return {choosePreparation,chooseFifth,evaluate,profile,clearCache:()=>cache.clear()}
}
