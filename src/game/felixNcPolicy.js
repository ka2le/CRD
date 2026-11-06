// NC contract: old mechanics plus explicit conditional/passive/new action flags.
// Only actor-visible cards, legal actions and public deck composition enter it.
export const C=20,H=25,R=22,A=C+H,S=5*C+A,D=2*S+R+C+2,DS=294,DA=120
export const DRAFT_FEATURE_VERSION='felixnc-effects334-v1'
export const PREP_FEATURE_VERSION='felixfnc-prep294-action120-v2'
const sum=vs=>Array.from({length:C},(_,i)=>vs.reduce((n,v)=>n+v[i],0))
const lex=(a,b)=>{for(let i=0;i<a.length;i++)if(a[i]!==b[i])return a[i]-b[i];return 0}
export function createNCAdapter({tt,cards,makeAdapter,tabletop='abilities-new-cards',excluded=[]}){
  const base=makeAdapter(tt,cards,{totalThreshold:true,dragonOnly:true,blockBonus:true},{tabletop})
  const extra=c=>['single_faction_2','no_stats_to_2','draw_2_discard_2','discard_for_damage'].map(id=>Number(c.id===id))
  const descriptor=c=>[...base.descriptor(c),...extra(c)]
  const vectors=cs=>base.handDescriptors(cs).map((v,i)=>[...v,...extra(cs[i])])
  const profile=(vs,shield=0)=>{
    const p=base.profile(vs.map(v=>v.slice(0,16)),shield)
    return [...p.stats,p.shields,...p.contrib,p.neutral,p.base,...p.types,p.robotAttacks,Number(p.balanced),Number(p.overwhelming),...p.scores0,...p.scores,...p.mask,p.commitScore]
  }
  const catalog=base.catalog.filter(c=>!excluded.includes(c.id)),deck=sum(catalog.map(descriptor)).map(v=>v/catalog.length)
  const hand=(vs,shield)=>[...[...vs].sort(lex).flat(),...Array((5-vs.length)*C).fill(0),...sum(vs),...profile(vs,shield)]
  function encode(own,enemy){
    if(own.length!==enemy.length||own.length<1||own.length>5)throw Error('NC observed equal-hand prefix required')
    const a=vectors(own),b=vectors(enemy),x=[...hand(a,sum(b)[7]),...hand(b,sum(a)[7]),...base.rules,...deck,own.length,5-own.length]
    if(x.length!==D||!x.every(Number.isFinite))throw Error('NC draft feature contract')
    return x
  }
  function prepFeatures(o,legal){
    if(o.phase!=='preparation'||o.terminal||!legal.length)throw Error('NC actor prep observation required')
    const own=o.playerHand,enemy=o.opponentHand,discard=o.recycleCards,activated=new Set(o.activatedUids)
    const v=vectors(own),w=vectors(enemy),shield=sum(w)[7],ownProfile=profile(v,shield)
    const pool=cs=>{const x=vectors(cs);return [...sum(x),...Array.from({length:C},(_,i)=>x.length?Math.max(...x.map(v=>v[i])):0),x.length]}
    const active=[...new Map([...own,...discard].filter(c=>activated.has(c.uid)).map(c=>[c.uid,c])).values()]
    const pending=o.pendingDiscard,source=own.find(c=>c.uid===pending?.sourceUid)
    const state=[...pool(own.filter(c=>!activated.has(c.uid))),...pool(active),...pool(enemy),...pool(discard),...pool(o.discardPile),...ownProfile,...profile(w,sum(v)[7]),own.length,enemy.length,discard.length,activated.size,o.deckCount,Number(o.deckCountIsExact),o.steps,o.packNumber,o.picksThisPack,Number(o.firstPicker===o.side),Number(o.side==='opponent'),Number(o.opponentHandIsCurrent),...base.rules,Number(Boolean(pending)),pending?.remaining??-1,Number(pending?.cardId==='draw_2_discard_2'),Number(pending?.cardId==='discard_for_damage'),source?.sacrificedPower??0]
    const byid=new Map([...discard,...own].map(c=>[c.uid,c])),handids=new Set(own.map(c=>c.uid)),discardids=new Set(discard.map(c=>c.uid))
    const raw=legal.map(a=>{
      const kind=['prepare','skip-preparation','finish-preparation','discard-preparation','finish-preparation-discard'].indexOf(a.type)
      if(kind<0)throw Error('Unsupported NC prep action')
      const src=byid.get(a.sourceUid),target=byid.get(a.targetUid),sv=src?descriptor(src):Array(C).fill(0),tv=target?descriptor(target):Array(C).fill(0)
      let postCards=[...own]
      if(a.type==='prepare'&&a.cardId==='copy_card_in_hand')postCards[own.findIndex(c=>c.uid===a.sourceUid)]={...target,sacrificedPower:0}
      if(a.type==='prepare'&&a.cardId==='recycle_card')postCards.push(target)
      if(a.type==='discard-preparation')postCards=postCards.filter(c=>c.uid!==a.targetUid).map(c=>c.uid===a.sourceUid&&a.cardId==='discard_for_damage'?{...c,sacrificedPower:(c.sacrificedPower??0)+1}:c)
      const post=vectors(postCards),p=profile(post,shield),delta=sum(post).map((x,i)=>x-sum(v)[i])
      return [...[0,1,2,3,4].map(i=>Number(i===kind)),...sv,...tv,Number(Boolean(src)),Number(Boolean(target)),Number(handids.has(a.targetUid)),Number(discardids.has(a.targetUid)),Number(activated.has(a.targetUid)),...p,...p.map((x,i)=>x-ownProfile[i]),...delta]
    })
    const actions=[...new Map(raw.map(x=>[JSON.stringify(x),x])).values()].sort(lex),map=new Map(actions.map((x,i)=>[JSON.stringify(x),i])),mapping=raw.map(x=>map.get(JSON.stringify(x))),representatives=actions.map((_,i)=>mapping.indexOf(i))
    if(state.length!==DS||actions.some(x=>x.length!==DA)||![...state,...actions.flat()].every(Number.isFinite))throw Error('NC prep feature dimensions')
    return {state,actions,mapping,representatives}
  }
  return {encode,prepFeatures,descriptor,vectors,profile,base,deck,catalog}
}

