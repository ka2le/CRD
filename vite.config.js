import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

function offlineApp() {
  let outputDirectory
  return {
    name: 'crd-offline-app',
    apply: 'build',
    configResolved(config) { outputDirectory = config.build.outDir },
    closeBundle() {
      function filesIn(directory) {
        return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
          const path = join(directory, entry.name)
          return entry.isDirectory() ? filesIn(path) : [path]
        })
      }
      const files = filesIn(outputDirectory).filter((path) => !path.endsWith('service-worker.js')).sort()
      const version = createHash('sha256')
      version.update(readFileSync('public/service-worker.js'))
      for (const path of files) version.update(relative(outputDirectory, path).replaceAll('\\', '/')).update(readFileSync(path))
      const assets = files.map((path) => relative(outputDirectory, path).replaceAll('\\', '/'))
      const worker = readFileSync('public/service-worker.js', 'utf8')
        .replace('__CRD_BUILD_VERSION__', version.digest('hex').slice(0, 20))
        .replace('/* __CRD_PRECACHE__ */ []', JSON.stringify(assets))
      writeFileSync(join(outputDirectory, 'service-worker.js'), worker)
    },
  }
}

// Boss co-op has a separate save version and cannot change normal matches/rooms.
const rulesFiles = [...readdirSync('src/game').filter((name) => name.endsWith('.js') && name !== 'bossBattle.js').sort().map((name) => `src/game/${name}`),
  'data/cards.json', 'data/tabletop-cards.json', 'data/new-cards.json', 'data/monster-cards.json', 'data/dan-opening.json', 'data/dan-pairs.json', 'data/dan-round3-net.json', 'data/david-opponents.json', 'data/david-opponents.meta.json']
const gameVersion = createHash('sha256').update(rulesFiles.map((path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')).join('\n')).digest('hex').slice(0, 16)

// https://vite.dev/config/
export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/CRD/' : '/',
  plugins: [react(), offlineApp()],
  define: { 'import.meta.env.CRD_GAME_VERSION': JSON.stringify(gameVersion) },
})
