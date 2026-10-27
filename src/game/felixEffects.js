// Felix v1: identities are resolved ONLY at the official-engine adapter boundary.
// The learned contract contains numeric mechanics, never card IDs or embeddings.
// Browser-safe invariant checks; the numeric contract matches the frozen research adapter.
const assert = { ok(value, message = 'Felix invariant') { if (!value) throw Error(message) },
  equal(a, b) { if (a !== b) throw Error('Felix invariant mismatch') },
  deepEqual(a, b) { if (JSON.stringify(a) !== JSON.stringify(b)) throw Error('Felix profile mismatch') } }
export const FACTIONS=['critter','robot','dragon']
export const CARD_FIELDS=['statC','statR','statD','attackC','attackR','attackD','neutralDamage','shields','product','shieldDamage','draw','discardHand','discardBonus','copyHandNonCopy','recoverOwnDiscard','physicalCard']
export const C=16,H=25,A=C+H,S=5*C+A,R=22,D=2*S+R+C+2
export function descriptor(card) {
  if(card.felixEffects){assert.equal(card.felixEffects.length,C);return [...card.felixEffects]}
  const v=Array(C).fill(0),effect=card.effect??{}
  for(const type of card.stats??[]){assert.ok(FACTIONS.includes(type));v[FACTIONS.indexOf(type)]++}
  if(effect.dmgType){const i=FACTIONS.indexOf(effect.dmgType);assert.ok(i>=0);v[3+i]=card.tabletopAttackUnits??(['murder_rabbit','robot_ulti','dragon_ulti','devour'].includes(card.id)?2:1)}
  v[7]=Math.max(0,effect.shield??0)
  if(card.id==='bite')v[6]=effect.dmg??2
  else if(card.id==='one_off_each')v[8]=1
  else if(card.id==='shield_is_dmg')v[9]=1
  else if(card.id==='draw_2_extra')v[10]=2
  else if(card.id==='draw_all_new_1'){v[11]=1;v[12]=1}
  else if(card.id==='copy_card_in_hand')v[13]=1
  else if(card.id==='recycle_card')v[14]=1
  else assert.ok(v.slice(0,8).some(Boolean),'Unsupported mechanic: '+card.id)
  v[15]=1;assert.ok(v.every(Number.isFinite));return v
}
const sum=xs=>xs.reduce((a,b)=>a+b,0)
const add=xs=>Array.from({length:C},(_,j)=>sum(xs.map(v=>v[j])))
const lex=(a,b)=>{for(let i=0;i<a.length;i++)if(a[i]!==b[i])return a[i]-b[i];return 0}
export function makeAdapter(tt,cards,semantics) {
  const catalog=cards.getExpandedCoreDeck({wildDeck:false,tabletop:'abilities-main'})
  const definitions=new Map(catalog.map(c=>[c.id,c])),e=c=>descriptor(c)
  const productRobot=tt.getTabletopProfile(['critter1','robot1','dragon1','one_off_each'].map(id=>definitions.get(id))).contributions.robot>0
  const zeroAll=tt.getTabletopProfile([]).types.length===3
  const totalThreshold=semantics.totalThreshold
  const dragonOnly=semantics.dragonOnly
  const blockBonus=semantics.blockBonus
  assert.ok(tt.MAIN_ABILITY_RULES.perfectBalance&&!tt.MAIN_ABILITY_RULES.robotPipReconfigure&&!tt.MAIN_ABILITY_RULES.unlimitedBaseReconfigure,'Unsupported faction conversion rules')
  const r=[...FACTIONS.map(f=>tt.MAIN_ABILITY_SHIELD_COST[f]),e(definitions.get('shield2'))[7],tt.MAIN_ABILITY_RULES.overwhelmingAt,tt.MAIN_ABILITY_RULES.overwhelmingBonus??0,Number(tt.MAIN_ABILITY_RULES.overwhelmingExtraStat),Number(tt.MAIN_ABILITY_RULES.perfectBalance),tt.MAIN_ABILITY_RULES.balanceBonus??tt.PERFECT_BALANCE_BONUS,tt.ROBOT_ULTI_ATTACK_COUNT,Number(productRobot),Number(zeroAll),Number(totalThreshold),Number(dragonOnly),Number(blockBonus),1,1,1,1,1,1,1]
  assert.equal(r.length,R);assert.ok(r.every(Number.isFinite))
  const deck=add(catalog.map(e)).map(v=>v/catalog.length)
  function profile(vs,enemyShields=0) {
    const a=add(vs),stats=a.slice(0,3),shields=a[7],units=a.slice(3,6)
    const product=stats[0]*stats[1]*stats[2]*a[8]
    const contrib=stats.map((v,i)=>v*units[i]);let neutral=a[6]+shields*a[9]
    if(productRobot)contrib[1]+=product;else neutral+=product
    const base=neutral+sum(contrib),largest=Math.max(...contrib)
    const types=largest>0?contrib.map(v=>Number(v===largest)):(zeroAll?[1,1,1]:[0,Number(base>0),0])
    const overwhelming=Boolean((!dragonOnly||types[2])&&(totalThreshold?base:contrib[2])>=r[4])
    const extra=overwhelming&&r[6]?units[2]+stats[0]*stats[1]*a[8]:0
    // v10/v11 applies the Dragon extra stat globally; v13 only to a legal Dragon choice.
    const robotAttacks=units[1]+Number(productRobot&&product>0)*a[8]
    const balanced=stats[1]>0&&stats[1]===robotAttacks
    const score=(i,sh)=>{
      const b=base+((!dragonOnly||i===2)?extra:0)
      const bonus=(i===1&&balanced?r[8]:0)+(overwhelming&&!r[6]?r[5]:0)
      return blockBonus?Math.max(0,b+bonus-sh*r[i]):Math.max(0,b-sh*r[i])+bonus
    }
    const scores0=types.map((ok,i)=>ok?score(i,0):0),scores=types.map((ok,i)=>ok?score(i,enemyShields):0)
    const legal=types.flatMap((ok,i)=>ok?[i]:[]).sort((i,j)=>scores0[j]-scores0[i]||Number(j===0)-Number(i===0)||r[i]-r[j]||i-j)
    const chosen=legal[0]??-1,mask=types.map((_,i)=>Number(i===chosen))
    // Source profile base/stats/contributions include the global v10/v11 extra.
    const globalExtra=(!dragonOnly||sum(types)===1&&types[2])&&overwhelming&&r[6]
    const outStats=stats.map((v,i)=>v+Number(globalExtra&&i===2))
    const outContrib=contrib.map((v,i)=>v+Number(globalExtra&&i===2)*units[2])
    if(globalExtra&&productRobot)outContrib[1]+=stats[0]*stats[1]*a[8]
    const outNeutral=neutral+Number(globalExtra&&!productRobot)*stats[0]*stats[1]*a[8]
    return {stats:outStats,shields,contrib:outContrib,neutral:outNeutral,base:base+(globalExtra?extra:0),types,robotAttacks,balanced,overwhelming,scores0,scores,chosen,mask,commitScore:chosen<0?0:scores[chosen]}
  }
  function hand(vs,enemyShields){
    const ordered=[...vs].sort(lex),p=profile(vs,enemyShields)
    const derived=[...p.stats,p.shields,...p.contrib,p.neutral,p.base,...p.types,p.robotAttacks,Number(p.balanced),Number(p.overwhelming),...p.scores0,...p.scores,...p.mask,p.commitScore]
    assert.equal(derived.length,H)
    return [...ordered.flat(),...Array((5-vs.length)*C).fill(0),...add(vs),...derived]
  }
  function encode(own,enemy){
    assert.ok(own.length===enemy.length&&own.length>=1&&own.length<=5)
    const a=own.map(e),b=enemy.map(e),x=[...hand(a,add(b)[7]),...hand(b,add(a)[7]),...r,...deck,own.length,5-own.length]
    assert.equal(x.length,D);assert.ok(x.every(Number.isFinite));return x
  }
  function oracle(own,enemy){
    const p=profile(own.map(e),sum(enemy.map(c=>e(c)[7]))),q=tt.getTabletopProfile(own)
    assert.deepEqual(p.types,FACTIONS.map(t=>Number(q.types.includes(t))))
    assert.equal(p.shields,q.shields);assert.equal(p.base,q.base)
    assert.deepEqual(p.stats,FACTIONS.map(t=>q.stats[t]));assert.deepEqual(p.contrib,FACTIONS.map(t=>q.contributions[t]));assert.equal(p.neutral,q.neutral)
    assert.equal(p.robotAttacks,q.robotAttacks);assert.equal(p.balanced,q.balanced)
    for(let i=0;i<3;i++)if(p.types[i]){assert.equal(p.scores0[i],tt.scoreTabletopHand(own,0,FACTIONS[i]).score);assert.equal(p.scores[i],tt.scoreTabletopHand(own,p===null?0:sum(enemy.map(c=>e(c)[7])),FACTIONS[i]).score)}
    assert.equal(p.chosen,FACTIONS.indexOf(tt.chooseTabletopType(own)))
  }
  return {encode,oracle,rules:r,deck,definitions,catalog,descriptor:e,profile}
}
export const swap=x=>[...x.slice(S,2*S),...x.slice(0,S),...x.slice(2*S)]
