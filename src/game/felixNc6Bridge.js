// Research-only six-pick bridge. Never reads a private enemy discard or deck order.
import {createNCDraftPolicy} from './felixNcPolicy.js'

const other=s=>s==='player'?'opponent':'player'
const five=hand=>hand.map((_,i)=>hand.filter((_,j)=>i!==j))
const handKey=hand=>JSON.stringify(hand.map(c=>[c.id,c.stats,c.effect,c.tabletopAttackUnits??null,c.sacrificedPower??0]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))))

// Pure maximin: our discard is chosen before an adversarial hidden enemy discard.
// This is a conservative approximation to simultaneous private commitments.
export function discardMatrix(own,enemy,value){
  if(own.length!==6||enemy.length!==6)throw Error('Six public drafted cards per seat required')
  const matrix=five(own).map(a=>five(enemy).map(b=>value(a,b)))
  const values=matrix.map(row=>Math.min(...row))
  const chosenIndex=values.indexOf(Math.max(...values))
  return {matrix,values,chosenIndex,value:values[chosenIndex]}
}

export function createNC6Bridge(model,adapter){
  const policy=createNCDraftPolicy(model,adapter)
  function rootValue(){
    const cache=new Map();let predictions=0
    return {value(a,b){
      const ka=handKey(a),kb=handKey(b),key=ka+'|'+kb,rev=kb+'|'+ka
      if(cache.has(key))return cache.get(key)
      const v=policy.predictFeatures(adapter.encode(a,b)).value
      cache.set(key,v);cache.set(rev,1-v);predictions++;return v
    },count:()=>predictions}
  }
  function discard(own,enemy){
    const v=rootValue(),r=discardMatrix(own,enemy,v.value)
    return {...r,action:{type:'discard',selectedIds:[own[r.chosenIndex].uid]},predictions:v.count(),kernel:'FelixNC6-five-card-maximin-discard'}
  }
  function choose(game,side){
    const own=game[side+'Hand'],enemy=game[other(side)+'Hand'],row=game.draftRow
    if(own.length<5)return {...policy.choose({...game,mode:'draft'},side),kernel:'FelixNC6-unchanged-first-five'}
    if(own.length!==5||![5,6].includes(enemy.length))throw Error('Sixth-pick root required')
    const v=rootValue(),replies=[]
    const values=row.map((card,i)=>{
      const a=[...own,card]
      const options=enemy.length===6?[{opponentPick:null,enemy}]:row.flatMap((d,j)=>i===j?[]:[{opponentPick:j,enemy:[...enemy,d]}])
      const scores=options.map(o=>({opponentPick:o.opponentPick,...discardMatrix(a,o.enemy,v.value)}))
      replies.push(scores);return Math.min(...scores.map(r=>r.value))
    })
    const chosenIndex=values.indexOf(Math.max(...values))
    return {action:{type:'draft-pick',uid:row[chosenIndex].uid},values,replies,chosenIndex,predictions:v.count(),stage:'FelixNC6-round6-pick-discard',kernel:'FelixNC6-five-card-bridge',checkpointSha256:model.checkpoint_sha256}
  }
  return {choose,discard}
}

export function createNC6Preparation({search,prep,rules,tt,createProbabilityPreparation}){
  return function choose(state,options={}){
    const side=state.actor,enemy=other(side)
    // search.preparationView reconstructs and sorts the physical unseen pool;
    // both drafted six-card sets and our own set-aside card are excluded.
    const view=search.preparationView(state.preparation,state.game,side)
    const enemies=five(state.game[enemy+'DraftedHand'])
    const opponentModel={id:'NC6-public-six-adversarial-raw-five',evaluate(hand){
      const outcomes=enemies.map(opponent=>{
        const b=tt.resolveTabletopBattle(hand,opponent,{playerType:tt.chooseTabletopType(hand),opponentType:tt.chooseTabletopType(opponent)})
        return {reward:b.winner==='tie'?0:b.winner==='player'?1:-1,margin:b.player.score-b.opponent.score}
      })
      return outcomes.reduce((a,b)=>b.reward<a.reward||b.reward===a.reward&&b.margin<a.margin?b:a)
    }}
    const core=createProbabilityPreparation({search:{...search,preparationView:()=>view},prep,rules,tt})
    // Existing sequence planner accepts a Draft tag; its information view above
    // remains the six-draft view, never the private surviving enemy hand.
    return {...core.choose({...state,game:{...state.game,mode:'draft'}},{chanceLimit:16,maxNodes:12000,maxDepth:8,timeBudgetMs:1e12,...options,opponentModel}),kernel:'FelixNC6-native-public-six-preparation-12000-depth8'}
  }
}
