import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { configureBalanceVariant, battleAnalysisProfile } from './balance-variants.mjs'
import { createHeadlessGame, stepHeadlessGame } from '../src/game/headlessGame.js'
import { getCoreCards } from '../src/game/cards.js'
import { searchDecision, searchPreparationDecision } from '../src/game/searchAi.js'

const [root = '.ai-runs/normal-balance-2026-10-21', arm] = process.argv.slice(2)
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
const lines = (p) => fs.readFileSync(p, 'utf8').trim().split(/\r?\n/).map(JSON.parse)
const compact = (cards) => cards.map(({ id, uid }) => ({ id, uid }))
if (!arm) {
  const study = read(path.join(root, 'study.json'))
  const results = study.jobs.map((job) => {
    const name = `${job.variant}-${job.mode}-normal-${study.samples}`
    return JSON.parse(execFileSync(process.execPath, [import.meta.filename, root, name], { encoding: 'utf8', maxBuffer: 1024 * 1024 }))
  })
  for (const mode of ['draft', 'five-hand-discard']) for (const base of ['threshold', 'abilitiesv2']) {
    const group = results.filter((r) => r.variant.startsWith(base) && r.mode === mode)
    for (const r of group.slice(1)) assert.equal(group[0].initialDealsHash, r.initialDealsHash, 'Same-ruleset variant starting deals must match')
  }
  const output = { gamesReplayed: results.reduce((n, r) => n + r.games, 0), rootsVerified: results.reduce((n, r) => n + r.roots, 0),
    simulationsVerified: results.reduce((n, r) => n + r.simulations, 0),
    searchRootsRecomputed: results.reduce((n, r) => n + r.searchAudits.length, 0), pairedInitialDealsVerified: true, arms: results }
  fs.writeFileSync(path.join(root, 'verification.json'), JSON.stringify(output, null, 2))
  console.log(JSON.stringify(output, null, 2))
} else {
  const dir = path.join(root, arm), manifest = read(path.join(dir, 'complete.json'))
  assert.equal(manifest.deck, 'normal')
  assert.equal(manifest.samples, 16)
  const variant = configureBalanceVariant(manifest.variant)
  assert.equal(variant.rules, manifest.rules)
  for (const card of getCoreCards({ tabletop: variant.rules })) assert.equal(manifest.poolCounts[card.id], card.copies)
  for (const [file, expected] of Object.entries(manifest.sourceHashes)) {
    assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root, 'source', file))).digest('hex'), expected)
  }
  const games = lines(path.join(dir, 'games.jsonl')), decisions = lines(path.join(dir, 'decisions.jsonl'))
  assert.equal(games.length, manifest.games)
  assert.equal(new Set(games.map((g) => g.seed)).size, games.length)
  let cursor = 0, simulations = 0
  const audited = new Set(), searchAudits = []
  for (const g of games) {
    let state = createHeadlessGame({ tabletop: variant.rules, mode: manifest.mode, wildDeck: false, control: 'both', seed: g.seed, firstPicker: g.firstPicker })
    const initial = [...state.game.playerHand, ...state.game.opponentHand, ...(state.game.draftRow ?? []), ...state.game.deck]
    assert.equal(createHash('sha256').update(JSON.stringify(compact(initial))).digest('hex'), g.initialDealHash)
    while (!state.terminal) {
      const d = decisions[cursor++]
      assert.equal(d.game, g.game); assert.equal(d.actor, state.actor)
      assert.deepEqual(d.hand, compact((state.preparation ?? state.game)[`${state.actor}Hand`]))
      if (d.samples) {
        assert.equal(d.samples, manifest.samples)
        assert.equal(d.values.length, d.actions.length)
        assert.equal(d.simulations, d.samples * d.actions.length)
        for (let i = 0; i < d.values.length; i++) {
          const c = d.counts[i]
          assert.equal(c.wins + c.draws + c.losses, d.samples)
          assert.equal((c.wins - c.losses) / d.samples, d.values[i])
        }
        simulations += d.simulations
        const phase = state.preparation ? 'preparation' : 'building'
        if (!audited.has(phase)) {
          const options = { minSamples: manifest.samples, maxSamples: manifest.samples, timeBudgetMs: 1e12, rollout: 'prep-lookahead', seed: d.planningSeed }
          const fresh = state.preparation ? searchPreparationDecision(state.preparation, state.game, state.actor, options)
            : searchDecision(state.game, state.actor, options)
          for (const key of ['action', 'values', 'counts', 'samples', 'chosenIndex', 'baselineIndex', 'simulations']) assert.deepEqual(fresh[key], d[key], `Search audit ${arm}/${phase}/${key}`)
          audited.add(phase)
          searchAudits.push({ game: d.game, step: d.step, phase, samples: fresh.samples, simulations: fresh.simulations })
        }
      }
      state = stepHeadlessGame(state, d.action)
    }
    const result = state.battleResult
    assert.equal(result.winner, g.winner)
    assert.equal(result.reason, g.reason)
    for (const side of ['player', 'opponent']) {
      assert.deepEqual(compact(result[`${side}Hand`]), g[`${side}Hand`])
      assert.deepEqual(result[side] ?? battleAnalysisProfile(result[`${side}Hand`]), g[side])
    }
    if (!variant.rules) assert.equal(g.digitalWinner, result.winner)
  }
  assert.equal(cursor, decisions.length); assert.equal(cursor, manifest.roots); assert.equal(simulations, manifest.simulations)
  assert.equal(audited.size, 2)
  console.log(JSON.stringify({ variant: manifest.variant, mode: manifest.mode, games: games.length, roots: cursor, simulations, searchAudits,
    initialDealsHash: createHash('sha256').update(games.map((g) => g.initialDealHash).join('')).digest('hex') }))
}
