import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveTabletopBattle, chooseTabletopType } from '../src/game/tabletop.js'
import { createHeadlessGame, stepHeadlessGame, chooseHeadlessBaselineAction } from '../src/game/headlessGame.js'
import { createDevScenario } from '../src/game/devScenarios.js'
import { buildTabletopResolutionPlan, canAnimateTabletopResolution, finalLedgerSide, RESOLUTION_SIDES } from '../src/game/tabletopResolution.js'

// Replays the plan the way the animation counts it and returns the final ledger numbers.
function replay(side) {
  const stats = { critter: 0, robot: 0, dragon: 0 }
  for (const entry of side.stats) for (const card of entry.cards) stats[entry.type] += card.count
  const damage = { critter: 0, robot: 0, dragon: 0, neutral: 0 }
  for (const pulse of side.pulses) for (let i = 0; i < pulse.stats; i++) for (const card of pulse.cards) damage[pulse.type] += card.units
  for (const attack of side.direct) damage[attack.type] += attack.power
  assert.deepEqual(stats, side.baseStats)
  assert.deepEqual(damage, side.baseDamage)
  let base = Object.values(damage).reduce((sum, value) => sum + value, 0)
  assert.equal(base, side.base)
  if (side.overwhelming) {
    assert(side.overwhelming.power >= side.overwhelming.at)
    stats.dragon += side.overwhelming.extraStats.dragon
    for (const entry of side.overwhelming.deltas) { damage[entry.type] += entry.delta; base += entry.delta }
  }
  let bonus = 0
  let blocked = 0
  if (side.balance) {
    const pips = side.balance.statPips.reduce((sum, card) => sum + card.count, 0)
    const units = side.balance.attackUnits.reduce((sum, card) => sum + card.units, 0)
    assert.equal(pips, units)
    assert.equal(units, side.balance.count)
    bonus += side.balance.bonus
  }
  if (side.rules === 'abilities-main') {
    for (const uid of side.shields.cards) blocked = Math.min(base + bonus, blocked + side.shields.cost * side.shields.pointsByUid[uid])
  } else {
    for (const uid of side.shields.cards) blocked = Math.min(base, blocked + side.shields.cost * side.shields.pointsByUid[uid])
    bonus += side.thresholdBonus
  }
  return { stats, damage, base, bonus, blocked, total: base + bonus - blocked }
}

test('resolution plans recount every tabletop battle to the scorer result', () => {
  let games = 0
  let overwhelming = 0
  let balanced = 0
  for (const tabletop of ['abilities-main', 'threshold']) {
    for (const mode of ['draft', 'five-hand-discard']) {
      for (let seed = 1; seed <= 40; seed++) {
        let state = createHeadlessGame({ tabletop, mode, control: 'both', seed })
        while (!state.terminal) state = stepHeadlessGame(state, chooseHeadlessBaselineAction(state))
        const { playerHand, opponentHand } = state.battleResult
        const result = resolveTabletopBattle(playerHand, opponentHand, { playerType: chooseTabletopType(playerHand) })
        assert(canAnimateTabletopResolution(result))
        const plan = buildTabletopResolutionPlan(result)
        for (const key of RESOLUTION_SIDES) {
          const side = plan[key]
          const counted = replay(side)
          assert.deepEqual(counted.stats, side.final.stats)
          assert.deepEqual(counted.damage, side.final.damage)
          assert.equal(counted.base, side.final.base)
          assert.equal(counted.bonus, side.final.bonus)
          assert.equal(counted.blocked, side.final.blocked)
          assert.equal(counted.total, result[key].score)
          assert.equal(finalLedgerSide(side).total, result[key].score)
          if (side.overwhelming) overwhelming++
          if (side.balance) balanced++
        }
        games++
      }
    }
  }
  assert.equal(games, 160)
  assert(overwhelming > 0 && balanced > 0, `exercise both abilities (${overwhelming}/${balanced})`)
})

test('resolution plans name the abilities and the Critter tiebreak', () => {
  const plan = (name, playerType) => {
    const { game } = createDevScenario(name === 'critter-tie' ? {
      name: 'plain',
      playerCards: ['robot_critter', 'robot_ulti', 'robot_critter', 'murder_rabbit', 'critter1'],
      opponentCards: ['bite', 'joker', 'dragon_ulti', 'joker', 'dragon1'],
    } : { name })
    const result = resolveTabletopBattle(game.playerHand, game.opponentHand,
      { playerType: playerType ?? chooseTabletopType(game.playerHand) })
    return { result, plan: buildTabletopResolutionPlan(result) }
  }
  const bonuses = plan('bonuses').plan
  assert.equal(bonuses.player.mainType, 'dragon')
  assert.deepEqual(bonuses.player.overwhelming.extraStats, { dragon: 1 })
  assert.equal(bonuses.player.baseDamage.dragon, 8)
  assert.equal(bonuses.player.final.damage.dragon, 10)

  const balance = plan('perfect-balance').plan
  assert.equal(balance.player.mainType, 'robot')
  assert.equal(balance.player.balance.count, 3)
  assert.equal(balance.player.shields.cards.length, 1)
  assert.equal(balance.player.shields.cost, 1)
  assert.equal(Object.values(balance.player.shields.pointsByUid).reduce((a,b)=>a+b,0), 2)

  const { result, plan: tie } = plan('critter-tie')
  assert.equal(result.player.score, result.opponent.score)
  assert.equal(tie.tiebreak, 'player')
  assert.equal(tie.player.mainType, 'critter')
  assert.equal(tie.player.balance, null, 'Perfect Balance needs a Robot main faction')
  assert.equal(tie.opponent.direct.find((attack) => attack.type === 'neutral').power, 2)
})

test('only current Abilities and Threshold battles are animated', () => {
  const { game } = createDevScenario({ name: 'plain', rules: 'abilities-prototype' })
  const result = resolveTabletopBattle(game.playerHand, game.opponentHand, { playerType: chooseTabletopType(game.playerHand) })
  assert.equal(canAnimateTabletopResolution(result), false)
  assert.equal(buildTabletopResolutionPlan(result), null)
  assert.equal(canAnimateTabletopResolution({ mode: 'battle' }), false)
})
