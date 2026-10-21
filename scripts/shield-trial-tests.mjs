import test from 'node:test'
import { execFileSync } from 'node:child_process'

function check(variant, assertions) {
  const code = `import assert from 'node:assert/strict';
    import { configureBalanceVariant } from './scripts/balance-variants.mjs';
    import { getCoreCards } from './src/game/cards.js';
    import { toTabletopCard, scoreTabletopHand, chooseTabletopType, resolveTabletopBattle, FLEXIBLE_RULES, TABLETOP_V2_SHIELD_COST as TABLETOP_SHIELD_COST } from './src/game/tabletop.js';
    configureBalanceVariant(${JSON.stringify(variant)});
    const defs=new Map(getCoreCards({tabletop:'abilitiesv2'}).map(c=>[c.id,c]));
    const hand=(...ids)=>ids.map((id,i)=>toTabletopCard({...defs.get(id),uid:id+i},'abilitiesv2'));
    const score=(cards,shields=0,type=chooseTabletopType(cards))=>scoreTabletopHand(cards,shields,type);
    ${assertions}`
  execFileSync(process.execPath, ['--input-type=module', '-e', code], { stdio: 'pipe' })
}

for (const dragonCost of [0, 1]) {
  test(`Perfect Balance shields 2/2/${dragonCost} preserve stat balance and pre-shield Dragon extra stat`, () => {
    check(`abilitiesv2-perfect-balance-shields22${dragonCost}`, `
      assert.deepEqual(TABLETOP_SHIELD_COST,{critter:2,robot:2,dragon:${dragonCost}});
      const cards=hand('robot2','robot_ulti','chameleon');
      const robot=score(cards,1,'robot');
      assert.deepEqual([robot.base,robot.power,robot.bonus,robot.score],[4,2,3,5]);
      assert.equal(robot.balanced,true);
      assert.equal(robot.reconfigured,null);
      assert.equal(score(cards,10,'robot').score,3);
      assert.equal(score(cards,1,'critter').bonus,0);
      assert.equal(score(hand('robot1','robot_ulti')).bonus,0);
      const dragon=hand('dragon2','dragon1','dragon_ulti');
      const p=score(dragon,1);
      assert.deepEqual([p.dragonBase,p.overwhelming,p.stats.dragon,p.shieldPenalty,p.score],
        [6,true,4,${dragonCost},8-${dragonCost}]);
      assert.equal(score(hand('rabbit2','swarm'),1).score,0);
    `)
  })
}

test('Robot-immunity variant changes only Robot shields, retaining Dragon stats and Critter penalty', () => {
  check('abilitiesv2-robot-immune', `
    assert.deepEqual(TABLETOP_SHIELD_COST,{critter:2,robot:0,dragon:0});
    const robot=hand('robot2','robot2','robot_attack');
    assert.equal(score(robot,10).score,score(robot).score);
    assert.equal(score(robot,10).shieldPenalty,0);
    assert(score(robot).reconfigured);
    const dragon=hand('dragon2','dragon1','dragon_ulti');
    assert.equal(score(dragon,10).stats.dragon,4);
    assert.equal(score(dragon,10).score,8);
    assert.equal(score(hand('rabbit2','swarm'),1).score,0);
    const blocked=hand('rabbit2','swarm','swarm','robot2','robot1');
    assert.equal(score(blocked).damageType,'critter');
    assert.equal(score(blocked).reconfigured,null);
  `)
})

test('Dragon flat bonus checks Dragon contribution after the actual shield penalty, without an extra stat', () => {
  check('abilitiesv2-dragon-shield', `
    assert.deepEqual(TABLETOP_SHIELD_COST,{critter:2,robot:0,dragon:1});
    const seven=hand(...Array(7).fill('dragon1'),'dragons_breath');
    assert.equal(score(seven).score,11);
    assert.deepEqual([score(seven,1).power,score(seven,1).dragonThresholdPower,score(seven,1).bonus,score(seven,1).overwhelming],[6,6,0,false]);
    const eight=hand('dragon2','dragon2','dragon_ulti');
    assert.deepEqual([score(eight,1).stats.dragon,score(eight,1).power,score(eight,1).bonus,score(eight,1).score],[4,7,4,11]);
    assert.equal(score(eight,2).score,6);
    assert.equal(score(eight,2).overwhelming,false);
    assert.equal(score(eight,20).score,0);
    const mixed=[...seven,...hand('bite')];
    assert.equal(score(mixed,1).power,7);
    assert.equal(score(mixed,1).bonus,0); // neutral power cannot fill the Dragon cutoff
    const robot=hand('robot_ulti','robot_attack','robot_attack');
    assert.equal(score(robot,10).score,score(robot).score);
    assert.equal(score(robot,10).shieldPenalty,0);
    const result=resolveTabletopBattle(eight,hand('shield2'),{playerType:'dragon'});
    assert.equal(result.player.score,11);
  `)
})

test('Mixed hands retain v2 contribution-based bonus and apply the chosen main faction shield cost', () => {
  check('abilitiesv2-dragon-shield', `
    const cards=hand('dragon2','dragon2','dragon_ulti','chameleon');
    assert.equal(score(cards,1,'dragon').score,11);
    assert.equal(score(cards,1,'robot').score,12);
    assert.equal(score(cards,1,'critter').score,6);
    assert.equal(score(cards,1,'robot').bonus,4);
    assert.equal(score(cards,1,'critter').bonus,0);
    assert.equal(score(cards,1,'critter').reconfigured,null);
  `)
})
