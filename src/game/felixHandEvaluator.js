import {C,S,D,swap} from './felixEffects.js'
export function createFelixPolicy(model,adapter){
  const s=model.state,linear=(x,w,b)=>w.map((r,j)=>{let y=b[j];for(let i=0;i<x.length;i++)y+=r[i]*x[i];return y})
  const embedding=new Map()
  function embed(v){const key=v.join(',');if(!embedding.has(key)){const a=linear(v.map((q,i)=>q/s.card_scale[i]),s['card.0.weight'],s['card.0.bias']).map(Math.tanh);embedding.set(key,linear(a,s['card.2.weight'],s['card.2.bias']).map(Math.tanh))}return embedding.get(key)}
  function raw(x){
    const pools=[0,S].map(off=>{const p=Array(32).fill(0);for(let j=0;j<5;j++){const v=x.slice(off+j*C,off+(j+1)*C);if(v[15]){const e=embed(v);for(let i=0;i<32;i++)p[i]+=e[i]}}return p})
    const numeric=[...x.slice(5*C,S),...x.slice(S+5*C,2*S),...x.slice(2*S)]
    const z=[...pools.flat(),...numeric.map((q,i)=>Math.max(-20,Math.min(20,(q-s.mean[i])/s.scale[i])))];
    const a=linear(z,s['hidden.0.weight'],s['hidden.0.bias']).map(Math.tanh),b=linear(a,s['hidden.2.weight'],s['hidden.2.bias']).map(Math.tanh)
    return linear(b,s['readout.weight'],s['readout.bias']).map((v,i)=>v+linear(z,s['linear.weight'],s['linear.bias'])[i])
  }
  function predictFeatures(x){if(x.length!==D)throw Error('Felix dimension');const a=raw(x),b=raw(swap(x)),v=a.map((q,i)=>(q+b[2-i])*.5),max=Math.max(...v),exp=v.map(q=>Math.exp(q-max)),sum=exp.reduce((a,b)=>a+b,0),p=exp.map(q=>q/sum);return {probabilities:p,value:p[2]+p[1]*.5}}
  const predict=(own,enemy)=>predictFeatures(adapter.encode(own,enemy))
  function choose(game,side){
    const own=game[side+'Hand'],enemy=game[(side==='player'?'opponent':'player')+'Hand'],row=game.draftRow,k=own.length+1,replies=[];let predictions=0
    const values=row.map((c,i)=>{const a=[...own,c];const options=enemy.length===k?[{opponentPick:null,value:predict(a,enemy).value}]:row.flatMap((d,j)=>i===j?[]:[{opponentPick:j,value:predict(a,[...enemy,d]).value}]);predictions+=options.length;replies.push(options);return Math.min(...options.map(q=>q.value))})
    if(predictions!==(enemy.length===k?4:20)||!values.every(Number.isFinite))throw Error('Felix comparison contract')
    const chosenIndex=values.indexOf(Math.max(...values))
    return {action:{type:'draft-pick',uid:row[chosenIndex].uid},values,replies,chosenIndex,predictions,samples:0,version:model.version,stage:'felix-round'+k,checkpointSha256:model.checkpoint_sha256}
  }
  return {predict,predictFeatures,choose}
}
