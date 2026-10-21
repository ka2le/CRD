// Mechanical same-final-hand comparison, explicitly separate from fresh self-play.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { configureBalanceVariant } from './balance-variants.mjs'
import { getCoreCards } from '../src/game/cards.js'
import { toTabletopCard, chooseTabletopType, resolveTabletopBattle } from '../src/game/tabletop.js'

const [root = '.ai-runs/normal-balance-2026-10-21', base, mode] = process.argv.slice(2)
if (!base) {
  const results = ['threshold', 'abilitiesv2'].flatMap((rules) => ['draft', 'five-hand-discard'].map((building) =>
    JSON.parse(execFileSync(process.execPath, [import.meta.filename, root, rules, building], { encoding: 'utf8' }))))
  fs.writeFileSync(path.join(root, 'same-hands-trials.json'), JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results, null, 2))
} else {
  const { rules } = configureBalanceVariant(`${base}-tuned`)
  const definitions = new Map(getCoreCards({ tabletop: rules }).map((c) => [c.id, c]))
  const games = fs.readFileSync(path.join(root, `${base}-${mode}-normal-16`, 'games.jsonl'), 'utf8').trim().split(/\r?\n/).map(JSON.parse)
  const records = games.map((g) => {
    const hands = ['player', 'opponent'].map((s) => g[`${s}Hand`].map((c) => toTabletopCard({ ...definitions.get(c.id), uid: c.uid }, rules)))
    const r = resolveTabletopBattle(...hands, { playerType: chooseTabletopType(hands[0]), opponentType: chooseTabletopType(hands[1]) })
    return { game: g.game, oldWinner: g.winner, newWinner: r.winner,
      player: { oldScore: g.player.score, newScore: r.player.score, oldType: g.player.damageType, newType: r.player.damageType },
      opponent: { oldScore: g.opponent.score, newScore: r.opponent.score, oldType: g.opponent.damageType, newType: r.opponent.damageType } }
  })
  const changes = records.filter((r) => r.oldWinner !== r.newWinner)
  console.log(JSON.stringify({ base, mode, games: records.length, changedOutcomes: changes.length,
    drawsBefore: records.filter((r) => r.oldWinner === 'tie').length, drawsAfter: records.filter((r) => r.newWinner === 'tie').length,
    changedHandScores: records.reduce((n, r) => n + Number(r.player.oldScore !== r.player.newScore) + Number(r.opponent.oldScore !== r.opponent.newScore), 0), changes }))
}
