// Deterministic mechanics update of the existing hand bank. No new games or fitting.
import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { getCoreCards } from '../src/game/cards.js'
import * as tt from '../src/game/tabletop.js'
const source=process.argv[2]
assert(source,'Pass existing examples.jsonl')
const raw=fs.readFileSync(source),sha=x=>createHash('sha256').update(x).digest('hex')
const records=raw.toString().trim().split('\n').map(JSON.parse)
assert.equal(records.length,10000)
const file='data/dan-discard-six-combat-prior.json',old=JSON.parse(fs.readFileSync(file))
assert.equal(old.version,'dan-discard-six-combat-prior-v1','One-time revision; do not rerun over v2')
const defs=new Map(getCoreCards({tabletop:'abilities-main'}).map(c=>[c.id,c]))
const hydrate=hand=>hand.map(c=>tt.toTabletopCard({...defs.get(c.id),...c},'abilities-main'))
function compact(hand){const faction=tt.chooseTabletopType(hand);return{faction,damage0:tt.scoreTabletopHand(hand,0,faction).score,shields:tt.getTabletopProfile(hand).shields}}
function histogram(){
  const bins=new Map()
  for(const row of records){
    const hand=hydrate(row.final),a=compact(hand),key=JSON.stringify(a)
    if(!bins.has(key))bins.set(key,{...a,count:0})
    bins.get(key).count++
    for(let shield=0;shield<=12;shield++)assert.equal(tt.scoreTabletopHand(hand,shield,a.faction).score,Math.max(0,a.damage0-tt.MAIN_ABILITY_SHIELD_COST[a.faction]*shield))
  }
  return [...bins.values()]
}
tt.MAIN_ABILITY_RULES.shieldValue=1
Object.assign(tt.MAIN_ABILITY_SHIELD_COST,{critter:1,robot:2,dragon:0})
assert.deepEqual(histogram(),old.histogram,'Reconstruct original bank before changing mechanics')
tt.MAIN_ABILITY_RULES.shieldValue=2
Object.assign(tt.MAIN_ABILITY_SHIELD_COST,{critter:1,robot:1,dragon:0})
const updated=histogram()
for(let i=0;i<1000;i++){
  const a=hydrate(records[i*7%records.length].final),b=hydrate(records[(i*7919+23)%records.length].enemy)
  const x=compact(a),y=compact(b),native=tt.resolveTabletopBattle(a,b,{playerType:x.faction,opponentType:y.faction})
  const margin=Math.max(0,x.damage0-tt.MAIN_ABILITY_SHIELD_COST[x.faction]*y.shields)-Math.max(0,y.damage0-tt.MAIN_ABILITY_SHIELD_COST[y.faction]*x.shields)
  const winner=margin>0?'player':margin<0?'opponent':(x.faction==='critter')!==(y.faction==='critter')?(x.faction==='critter'?'player':'opponent'):'tie'
  assert.equal(winner,native.winner);assert.equal(margin,native.player.score-native.opponent.score)
}
const result={...old,version:'dan-discard-six-combat-prior-shield-points-v2',bins:updated.length,
  source:old.source,source_examples_sha256:sha(raw),previousVersion:old.version,
  mechanicsRevision:'Two shield points/card; Critter/Robot lose1 per point; Dragon immune. Shield is Damage uses summed shield points.',
  scope:'Same 10000 previously prepared TRAIN-derived hands, deterministically rescored under Abilities-main v13. No new preparation optimization, generation or fitting. Pool-independent approximation and old preparation-selection bias remain.',histogram:updated}
fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n')
fs.writeFileSync('.ai-runs/streamlined-shields-adoption-20261026-v1/prior-rescore.json',JSON.stringify({passed:true,examples:10000,
  originalBankExactlyReconstructed:true,newBins:updated.length,unshieldedAndShieldPointChecks:260000,recombinedBattles:1000,
  sourceExamplesSha256:sha(raw),outputSha256:sha(fs.readFileSync(file)),newGames:0,fitting:false},null,2))
console.log(JSON.stringify({passed:true,examples:10000,oldBins:old.bins,newBins:updated.length,noNewGames:true}))