const linear=(x,w,b)=>w.map((r,j)=>{let y=b[j];for(let i=0;i<x.length;i++)y+=r[i]*x[i];return y})
const normalize=(x,m,s)=>x.map((q,i)=>Math.max(-20,Math.min(20,(q-m[i])/s[i])))
const tanh=x=>x.map(Math.tanh)
const softmax=x=>{const m=Math.max(...x),e=x.map(v=>Math.exp(v-m)),z=e.reduce((a,b)=>a+b,0);return e.map(v=>v/z)}
export function createNCDraftPolicy(model,adapter){
  if(model.feature_version!==DRAFT_FEATURE_VERSION)throw Error('NC model contract')
  const w=model.state,embeddings=new Map()
  function embed(v){const key=v.join(',');if(!embeddings.has(key))embeddings.set(key,tanh(linear(tanh(linear(v.map((q,i)=>q/w.card_scale[i]),w['card.0.weight'],w['card.0.bias'])),w['card.2.weight'],w['card.2.bias'])));return embeddings.get(key)}
  function raw(x){
    const pools=[0,S].map(off=>{const out=Array(32).fill(0);for(let j=0;j<5;j++){const v=x.slice(off+j*C,off+(j+1)*C);if(v[15]){const e=embed(v);for(let k=0;k<32;k++)out[k]+=e[k]}}return out})
    const numeric=[...x.slice(5*C,S),...x.slice(S+5*C,2*S),...x.slice(2*S)]
    const z=[...pools.flat(),...normalize(numeric,w.mean,w.scale)],a=tanh(linear(z,w['hidden.0.weight'],w['hidden.0.bias'])),b=tanh(linear(a,w['hidden.2.weight'],w['hidden.2.bias']))
    const out=linear(b,w['readout.weight'],w['readout.bias']),skip=linear(z,w['linear.weight'],w['linear.bias']);return out.map((v,i)=>v+skip[i])
  }
  function predictFeatures(x){const a=raw(x),b=raw([...x.slice(S,2*S),...x.slice(0,S),...x.slice(2*S)]),p=softmax(a.map((v,i)=>(v+b[2-i])*.5));return {probabilities:p,value:p[2]+.5*p[1]}}
  function choose(game,side){
    const own=game[side+'Hand'],enemy=game[(side==='player'?'opponent':'player')+'Hand'],row=game.draftRow,k=own.length+1,replies=[];let predictions=0
    const values=row.map((c,i)=>{const a=[...own,c],options=enemy.length===k?[{opponentPick:null,value:predictFeatures(adapter.encode(a,enemy)).value}]:row.flatMap((d,j)=>i===j?[]:[{opponentPick:j,value:predictFeatures(adapter.encode(a,[...enemy,d])).value}]);predictions+=options.length;replies.push(options);return Math.min(...options.map(o=>o.value))})
    if(predictions!==(enemy.length===k?4:20)||!values.every(Number.isFinite))throw Error('NC candidate comparisons')
    const chosenIndex=values.indexOf(Math.max(...values));return {action:{type:'draft-pick',uid:row[chosenIndex].uid},values,replies,chosenIndex,predictions,samples:0,stage:'FelixNC-round'+k,checkpointSha256:model.checkpoint_sha256,version:model.version}
  }
  return {predictFeatures,choose}
}
export function createNCPrepPolicy(model,adapter){
  if(model.feature_version!==PREP_FEATURE_VERSION)throw Error('FNC prep model contract')
  const w=model.state
  function probabilities(state,actions){
    const s=tanh(linear(tanh(linear(normalize(state,w.state_mean,w.state_scale),w['state_net.0.weight'],w['state_net.0.bias'])),w['state_net.2.weight'],w['state_net.2.bias']))
    return softmax(actions.map(x=>{const a=tanh(linear(tanh(linear(normalize(x,w.action_mean,w.action_scale),w['action_net.0.weight'],w['action_net.0.bias'])),w['action_net.2.weight'],w['action_net.2.bias']));return linear(tanh(linear([...s,...a],w['choice_net.0.weight'],w['choice_net.0.bias'])),w['choice_net.2.weight'],w['choice_net.2.bias'])[0]}))
  }
  function choose(o,legal,{rng}={}){
    if(legal.length===1)return {action:legal[0],forced:true,prepCheckpointSha256:model.checkpoint_sha256,kernel:'FelixFNC-learned-preparation'}
    const f=adapter.prepFeatures(o,legal),p=f.actions.length===1?[1]:probabilities(f.state,f.actions)
    let group=0
    if(p.length>1){const coin=rng();let z=0;group=p.length-1;for(let i=0;i<p.length;i++){z+=p[i];if(coin<z){group=i;break}}}
    return {action:legal[f.representatives[group]],probabilities:p,values:f.mapping.map(i=>p[i]),semanticActions:p.length,prepCheckpointSha256:model.checkpoint_sha256,kernel:'FelixFNC-learned-preparation'}
  }
  return {choose,probabilities}
}
