import fs from 'node:fs'
import assert from 'node:assert/strict'
import { configureBalanceVariant } from './balance-variants.mjs'
import { getCoreCards } from '../src/game/cards.js'
import { toTabletopCard, scoreTabletopHand } from '../src/game/tabletop.js'

configureBalanceVariant('abilitiesv2-dragon7-immune-critter1')
const defs = new Map(getCoreCards({ tabletop: 'abilities-main' }).map(c => [c.id, c]))
const output = {}
for (const mode of ['draft', 'five-hand-discard']) {
  const games = fs.readFileSync(`.ai-runs/v2-dragon7-immune-2026-10-22/abilitiesv2-dragon7-immune-${mode}-normal-16/games.jsonl`, 'utf8').trim().split(/\r?\n/).map(JSON.parse)
  let critterHands = 0, improved = 0, gainedPower = 0
  for (const game of games) for (const [side, rival] of [['player', 'opponent'], ['opponent', 'player']]) {
    const old = game[side]
    const hand = game[`${side}Hand`].map(c => toTabletopCard({ ...defs.get(c.id), uid: c.uid }, 'abilities-main'))
    const fresh = scoreTabletopHand(hand, game[rival].shields, old.damageType)
    assert.equal(fresh.base, old.base)
    assert.equal(fresh.bonus, old.bonus)
    if (old.damageType !== 'critter') assert.equal(fresh.score, old.score)
    else {
      critterHands++
      assert.ok(fresh.score >= old.score)
      improved += Number(fresh.score > old.score)
      gainedPower += fresh.score - old.score
    }
  }
  output[mode] = { critterHands, improved, unchanged: critterHands-improved, gainedPower, weakened: 0 }
}
fs.writeFileSync('.ai-runs/v2-dragon7-critter1-2026-10-22/fixed-hands.json', JSON.stringify(output, null, 2))
console.log(JSON.stringify(output, null, 2))
