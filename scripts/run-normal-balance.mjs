// Bounded concurrent processes; each owns one immutable trial configuration.
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const [root = '.ai-runs/normal-balance-2026-10-21', gamesArg = '500', samplesArg = '16', concurrencyArg = '6',
  variantsArg = 'abilities-main', seedBaseArg = '31000000'] = process.argv.slice(2)
const games = Number(gamesArg), samples = Number(samplesArg), concurrency = Number(concurrencyArg)
if (![games, samples, concurrency].every((x) => Number.isInteger(x) && x > 0) || concurrency > 10) throw new Error('Invalid study settings')
const variants = variantsArg.split(',')
if (!variants.length || new Set(variants).size !== variants.length || variants.some((v) => !/^[a-z0-9-]+$/.test(v))) throw new Error('Invalid variant list')
const seedBase = Number(seedBaseArg)
if (!Number.isSafeInteger(seedBase) || seedBase < 1) throw new Error('Invalid seed base')
const jobs = variants.flatMap((variant) => ['draft', 'five-hand-discard'].map((mode) => ({ variant, mode, seed: seedBase + (mode === 'draft' ? 0 : 1000000) })))
fs.mkdirSync(root, { recursive: true })
if (fs.existsSync(path.join(root, 'study.json'))) throw new Error('Study root already exists; preserve evidence')
fs.writeFileSync(path.join(root, 'study.json'), JSON.stringify({ gamesPerArm: games, samples, deck: 'normal', variants, jobs, startedAt: new Date().toISOString() }, null, 2))
// Preserve source for reproduction before workers start.
for (const source of ['src/game', 'data', 'scripts']) fs.cpSync(source, path.join(root, 'source', source), { recursive: true })
fs.copyFileSync('package.json', path.join(root, 'source/package.json'))
let cursor = 0
const results = []
async function worker() {
  while (cursor < jobs.length) {
    const job = jobs[cursor++]
    const name = `${job.variant}-${job.mode}-normal-${samples}`
    console.log(`START ${name}`)
    const log = fs.openSync(path.join(root, `${name}.log`), 'wx')
    const code = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['scripts/tabletop-balance.mjs', job.variant, job.mode, String(games), String(samples), String(job.seed), 'normal', root],
        { stdio: ['ignore', log, log], windowsHide: true })
      child.on('error', reject)
      child.on('exit', resolve)
    })
    fs.closeSync(log)
    results.push({ ...job, code })
    console.log(`${code === 0 ? 'DONE' : 'FAILED'} ${name}`)
    fs.writeFileSync(path.join(root, 'jobs.json'), JSON.stringify(results, null, 2))
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker))
if (results.some((r) => r.code !== 0)) process.exitCode = 1
else fs.writeFileSync(path.join(root, 'collection-complete.json'), JSON.stringify({ arms: results.length, games: games * results.length, finishedAt: new Date().toISOString() }, null, 2))
