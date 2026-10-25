// Frozen hand-count evaluator. Labels predict eventual full-game outcomes.
export function createLearnedHandPolicy(model) {
  const handSize=model.hand_size ?? 3
  const index=new Map(model.card_types.map((id,i)=>[id,i]))
  const state=model.state
  function linear(x,w,b){return w.map((row,j)=>{let y=b[j];for(let i=0;i<x.length;i++)y+=row[i]*x[i];return y})}
  function raw(x){
    const z=x.map((v,i)=>Math.max(-20,Math.min(20,(v-state.mean[i])/state.scale[i])))
    const a=linear(z,state['hidden.0.weight'],state['hidden.0.bias']).map(Math.tanh)
    const b=linear(a,state['hidden.2.weight'],state['hidden.2.bias']).map(Math.tanh)
    const c=linear(b,state['readout.weight'],state['readout.bias'])
    const d=linear(z,state['linear.weight'],state['linear.bias'])
    return c.map((v,i)=>v+d[i])
  }
  function predict(own,enemy){
    if(own.length!==handSize||enemy.length!==handSize)throw Error('Predictor hand size mismatch')
    const x=Array(50).fill(0)
    for(const c of own){const i=index.get(c.id??c);if(i===undefined)throw Error('Unknown card');x[i]++}
    for(const c of enemy){const i=index.get(c.id??c);if(i===undefined)throw Error('Unknown card');x[25+i]++}
    const a=raw(x),b=raw([...x.slice(25),...x.slice(0,25)])
    const logits=a.map((v,i)=>(v+b[2-i])/2),max=Math.max(...logits)
    const exp=logits.map(v=>Math.exp(v-max)),sum=exp.reduce((a,b)=>a+b,0),p=exp.map(v=>v/sum)
    return {probabilities:p,value:p[2]+.5*p[1]}
  }
  function choose(game,side){
    const own=game[side+'Hand'],enemy=game[(side==='player'?'opponent':'player')+'Hand'],row=game.draftRow
    if(own.length!==handSize-1)throw Error('Policy pick number mismatch')
    let predictions=0;const replies=[]
    const values=row.map((card,i)=>{
      const ours=[...own,card]
      if(enemy.length===handSize){predictions++;const v=predict(ours,enemy).value;replies.push([{opponentPick:null,value:v}]);return v}
      if(enemy.length!==handSize-1)throw Error('Unexpected opposing hand size')
      const options=row.flatMap((other,j)=>j===i?[]:[{opponentPick:j,value:predict(ours,[...enemy,other]).value}])
      predictions+=options.length;replies.push(options)
      return Math.min(...options.map(r=>r.value))
    })
    if(!values.length||!values.every(Number.isFinite))throw Error('Invalid neural values')
    const chosenIndex=values.indexOf(Math.max(...values))
    if(predictions!==(enemy.length===handSize?4:20))throw Error('Incorrect4/20 comparison count')
    return {action:{type:'draft-pick',uid:row[chosenIndex].uid},values,chosenIndex,replies,predictions,samples:0,
      version:`dan-final-outcome-maximin-pick${handSize}-v1`,checkpointSha256:model.checkpoint_sha256,modelVersion:model.version,
      stage:`neural-round${handSize}`,labelSemantics:'Eventual full-game WDL from public hand counts; '+model.version,
      opponentAssumption:enemy.length===handSize?'known-opposing-hand':'best-reply-under-same-network'}
  }
  return {predict,choose,supports:(game,side)=>{const enemy=side==='player'?'opponent':'player';return game[side+'Hand']?.length===handSize-1&&[handSize-1,handSize].includes(game[enemy+'Hand']?.length)&&[...game[side+'Hand'],...game[enemy+'Hand'],...game.draftRow].every(c=>c.tabletop==='abilities-main'&&index.has(c.id))}}
}
