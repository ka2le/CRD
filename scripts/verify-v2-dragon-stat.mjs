import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

const root = '.ai-runs/v2-dragon-stat-2026-10-21'
const baseline = '.ai-runs/normal-balance-2026-10-21'
const verify = (...args) => JSON.parse(execFileSync(process.execPath, ['scripts/verify-normal-balance.mjs', ...args], { encoding: 'utf8', maxBuffer: 1024 * 1024 }))
const trial = verify(root)
const baselineArms = ['draft', 'five-hand-discard'].map((mode) => verify(baseline, `abilitiesv2-${mode}-normal-16`))
for (const a of baselineArms) assert.equal(a.initialDealsHash, trial.arms.find((b) => b.mode === a.mode).initialDealsHash)
const output = { baselineArms, trial, matchedBaselineDealsVerified: true,
  totalGamesReplayed: trial.gamesReplayed + baselineArms.reduce((n, a) => n + a.games, 0),
  totalSearchRootsRecomputed: trial.searchRootsRecomputed + baselineArms.reduce((n, a) => n + a.searchAudits.length, 0) }
fs.writeFileSync(path.join(root, 'comparison-verification.json'), JSON.stringify(output, null, 2))
console.log(JSON.stringify(output, null, 2))
