import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { battleAnalysisProfile } from './balance-variants.mjs'
import { getCoreCards, getExpandedCoreDeck } from '../src/game/cards.js'

const definitions = new Map(getCoreCards().map((c) => [c.id, c]))
const hand = (ids) => ids.map((id, i) => ({ ...definitions.get(id), uid: `${id}-${i}` }))
test('Battle faction labels use the full CD cycle, preserve mixed ties and neutral damage', () => {
  assert.equal(battleAnalysisProfile(hand(['critter1', 'swarm', 'dragon1', 'dragons_breath'])).damageType, 'mixed')
  assert.equal(battleAnalysisProfile(hand(['bite'])).damageType, 'neutral')
  assert.equal(battleAnalysisProfile(hand(['critter1'])).damageType, null)
  assert.equal(battleAnalysisProfile(hand(['joker', 'one_off_each'])).damageType, 'robot')
  assert.equal(battleAnalysisProfile(hand(['dragon1', 'devour'])).contributions.dragon, 1.75)
})
test('Normal physical pool has printed copy counts, including one Copy and two double Critters', () => {
  for (const tabletop of [false, 'threshold', 'abilitiesv2']) {
    const pool = getExpandedCoreDeck({ tabletop, wildDeck: false })
    for (const card of getCoreCards({ tabletop })) assert.equal(pool.filter((c) => c.id === card.id).length, card.copies)
    assert.equal(pool.filter((c) => c.id === 'copy_card_in_hand').length, 1)
    assert.equal(pool.filter((c) => c.id === 'rabbit2').length, 2)
  }
})
test('Isolated trial parameters affect real shared scoring at both sides of cutoffs', () => {
  for (const [variant, expected] of [
    ['threshold', [2, 6, 12]], ['threshold-tuned', [3, 7, 12]],
    ['threshold-distinct8', [3, 7, 12]], ['threshold-distinct9', [3, 7, 8]],
    ['threshold-later8', [3, 4, 12]], ['threshold-later9', [3, 4, 8]],
    ['threshold-balanced', [3, 6, 11]], ['threshold-balanced-robot3', [3, 6, 11]], ['threshold-balanced-dragon8', [3, 6, 12]],
    ['abilitiesv2', [11, 12]], ['abilitiesv2-tuned', [7, 11]],
  ]) {
    const code = `import { configureBalanceVariant } from './scripts/balance-variants.mjs';
      import { getCoreCards } from './src/game/cards.js';
      import { toTabletopCard, scoreTabletopHand, chooseTabletopType, getTabletopBonus } from './src/game/tabletop.js';
      import assert from 'node:assert/strict';
      const {rules,thresholds}=configureBalanceVariant(${JSON.stringify(variant)});
      if(thresholds) for(const [f,{at,bonus}] of Object.entries(thresholds)) {
        assert.equal(getTabletopBonus(f,at-1),0);
        assert.equal(getTabletopBonus(f,at),bonus);
        assert.equal(getTabletopBonus(f,at+1),bonus);
      }
      const defs=new Map(getCoreCards({tabletop:rules}).map(c=>[c.id,c]));
      const score=ids=>{const h=ids.map((id,i)=>toTabletopCard({...defs.get(id),uid:id+i},rules));return scoreTabletopHand(h,0,chooseTabletopType(h)).score};
      const ids=rules==='threshold'?[['critter1','swarm'],['robot2','robot_ulti'],['dragon2','dragon2','dragon_ulti']]:[ [...Array(7).fill('dragon1'),'dragons_breath'],['dragon2','dragon2','dragon_ulti'] ];
      console.log(JSON.stringify(ids.map(score)));`
    assert.deepEqual(JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' })), expected)
  }
})
test('Study runner rejects Wild before creating a run', () => {
  assert.throws(() => execFileSync(process.execPath, ['scripts/tabletop-balance.mjs', 'abilitiesv2', 'draft', '1', '1', '1', 'wild'], { stdio: 'pipe' }), /Normal Deck/)
})
