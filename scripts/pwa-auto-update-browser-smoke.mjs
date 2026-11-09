// Isolated production-build upgrade test. The three directories can be copies
// with distinct <meta name="crd-qa-build"> tags and distinct worker cache names.
import assert from 'node:assert/strict'
import http from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve, join, extname } from 'node:path'
import { createRequire } from 'node:module'

const { chromium } = createRequire(import.meta.url)(process.env.CRD_PLAYWRIGHT_MODULE || 'playwright')
const previous = resolve(process.env.CRD_PREVIOUS_BUILD_DIR)
const next = resolve(process.env.CRD_NEXT_BUILD_DIR)
const final = resolve(process.env.CRD_FINAL_BUILD_DIR)
let directory = previous
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.webp': 'image/webp' }
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost')
    const name = url.pathname.slice('/CRD/'.length) || 'index.html'
    if (!url.pathname.startsWith('/CRD/') || name.includes('..')) throw new Error('Invalid path')
    const data = await readFile(join(directory, name))
    response.writeHead(200, { 'Content-Type': mime[extname(name)] || 'application/octet-stream', 'Cache-Control': 'no-store' })
    response.end(data)
  } catch { response.writeHead(404).end() }
})
await new Promise((done) => server.listen(4222, '127.0.0.1', done))
const browser = await chromium.launch({ headless: true })
const errors = []
try {
  const context = await browser.newContext()
  await context.addInitScript(() => {
    if (location.origin !== 'http://127.0.0.1:4222') return
    if (!localStorage.getItem('crd-dev-settings-v1')) localStorage.setItem('crd-dev-settings-v1', JSON.stringify({
      gameMode: 'draft', opponentAi: 'rules', tabletop: 'abilities-new-cards', testing: true,
    }))
  })
  context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)))
  const url = 'http://127.0.0.1:4222/CRD/'
  const build = (page) => page.locator('meta[name="crd-qa-build"]').getAttribute('content')
  const waitBuild = (page, name) => page.waitForFunction((expected) =>
    document.querySelector('meta[name="crd-qa-build"]')?.content === expected, name)
  const deal = (page) => page.evaluate(() => {
    const game = JSON.parse(localStorage.getItem('crd-local-game-v1')).state.game
    return [game.playerHand, game.opponentHand, game.deck, game.draftRow].map((cards) => cards.map((card) => card.uid))
  })
  const page = await context.newPage()
  await page.goto(url)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  const saved = await deal(page)
  directory = next
  // This is the user action being tested: no update parameter and no injected
  // registration.update() call. Registration on the normal reload discovers it.
  await page.reload()
  await waitBuild(page, 'next-a')
  assert.equal(new URL(page.url()).search, '')
  assert.deepEqual(await deal(page), saved)
  await page.evaluate(() => navigator.serviceWorker.ready)

  const playing = await context.newPage()
  await playing.goto(url)
  await playing.getByRole('button', { name: 'Open menu', exact: true }).click()
  assert.equal(await build(playing), 'next-a')
  let playingNavigations = 0
  playing.on('framenavigated', (frame) => { if (frame === playing.mainFrame()) playingNavigations++ })
  const playingDeal = await deal(playing)
  directory = final
  const opening = await context.newPage()
  await opening.goto(url)
  await waitBuild(opening, 'next-b')
  assert.equal(new URL(opening.url()).search, '')
  assert.equal(await build(playing), 'next-a')
  assert.equal(playingNavigations, 0, 'an active game must not reload itself')
  const update = playing.getByRole('button', { name: 'Update game', exact: true })
  await update.waitFor()
  assert.equal(await playing.locator('.screen-menu__trigger.has-update').count(), 1)
  await update.click()
  await waitBuild(playing, 'next-b')
  assert.deepEqual(await deal(playing), playingDeal)

  await context.setOffline(true)
  const offline = await context.newPage()
  await offline.goto(url)
  await waitBuild(offline, 'next-b')
  await offline.getByRole('button', { name: 'Open menu', exact: true }).waitFor()
  assert.deepEqual(errors, [])
  const result = { pass: true, ordinaryReloadMigratesLegacy: true, ordinaryOpenAutoUpdates: true,
    noQueryParameter: true, activeGameNotInterrupted: true, menuUpdateWorks: true,
    savedDealPreserved: true, latestBuildWorksOffline: true, errors }
  await writeFile(process.env.CRD_BROWSER_RECEIPT || 'logs/pwa-auto-update-browser.json', JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
} finally {
  await browser.close()
  await new Promise((done) => server.close(done))
}
