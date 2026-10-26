// Frozen empirical draw-six combat prior adopted for Dan v10. Abstract outcomes
// are planning estimates only; real preparation always uses physical cards.
export function createDiscardLookupAdapter(tt,histogram){
 const total=histogram.reduce((n,v)=>n+v.count,0),cost=tt.MAIN_ABILITY_SHIELD_COST
 if(total!==10000)throw Error('Frozen six-card bank required')
 if(tt.MAIN_ABILITY_RULES.overwhelmingAfterShields)throw Error('Unsupported rules')
 const metrics={lookupQueries:0,lookupComputations:0,abstractBattles:0},combatCache=new WeakMap(),valuesCache=new WeakMap()
 const compact=hand=>{
  if(hand[0]?.lookupCombat)return hand[0].lookupCombat
  if(!combatCache.has(hand)){const faction=tt.chooseTabletopType(hand);combatCache.set(hand,{faction,damage0:tt.scoreTabletopHand(hand,0,faction).score,shields:tt.getTabletopProfile(hand).shields})}
  return combatCache.get(hand)
 }
 const score=(a,s)=>Math.max(0,a.damage0-(cost[a.faction]??0)*s)
 const compare=(a,b)=>{const margin=score(a,b.shields)-score(b,a.shields);return {margin,reward:margin>0?1:margin<0?-1:(a.faction==='critter')!==(b.faction==='critter')?(a.faction==='critter'?1:-1):0}}
 const outcomes=histogram.map((v,i)=>{
  const signature={faction:v.faction,damage0:v.damage0,shields:v.shields}
  // These are marked combat outcomes, never cards in an actual game. Unknown
  // consumption is deliberately approximated as independent in this prototype.
  const hand=[{id:`lookup-combat-${i}`,uid:`lookup-combat-${i}`,stats:[],effect:{},lookupCombat:signature}]
  return {hand,consumed:{},weight:v.count/total,abstractCombat:true,consumptionApproximation:'ignored-for-lookup-draw'}
 })
 const facade={...tt,
  chooseTabletopType:hand=>hand[0]?.lookupCombat?hand[0].lookupCombat.faction:tt.chooseTabletopType(hand),
  getTabletopProfile:hand=>hand[0]?.lookupCombat?{shields:hand[0].lookupCombat.shields,types:[hand[0].lookupCombat.faction]}:tt.getTabletopProfile(hand),
  resolveTabletopBattle(a,b,options){
   if(!a[0]?.lookupCombat&&!b[0]?.lookupCombat)return tt.resolveTabletopBattle(a,b,options)
   metrics.abstractBattles++;const ac=compact(a),bc=compact(b),result=compare(ac,bc)
   return {winner:result.reward===0?'tie':result.reward===1?'player':'opponent',player:{score:score(ac,bc.shields)},opponent:{score:score(bc,ac.shields)}}
  }}
 function lookup({unknown,v,opponentModel}){
  metrics.lookupQueries++
  const target=opponentModel??v.enemyPublicHand
  if(!valuesCache.has(target))valuesCache.set(target,new Map())
  const counts={};for(const c of unknown)counts[c.id]=(counts[c.id]??0)+1
  const key=JSON.stringify(Object.entries(counts).sort()),cache=valuesCache.get(target)
  if(cache.has(key))return cache.get(key)
  metrics.lookupComputations++
  let reward=0,margin=0
  const distribution=new Map()
  for(let i=0;i<outcomes.length;i++){
   const o=outcomes[i],value=opponentModel?opponentModel.evaluate(o.hand,{remaining:unknown,initialUnseen:v.unseen}):compare(compact(o.hand),compact(v.enemyPublicHand))
   reward+=o.weight*value.reward;margin+=o.weight*value.margin;distribution.set(`empirical-six/${i}`,o)
  }
  const result={reward,margin,activationProbability:1,utility:reward,truncated:false,distribution}
  cache.set(key,result);return result
 }
 return {tt:facade,lookup,metrics,compact,compare,outcomes}
}
