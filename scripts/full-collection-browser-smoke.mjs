import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { getExpandedCoreDeck } from '../src/game/cards.js'

const { chromium } = createRequire(import.meta.url)(process.env.CRD_PLAYWRIGHT_MODULE || 'playwright')
const site = process.env.CRD_URL || 'http://127.0.0.1:5173/'
const options = { tabletop: 'abilities-new-cards', wildDeck: false }
const expected = new Set(['draft', '6draft'].flatMap(mode =>
  getExpandedCoreDeck({ ...options, mode }).map(card => 'collection__' + card.uid)))
assert.equal(expected.size, 75)
const browser = await chromium.launch({ executablePath: process.env.CRD_BROWSER_EXECUTABLE })
try {
  for (const viewport of [{ width: 1360, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    const context = await browser.newContext({ viewport })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(site)
    await page.waitForFunction(() => localStorage.getItem('crd-local-game-v1'))
    const menu = page.getByRole('button', { name: 'Open menu', exact: true })
    await menu.click()
    const openFull = page.getByRole('button', { name: 'Full collection', exact: true })
    assert.equal(await openFull.count(), 0)
    await page.getByText('Testing', { exact: true }).click()
    // Opening the print set from a different deck must still produce the same faces.
    if (viewport.width === 390) await page.getByText('Wild deck', { exact: true }).click()
    const savedDeal = await page.evaluate(() => localStorage.getItem('crd-local-game-v1'))
    await openFull.click()
    const dialog = page.getByRole('dialog')
    const uids = await dialog.locator('.collection__slot [data-card-uid]').evaluateAll(cards => cards.map(card => card.dataset.cardUid))
    assert.equal(uids.length, 75)
    assert.deepEqual(new Set(uids), expected)
    assert.equal(await dialog.locator('.card-visual__overlay--cooldown').count(), 0)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await dialog.locator('[data-card-uid="collection__dragon2__1"]').click()
    await page.locator('.card-inspect__card').click()
    await dialog.getByRole('tab', { name: 'Stats' }).click()
    assert.ok(await dialog.locator('.collection__slot').count() < expected.size)
    await page.evaluate(() => { window.print = () => { window.printInvoked = true } })
    await dialog.getByRole('button', { name: 'Print all cards' }).click()
    assert.equal(await page.evaluate(() => window.printInvoked), true)
    const printed = page.locator('.collection-print')
    assert.equal(await printed.locator('.collection-print__card').count(), 75)
    assert.equal(await printed.locator('.card-visual__overlay--cooldown').count(), 0)
    if (viewport.width === 1360) {
      await printed.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())))
      for (const format of ['A4', 'Letter']) {
        const path = process.env.CRD_PRINT_DIR && join(process.env.CRD_PRINT_DIR, 'full-collection-' + format + '.pdf')
        const pdf = await page.pdf({ format, printBackground: true, path })
        assert.equal(pdf.toString('latin1').match(/\/Type \/Page\b/g)?.length, 9, format)
      }
    }
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    assert.equal(await printed.count(), 0)
    assert.equal(await page.evaluate(() => localStorage.getItem('crd-local-game-v1')), savedDeal)
    assert.deepEqual(errors, [])
    await context.close()
    console.log('Full collection verified at', viewport.width, '×', viewport.height)
  }
} finally {
  await browser.close()
}
