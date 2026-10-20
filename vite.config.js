import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'

const rulesFiles = [...readdirSync('src/game').filter((name) => name.endsWith('.js')).sort().map((name) => `src/game/${name}`),
  'src/hooks/useGameSession.js', 'src/network/roomGame.js', 'src/network/protocol.js', 'data/cards.json', 'data/tabletop-cards.json']
const gameVersion = createHash('sha256').update(rulesFiles.map((path) => readFileSync(path, 'utf8')).join('\n')).digest('hex').slice(0, 16)

// https://vite.dev/config/
export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/CRD/' : '/',
  plugins: [react()],
  define: { 'import.meta.env.CRD_GAME_VERSION': JSON.stringify(gameVersion) },
})
