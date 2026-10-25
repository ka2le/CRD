// Condition sampled prepared hands on physical shared-card availability.
// If bounded quadrature has no support left, regenerate a prepared enemy on
// the available pool. Never substitute an unprepared enemy or a hidden hand.
export function createPreparedJointEvaluation({ core, prep, tt, profile }, game, side) {
  const enemy = side === 'player' ? 'opponent' : 'player'
  const deck = [...game.deck].sort((a,b) => a.uid.localeCompare(b.uid))
  const counts = cards => { const v={};for(const c of cards)v[c.id]=(v[c.id]??0)+1;return v }
  const pool = counts(deck), fallback = new Map(), metrics = { supportRepairs: 0 }
  function joint(ours, theirs) {
    let reward=0,margin=0,mass=0
    for(const a of ours)for(const b of theirs) {
      if(Object.keys(pool).some(id => (a.consumed[id]??0)+(b.consumed[id]??0)>pool[id]))continue
      const w=a.weight*b.weight,battle=tt.resolveTabletopBattle(a.hand,b.hand,{playerType:tt.chooseTabletopType(a.hand),opponentType:tt.chooseTabletopType(b.hand)})
      reward+=w*(battle.winner==='tie'?0:battle.winner==='player'?1:-1)
      margin+=w*(battle.player.score-battle.opponent.score);mass+=w
    }
    return mass>1e-12?{reward:reward/mass,margin:margin/mass,feasibleMass:mass}:null
  }
  function conditionalEnemy(remaining) {
    const key=JSON.stringify(counts(remaining))
    if(!fallback.has(key)) {
      const publicGame={...game,deck:[...remaining].sort((a,b)=>a.uid.localeCompare(b.uid)),phase:'battle-ready'}
      const result=core.choose({game:publicGame,preparation:prep.createPreparationState(publicGame),actor:enemy},profile)
      fallback.set(key,[...result.values[result.chosenIndex].distribution.values()])
    }
    return fallback.get(key)
  }
  function remainingFor(consumed) {
    const remove={...consumed}
    return deck.filter(c=>{if((remove[c.id]??0)>0){remove[c.id]--;return false}return true})
  }
  function compare(ours,theirs) {
    const value=joint(ours,theirs)
    if(value)return value
    metrics.supportRepairs++
    let reward=0,margin=0,mass=0
    for(const a of ours) {
      const x=joint([{...a,weight:1}],conditionalEnemy(remainingFor(a.consumed)))
      if(!x)throw Error('Conditional prepared enemy still has no feasible mass')
      reward+=a.weight*x.reward;margin+=a.weight*x.margin;mass+=a.weight
    }
    return {reward:reward/mass,margin:margin/mass,feasibleMass:mass}
  }
  function model(target,id) {
    const memo=new Map()
    return {id,evaluate(hand,{remaining}) {
      const left=counts(remaining),consumed=Object.fromEntries(Object.entries(pool).map(([k,n])=>[k,n-(left[k]??0)]))
      const key=JSON.stringify([hand.map(c=>[c.id,c.uid,c.stats,c.effect,c.tabletopAttackUnits]),consumed])
      if(!memo.has(key))memo.set(key,compare([{hand,consumed,weight:1}],target))
      return memo.get(key)
    }}
  }
  return {compare,model,metrics,pool}
}
