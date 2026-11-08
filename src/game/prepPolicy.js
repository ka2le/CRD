// Direct preparation action policy. Inputs are actor observations and legal actions only.
import {felixAdapter} from './felixBot.js'
export const PREP_FEATURE_VERSION='prep-semantic-action-v1'
const C=16,zeros=()=>Array(C).fill(0),sum=vs=>Array.from({length:C},(_,i)=>vs.reduce((s,v)=>s+v[i],0))
const lex=(a,b)=>{for(let i=0;i<a.length;i++)if(a[i]!==b[i])return a[i]-b[i];return 0}
export function prepFeatures(o,legal,adapter=felixAdapter){
 if(o.phase!=='preparation'||o.terminal||!legal.length)throw Error('Prep actor observation required')
 const vectors=cs=>adapter.handDescriptors(cs)
 const descriptor=c=>adapter.descriptor(c)
 const profile=(vs,shield)=>{const p=adapter.profile(vs,shield);return [...p.stats,p.shields,...p.contrib,p.neutral,p.base,...p.types,p.robotAttacks,Number(p.balanced),Number(p.overwhelming),...p.scores0,...p.scores,...p.mask,p.commitScore]}
 const pool=cs=>{const vs=vectors(cs);return [...sum(vs),...Array.from({length:C},(_,i)=>vs.length?Math.max(...vs.map(v=>v[i])):0),vs.length]}
 const own=o.playerHand,enemy=o.opponentHand,discard=o.recycleCards,activated=new Set(o.activatedUids),v=vectors(own),w=vectors(enemy),shield=sum(w)[7],ownProfile=profile(v,shield)
 const active=[...new Map([...own,...discard].filter(c=>activated.has(c.uid)).map(c=>[c.uid,c])).values()]
 const state=[...pool(own.filter(c=>!activated.has(c.uid))),...pool(active),...pool(enemy),...pool(discard),...pool(o.discardPile),...ownProfile,...profile(w,sum(v)[7]),own.length,enemy.length,discard.length,activated.size,o.deckCount,Number(o.deckCountIsExact),o.steps,o.packNumber,o.picksThisPack,Number(o.firstPicker===o.side),Number(o.side==='opponent'),Number(o.opponentHandIsCurrent),...adapter.rules]
 const byid=new Map([...discard,...own].map(c=>[c.uid,c])),handids=new Set(own.map(c=>c.uid)),discardids=new Set(discard.map(c=>c.uid))
 const raw=legal.map(a=>{const kind=['prepare','skip-preparation','finish-preparation'].indexOf(a.type);if(kind<0)throw Error('Unsupported prep action');const src=byid.get(a.sourceUid),target=byid.get(a.targetUid),sv=src?descriptor(src):zeros(),tv=target?descriptor(target):zeros();let postCards=[...own];if(a.type==='prepare'&&a.cardId==='copy_card_in_hand')postCards[own.findIndex(c=>c.uid===a.sourceUid)]={...target,sacrificedPower:0};if(a.type==='prepare'&&a.cardId==='recycle_card')postCards.push(target);const post=vectors(postCards),p=profile(post,shield),delta=sum(post).map((x,i)=>x-sum(v)[i]);return [...[0,1,2].map(i=>Number(i===kind)),...sv,...tv,Number(Boolean(src)),Number(Boolean(target)),Number(handids.has(a.targetUid)),Number(discardids.has(a.targetUid)),Number(activated.has(a.sourceUid)),...p,...p.map((x,i)=>x-ownProfile[i]),...delta]})
 const actions=[...new Map(raw.map(x=>[JSON.stringify(x),x])).values()].sort(lex),map=new Map(actions.map((x,i)=>[JSON.stringify(x),i])),mapping=raw.map(x=>map.get(JSON.stringify(x))),representatives=actions.map((_,i)=>mapping.indexOf(i))
 if(state.length!==249||actions.some(x=>x.length!==106)||![...state,...actions.flat()].every(Number.isFinite))throw Error('Prep feature contract')
 return {state,actions,mapping,representatives}
}
const linear=(x,w,b)=>w.map((row,j)=>{let s=b[j];for(let i=0;i<x.length;i++)s+=row[i]*x[i];return s})
const normalize=(x,m,s)=>x.map((v,i)=>Math.max(-20,Math.min(20,(v-m[i])/s[i])))
const tanh=x=>x.map(Math.tanh)
export function createPrepPolicy(model,{adapter=felixAdapter}={}){
 if(model.feature_version!==PREP_FEATURE_VERSION)throw Error('Prep model contract')
 const w=model.state
 function probabilities(state,actions){
  const s=tanh(linear(tanh(linear(normalize(state,w.state_mean,w.state_scale),w['state_net.0.weight'],w['state_net.0.bias'])),w['state_net.2.weight'],w['state_net.2.bias']))
  const logits=actions.map(x=>{const a=tanh(linear(tanh(linear(normalize(x,w.action_mean,w.action_scale),w['action_net.0.weight'],w['action_net.0.bias'])),w['action_net.2.weight'],w['action_net.2.bias']));return linear(tanh(linear([...s,...a],w['choice_net.0.weight'],w['choice_net.0.bias'])),w['choice_net.2.weight'],w['choice_net.2.bias'])[0]})
  const max=Math.max(...logits),exp=logits.map(x=>Math.exp(x-max)),z=exp.reduce((a,b)=>a+b,0);return exp.map(x=>x/z)
 }
 function choose(o,legal,{rng=()=>globalThis.crypto.getRandomValues(new Uint32Array(1))[0]/4294967296}={}){
  if(legal.length===1)return {action:legal[0],chosenIndex:0,values:[1],probabilities:[1],semanticActions:1,forced:true,prepCheckpointSha256:model.checkpoint_sha256,version:model.version,kernel:'learned-preparation-policy',samples:0}
  const f=prepFeatures(o,legal,adapter),forced=f.actions.length===1,p=forced?[1]:probabilities(f.state,f.actions);let group=0
  if(!forced){const coin=rng();if(!(coin>=0&&coin<1))throw Error('Private prep RNG');let c=0;group=p.length-1;for(let i=0;i<p.length;i++){c+=p[i];if(coin<c){group=i;break}}}
  const chosenIndex=f.representatives[group]
  return {action:legal[chosenIndex],chosenIndex,values:f.mapping.map(i=>p[i]),probabilities:p,semanticActions:p.length,forced,prepCheckpointSha256:model.checkpoint_sha256,version:model.version,kernel:'learned-preparation-policy',samples:0}
 }
 return {choose,probabilities}
}
