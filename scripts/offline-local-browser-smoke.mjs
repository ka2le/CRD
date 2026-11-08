// Run against a production preview with Playwright available, optionally via
// CRD_PLAYWRIGHT_MODULE and CRD_BROWSER_EXECUTABLE on a shared tooling runtime.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const { chromium } = createRequire(import.meta.url)(process.env.CRD_PLAYWRIGHT_MODULE || 'playwright')
const output = resolve(process.env.CRD_BROWSER_OUTPUT || '.ai-runs/offline-local-browser')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, ...(process.env.CRD_BROWSER_EXECUTABLE
  ? { executablePath: process.env.CRD_BROWSER_EXECUTABLE } : {}) })
const url = process.env.CRD_URL || 'http://127.0.0.1:4175/CRD/'
const errors = []
const workers = []
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await context.addInitScript(() => {
    window.offlineWorkerMessages = []
    const BrowserWorker = window.Worker
    window.Worker = class extends BrowserWorker {
      constructor(url, options) {
        super(url, options)
        this.addEventListener('message', (event) => window.offlineWorkerMessages.push({ url: String(url), ok: event.data?.ok }))
      }
    }
    if (!localStorage.getItem('crd-dev-settings-v1')) localStorage.setItem('crd-dev-settings-v1', JSON.stringify({
      gameMode: 'draft', opponentAi: 'rules', tabletop: 'abilities-new-cards', testing: false,
    }))
  })
  const track = (page) => {
    page.setDefaultTimeout(15000)
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('worker', (worker) => workers.push(worker.url()))
  }
  let page = await context.newPage()
  track(page)
  await page.goto(url)
  console.log('Online app loaded; waiting for complete offline installation')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
  const cache = await page.evaluate(async () => {
    const names = await caches.keys()
    const cache = await caches.open(names.find((name) => name.startsWith(`crd-pwa:${location.pathname}:`)))
    const keys = (await cache.keys()).map((request) => request.url)
    return { names, keys }
  })
  assert(cache.keys.some((key) => /searchAi.worker-/.test(key)))
  assert(cache.keys.some((key) => /davidBot.worker-/.test(key)))
  assert(cache.keys.some((key) => /\.woff2$/.test(key)))
  assert.equal(workers.length, 0, 'no AI worker was warmed before going offline')
  await context.setOffline(true)
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.clearBrowserCache')
  await page.close()
  page = await context.newPage()
  track(page)
  await page.goto(`${url}?offline-cold-start=1`)
  console.log('Cold-started offline with the HTTP cache cleared')
  await page.getByRole('button', { name: 'Open menu', exact: true }).waitFor()
  assert(await page.evaluate(async () => {
    try { await fetch('./offline-network-probe', { cache: 'no-store' }); return false }
    catch { return true }
  }), 'uncached network requests fail during the offline cold start')
  const readState = () => page.evaluate(() => JSON.parse(localStorage.getItem('crd-local-game-v1')).state)
  const menu = () => page.getByRole('button', { name: 'Open menu', exact: true }).click()
  const chooseOpponent = async (id) => {
    await menu()
    await page.getByLabel('Opponent', { exact: true }).selectOption(id)
  }
  await chooseOpponent('felix')
  if (!(await readState()).game.opponentHand.length) {
    await page.locator('.pack-area .card[aria-disabled="false"]').first().click()
  }
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('crd-local-game-v1')).state.game.opponentHand.length > 0)
  assert(workers.some((worker) => /searchAi.worker-/.test(worker)), 'real AI worker starts for the first time offline')
  assert(await page.evaluate(() => window.offlineWorkerMessages.some((message) => message.ok)), 'worker returns a successful decision offline')
  await chooseOpponent('local')
  assert.equal(await page.getByRole('dialog').count(), 0)
  assert.equal(await page.locator('main').isVisible(), true)
  assert.equal(await page.locator('.local-handoff').count(), 0)
  assert.equal(await page.locator('.local-turn-notice').evaluate((el) => getComputedStyle(el).pointerEvents), 'none')
  await page.locator('.shuffle-intro').waitFor({ state: 'hidden' })
  for (let pick = 0; pick < 10; pick++) {
    assert.equal(await page.locator('.local-handoff').count(), 0, 'no draft confirmation between picks')
    if (!pick) {
      for (const [name, replacement] of [['Player one', 'Alex'], ['Player two', 'Sam']]) {
        await page.getByRole('button', { name: `Player name: ${name}. Change`, exact: true }).click()
        await page.getByRole('textbox', { name: 'Player name', exact: true }).fill(replacement)
        await page.getByRole('textbox', { name: 'Player name', exact: true }).press('Enter')
      }
    }
    const beforePick = await readState()
    assert.match(await page.locator('.side-rail--player .player-identity').innerText(), /Alex/)
    assert.match(await page.locator('.side-rail--opponent .player-identity').innerText(), /Sam/)
    assert.deepEqual(await page.locator('.hand-area--player .card').evaluateAll((cards) => cards.map((card) => card.dataset.cardUid)),
      beforePick.game.playerHand.map((card) => card.uid))
    assert.deepEqual(await page.locator('.hand-area--opponent .card').evaluateAll((cards) => cards.map((card) => card.dataset.cardUid)),
      beforePick.game.opponentHand.map((card) => card.uid))
    assert.equal(await page.locator('.local-turn-notice').innerText(), `${beforePick.localPlay.seat === 'host' ? 'Alex' : 'Sam'}’s turn`)
    await page.locator('.pack-area .card[aria-disabled="false"]').first().click()
    if (!pick) {
      await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.local-turn-notice')).opacity) > 0.8)
      await page.screenshot({ path: resolve(output, 'mobile-draft-notice.png') })
      await page.setViewportSize({ width: 844, height: 390 })
      await page.screenshot({ path: resolve(output, 'landscape-draft-notice.png') })
      await page.setViewportSize({ width: 390, height: 844 })
    }
  }
  const drafted = await readState()
  assert.equal(drafted.game.playerHand.length, 5)
  assert.equal(drafted.game.opponentHand.length, 5)
  assert.deepEqual(drafted.settings.localNames, { host: 'Alex', guest: 'Sam' })
  const reveal = () => page.getByRole('button', { name: /^Reveal .+’s hand$/ }).click()
  for (let turn = 0; turn < 2 && !(await readState()).battleStarted; turn++) {
    assert.equal(await page.locator('main').isVisible(), true)
    assert.equal(await page.locator('.hand-area .card:not(.card--facedown)').count(), 0)
    await reveal()
    assert.equal(await page.locator('.hand-area--opponent .card:not(.card--facedown)').count(), 0)
    if (await page.locator('.tabletop-choice').count()) {
      const target = page.locator('.hand-area--player .card--targetable').first()
      if (await target.count()) await target.click()
      const picker = page.locator('.faction-picker')
      if (await picker.isVisible()) await picker.getByRole('button').first().click()
    }
    // Ready can skip activations and expose a required main-faction choice.
    const ready = page.getByRole('button', { name: 'Ready', exact: true })
    if (await ready.count()) await ready.click()
    if (!(await readState()).battleStarted && !(await readState()).localPlay.handoff) {
      await page.locator('.hand-area--player .card--targetable').first().click()
      const picker = page.locator('.faction-picker')
      if (await picker.isVisible()) await picker.getByRole('button').first().click()
      await ready.click()
    }
  }
  assert((await readState()).battleStarted)
  await menu()
  await page.getByRole('radio', { name: 'Discard', exact: true }).click()
  await page.locator('.shuffle-intro').waitFor({ state: 'hidden' })
  await page.screenshot({ path: resolve(output, 'mobile-handoff.png'), animations: 'disabled' })
  await page.setViewportSize({ width: 844, height: 390 })
  await page.screenshot({ path: resolve(output, 'landscape-handoff.png'), animations: 'disabled' })
  const handoffBounds = await page.locator('.local-handoff__reveal').boundingBox()
  assert(handoffBounds.y >= 0 && handoffBounds.y + handoffBounds.height <= 391)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.screenshot({ path: resolve(output, 'desktop-handoff.png'), animations: 'disabled' })
  await page.setViewportSize({ width: 390, height: 844 })
  for (let turn = 0; turn < 4; turn++) {
    const handoff = (await readState()).localPlay.handoff
    assert.equal(handoff, turn !== 2, 'P2 keeps the device between discard passes')
    if (handoff) {
      assert.equal(await page.locator('.hand-area .card:not(.card--facedown)').count(), 0)
      assert.equal(await page.locator('.stat-chips').count(), 0)
      await reveal()
    } else {
      assert.equal(await page.locator('.local-handoff').count(), 0)
      assert.equal(await page.locator('.hand-area--player .card:not(.card--facedown)').count(), 5)
    }
    assert.equal(await page.locator('.hand-area--opponent .card:not(.card--facedown)').count(), 0)
    if (turn === 0) {
      await page.getByRole('button', { name: 'Show all', exact: true }).click()
      assert.equal(await page.locator('.hand-area--opponent .card--facedown').count(), 0)
      await page.getByRole('button', { name: 'Hide', exact: true }).click()
      await page.screenshot({ path: resolve(output, 'mobile-private-discard.png'), animations: 'disabled' })
      await page.setViewportSize({ width: 844, height: 390 })
      await page.screenshot({ path: resolve(output, 'landscape-private-discard.png'), animations: 'disabled' })
      const bounds = await page.locator('.table').boundingBox()
      assert(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 844 && bounds.y + bounds.height <= 391)
      await page.setViewportSize({ width: 390, height: 844 })
    }
    await page.locator('.hand-area--player .card').first().click()
    await page.getByRole('button', { name: 'Redraw 1', exact: true }).click()
  }
  let state = await readState()
  assert.equal(state.game.playerDiscardsUsed, 2)
  assert.equal(state.game.opponentDiscardsUsed, 2)
  if (!state.battleStarted && state.localPlay.seat === 'host') {
    assert.equal(state.localPlay.handoff, false, 'P1 continues straight from discard 2 into preparation')
    assert.equal(await page.locator('.local-handoff').count(), 0)
    assert.equal(await page.locator('.hand-area--player .card:not(.card--facedown)').count(), 5)
  }
  const beforeReload = state.game
  await page.reload()
  state = await readState()
  assert.deepEqual(state.game, beforeReload)
  assert(state.battleStarted || state.localPlay.handoff, 'reload restores privacy')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.screenshot({ path: resolve(output, 'desktop-resume.png'), animations: 'disabled' })
  const resourceCheck = await page.evaluate(async () => {
    const cache = await caches.open((await caches.keys()).find((name) => name.startsWith(`crd-pwa:${location.pathname}:`)))
    const requests = await cache.keys()
    const failures = []
    for (const request of requests) {
      const response = await fetch(request.url)
      if (!response.ok) failures.push(request.url)
    }
    await document.fonts.ready
    return { failures, count: requests.length, brokenImages: [...document.images].filter((img) => img.complete && !img.naturalWidth).map((img) => img.src) }
  })
  assert.deepEqual(resourceCheck.failures, [])
  assert.deepEqual(resourceCheck.brokenImages, [])
  assert.deepEqual(errors, [])
  await writeFile(resolve(output, 'result.json'), JSON.stringify({ pass: true, offlineColdStart: true,
    firstUseOfflineAiWorker: true, draftPicks: 10, discardTurns: 4, cachedResources: resourceCheck.count,
    errors, workers, cache: cache.names }, null, 2))
  console.log(`PASS: offline cold start, first-use AI worker, 10 human draft picks, 4 private discard turns, reload and ${resourceCheck.count} offline resources`)
} finally { await browser.close() }
