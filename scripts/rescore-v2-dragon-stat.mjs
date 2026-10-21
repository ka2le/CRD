// Hold baseline cards fixed; separate this mechanical check from new search play.
import fs from 'node:fs'
import path from 'node:path'
import { configureBalanceVariant } from './balance-variants.mjs'
import { getCoreCards } from '../src/game/cards.js'
import { toTabletopCard, chooseTabletopType, resolveTabletopBattle } from '../src/game/tabletop.js'

const [baseline = '.ai-runs/normal-balance-2026-10-21', output = '.ai-runs/v2-dragon-stat-2026-10-21'] = process.argv.slice(2)
const { rules } = configureBalanceVariant('abilitiesv2-extra-stat')
const definitions = new Map(getCoreCards({ tabletop: rules }).map((c) => [c.id, c]))
const summaries = ['draft', 'five-hand-discard'].map((mode) => {
  const games = fs.readFileSync(path.join(baseline, `abilitiesv2-${mode}-normal-16/games.jsonl`), 'utf8').trim().split(/\r?\n/).map(JSON.parse)
  const records = games.map((g) => {
    const hands = ['player', 'opponent'].map((s) => g[`${s}Hand`].map((c) => toTabletopCard({ ...definitions.get(c.id), uid: c.uid }, rules)))
    const r = resolveTabletopBattle(...hands, { playerType: chooseTabletopType(hands[0]), opponentType: chooseTabletopType(hands[1]) })
    return { game: g.game, oldWinner: g.winner, newWinner: r.winner,
      ...Object.fromEntries(['player', 'opponent'].map((side) => [side, {
        oldScore: g[side].score, newScore: r[side].score, oldType: g[side].damageType, newType: r[side].damageType,
        oldOverwhelming: g[side].overwhelming, newOverwhelming: r[side].overwhelming,
        oldBase: g[side].base, newBase: r[side].base,
      }])) }
  })
  const activated = records.flatMap((g) => ['player', 'opponent'].map((s) => g[s])).filter((h) => h.oldOverwhelming)
  return { mode, games: records.length, changedOutcomes: records.filter((r) => r.oldWinner !== r.newWinner).length,
    drawsBefore: records.filter((r) => r.oldWinner === 'tie').length, drawsAfter: records.filter((r) => r.newWinner === 'tie').length,
    activated: activated.length, weaker: activated.filter((h) => h.newScore < h.oldScore).length,
    equal: activated.filter((h) => h.newScore === h.oldScore).length, stronger: activated.filter((h) => h.newScore > h.oldScore).length,
    meanScoreChangeWhenActivated: activated.reduce((n, h) => n + h.newScore - h.oldScore, 0) / activated.length,
    records }
})
fs.writeFileSync(path.join(output, 'same-hands.json'), JSON.stringify(summaries, null, 2))
console.log(JSON.stringify(summaries.map(({ records, ...s }) => s), null, 2))
