// DavidBot probability planner, adopted from the frozen 2026-10-23 Discard pilot.
// Dependencies are injected so browser workers and headless tests use the same policy.
import {compileCombatCycle,compareCombatCycles} from './davidCombat.js'
import {createOpponentScoreEvaluator} from './davidOpponentScores.js'
export function combination(n,k) {
  if(k<0||k>n)return 0
  let v=1;for(let j=1;j<=k;j++)v=v*(n-j+1)/j
  return v
}
export function drawDistribution(counts,draw) {
  const denominator=combination(counts.reduce((a,b)=>a+b,0),draw),out=[]
  if(!denominator)throw Error('Impossible draw')
  const chosen=new Array(counts.length).fill(0)
  function visit(i,left,numerator) {
    if(i===counts.length){if(!left)out.push({counts:[...chosen],weight:numerator/denominator});return}
    for(let k=0;k<=Math.min(left,counts[i]);k++){chosen[i]=k;visit(i+1,left-k,numerator*combination(counts[i],k))}
    chosen[i]=0
  }
  visit(0,draw,1)
  const mass=out.reduce((s,e)=>s+e.weight,0)
  if(Math.abs(mass-1)>1e-9)throw Error('Chance mass')
  return out
}
// Full probability distribution is built first. Midpoint CDF quadrature bounds costly leaf values.
export function integratePoints(distribution,limit) {
  if(distribution.length<=limit)return distribution
  const result=[],byIndex=new Map();let i=0,cdf=distribution[0].weight
  for(let k=0;k<limit;k++) {
    const target=(k+.5)/limit
    while(target>cdf&&i<distribution.length-1)cdf+=distribution[++i].weight
    if(!byIndex.has(i)){const p={counts:distribution[i].counts,weight:0};byIndex.set(i,p);result.push(p)}
    byIndex.get(i).weight+=1/limit
  }
  return result
}
export function createDavidPolicy({h,cards,prep,oldPrep,tt,pool,config}) {
  const spec=h.getHeadlessSpec(config),definitions=cards.getCoreCards({tabletop:config.tabletop}).map(c=>config.tabletop?tt.toTabletopCard(c,config.tabletop):c)
  const ids=spec.cardTypes.map(c=>c.id),index=new Map(ids.map((id,i)=>[id,i]))
  const vector=cs=>{const v=ids.map(()=>0);for(const c of cs){const i=index.get(c.id);if(i===undefined)throw Error('Card vocabulary');v[i]++}return v}
  const key=cs=>cs.map(c=>JSON.stringify([c.id,c.stats,c.effect,c.isCopiedCard??false,c.copySourceCardId??null])).sort().join('|')
  const ordered=cs=>[...cs].sort((a,b)=>a.id.localeCompare(b.id)||a.uid.localeCompare(b.uid))
  function view(state) {
    if(state.preparation||state.game.mode!=='five-hand-discard')throw Error('Discard-only AI')
    const o=h.encodeObservation(state,state.actor)
    const seen=[...new Map([...o.playerHand,...o.recycleCards,...o.history.flatMap(e=>e.cards??[])].map(c=>[c.uid,c])).values()]
    const known=vector(seen),unseen=spec.poolCounts.map((n,i)=>n-known[i])
    if(unseen.some(n=>n<0))throw Error('Known-card overcount')
    return {side:o.side,own:ordered(o.playerHand),discard:ordered(o.recycleCards),unseen,
      ownUsed:o.playerDiscardsUsed,enemyUsed:o.opponentDiscardsUsed,enemyCount:o.opponentHandCount}
  }
  function opponents(v,rng,n) {
    const eligible=pool.entries.filter(e=>e.rawCounts.every((c,i)=>c<=v.unseen[i]))
    if(!eligible.length)throw Error('No compatible empirical opponents')
    const shuffled=cards.shuffle(eligible,{rng}),chosen=[],families=new Set()
    for(const e of shuffled)if(!families.has(e.family)){chosen.push(e);families.add(e.family);if(chosen.length===n)break}
    for(const e of shuffled)if(chosen.length<n&&!chosen.includes(e))chosen.push(e)
    while(chosen.length<n)chosen.push(shuffled[chosen.length%shuffled.length])
    return {chosen,eligible:eligible.length,families:families.size}
  }
  function search(state,{opponentCount=50,prepScenarios=2,chanceLimit=128,seed,onProgress}={}) {
    const start=performance.now(),v=view(state)
    if(!Number.isSafeInteger(seed))throw Error('DavidBot requires a public-view planning seed')
    const opponent=opponents(v,cards.createSeededRng(seed^0x563812),opponentCount)
    const enemies=opponent.chosen.map(e=>config.tabletop?({hand:e.prepared,type:tt.chooseTabletopType(e.prepared),
      shields:tt.getTabletopProfile(e.prepared).shields,scores:new Map()}):({cycle:compileCombatCycle(e.prepared)}))
    const opponentScores=config.tabletop?createOpponentScoreEvaluator(tt,enemies):null
    const metrics={handValues:0,handCacheHits:0,preparationTrials:0,preparedHands:0,battleComparisons:0,scenarioPlayouts:0}
    const valueCache=new Map(),battleCache=new Map(),distributions=new Map()
    function readyValue(hand) {
      const k=key(hand);if(battleCache.has(k))return battleCache.get(k)
      metrics.preparedHands++
      if(!config.tabletop) {
        const cycle=compileCombatCycle(hand)
        const mean=enemies.reduce((sum,e)=>sum+compareCombatCycles(cycle,e.cycle),0)/enemies.length
        metrics.battleComparisons+=enemies.length;battleCache.set(k,mean);return mean
      }
      const mean=opponentScores.evaluate(hand)
      // Logical pairwise outcomes retained for parity with the historical counter.
      metrics.battleComparisons+=enemies.length;battleCache.set(k,mean);return mean
    }
    function rulesFinish(p) {
      for(let guard=0;!p.playerFinished;guard++) {
        if(guard>150)throw Error('Preparation completion guard')
        p=prep.applyPreparationAction(p,'player',oldPrep.pickPreparationAction(p,'player'))
      }
      return p
    }
    function prepare(p) {
      // Borrow original one-action lookahead, with actual effect application and battle outcomes.
      for(let guard=0;!p.playerFinished;guard++) {
        if(guard>150)throw Error('Preparation lookahead guard')
        const legal=prep.getPreparationActions(p,'player'),baseline=oldPrep.pickPreparationAction(p,'player')
        const actionKey=a=>JSON.stringify(a),order=[baseline,...legal.filter(a=>actionKey(a)!==actionKey(baseline))]
        let best=order[0],bestValue=-Infinity
        for(const action of order) {
          metrics.preparationTrials++
          const result=rulesFinish(prep.applyPreparationAction(p,'player',action)),value=readyValue(result.playerHand)
          if(value>bestValue){bestValue=value;best=action}
          if(bestValue===1)break
        }
        p=prep.applyPreparationAction(p,'player',best)
      }
      return readyValue(p.playerHand)
    }
    function handValue(hand,discard,drawn) {
      const k=key(hand)+'/'+key(discard)+'/'+drawn.join(',')
      if(valueCache.has(k)){metrics.handCacheHits++;return valueCache.get(k)}
      metrics.handValues++
      const remaining=v.unseen.map((n,i)=>n-drawn[i]);if(remaining.some(n=>n<0))throw Error('Draw depletion')
      const deck=[]
      remaining.forEach((n,i)=>{for(let j=0;j<n;j++)deck.push({...definitions[i],uid:`chance-${i}-${j}`})})
      let value=0
      for(let scenario=0;scenario<prepScenarios;scenario++) {
        const p=prep.createPreparationState({playerHand:ordered(hand),opponentHand:[],playerDiscards:ordered(discard),
          deck:cards.shuffle(deck,{rng:cards.createSeededRng(seed^(scenario+1)*7919)})})
        p.opponentFinished=true
        metrics.scenarioPlayouts++;value+=prepare(p)
      }
      value/=prepScenarios;valueCache.set(k,value);return value
    }
    const legal=h.getLegalActions(state),groups=new Map()
    legal.forEach((a,i)=>{
      const selected=new Set(a.selectedIds),discard=v.own.filter(c=>selected.has(c.uid)),k=key(discard)
      if(!groups.has(k))groups.set(k,{indices:[],representative:i,discard})
      groups.get(k).indices.push(i)
    })
    const values=new Array(legal.length),actions=[]
    let completed=0
    for(const g of groups.values()) {
      const d=g.discard.length
      if(!distributions.has(d)) {
        const full=drawDistribution(v.unseen,d),points=integratePoints(full,d<=2?Infinity:chanceLimit)
        distributions.set(d,{fullCount:full.length,points,exact:points.length===full.length})
      }
      const distribution=distributions.get(d),selected=new Set(g.discard.map(c=>c.uid)),kept=v.own.filter(c=>!selected.has(c.uid))
      let value=0
      for(const point of distribution.points) {
        const additions=[]
        point.counts.forEach((n,i)=>{for(let j=0;j<n;j++)additions.push({...definitions[i],uid:`draw-${i}-${j}`})})
        value+=point.weight*handValue([...kept,...additions],[...v.discard,...g.discard],point.counts)
      }
      for(const i of g.indices)values[i]=value
      actions.push({indices:g.indices,discardTypes:vector(g.discard),value,outcomes:distribution.fullCount,
        evaluatedOutcomes:distribution.points.length,exact:distribution.exact,weightSum:distribution.points.reduce((s,e)=>s+e.weight,0)})
      onProgress?.({completed:++completed,total:groups.size})
    }
    let chosen=0
    values.forEach((value,i)=>{if(value>values[chosen]+1e-12||Math.abs(value-values[chosen])<=1e-12&&legal[i].selectedIds.length<legal[chosen].selectedIds.length)chosen=i})
    return {action:legal[chosen],chosenIndex:chosen,values,actions,distinctActions:groups.size,rootCandidates:legal.length,
      milliseconds:performance.now()-start,visible:v,metrics,
      ...(opponentScores?{work:{opponentScoreGroups:opponentScores.stats.groups,opponentGroupQueries:opponentScores.stats.queries}}:{}),
      opponentPrior:{count:enemies.length,eligible:opponent.eligible,sourceFamilies:[...new Set(opponent.chosen.map(e=>e.family))]},
      settings:{opponentCount,prepScenarios,chanceLimit},
      redrawIntegration:actions.every(a=>a.exact)?'full-exact':'cdf-quadrature',
      approximation:'Uniform-unseen marginal draw model; independent empirical prepared-opponent prior; sampled preparation draws; one-pass planning, replan next pass.'}
  }
  return {h,cards,tt,prep,view,search,spec,config,vector,readyKey:key}
}
