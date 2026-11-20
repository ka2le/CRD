import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const { chromium } = createRequire(import.meta.url)(process.env.CRD_PLAYWRIGHT_MODULE || 'playwright')
const site = process.env.CRD_URL || 'http://127.0.0.1:5173/'
const browser = await chromium.launch({ headless: true, executablePath: process.env.CRD_BROWSER_EXECUTABLE })
try {
  for (const viewport of [{ width: 1360, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    const context = await browser.newContext({ viewport, permissions: ['clipboard-read', 'clipboard-write'] })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(site)
    await page.waitForFunction(() => localStorage.getItem('crd-local-game-v1'))
    const menu = page.getByRole('button', { name: 'Open menu', exact: true })
    const dialog = page.getByRole('dialog')
    for (const [mode, expected] of [['6draft', [0, 3, 4, 9]], ['Draft', [1, 2, 5, 8]]]) {
      await menu.click()
      await page.getByRole('radio', { name: mode, exact: true }).click()
      await menu.click()
      await page.getByRole('button', { name: 'Collection', exact: true }).click()
      const ids = ['dragon2', 'rabbit2', 'dragon1', 'robot1']
      assert.equal(await dialog.locator('.collection__slot').count(), 73)
      for (const [i, id] of ids.entries()) {
        const slots = dialog.locator(`.collection__slot:has([data-card-uid^="collection__${id}__"])`)
        assert.equal(await slots.count(), expected[i])
        if (expected[i]) assert.equal(await slots.locator('.collection__copies').innerText(), '×' + expected[i])
      }
      await dialog.getByRole('button', { name: 'Close', exact: true }).click()
      await menu.click()
      await page.getByRole('button', { name: 'How to play', exact: true }).click()
      assert.equal((await dialog.innerText()).includes('third Double Critter'), mode === '6draft')
      await dialog.getByRole('button', { name: 'Copy rules' }).click()
      await dialog.getByText('Copied!', { exact: true }).waitFor()
      const copied = await page.evaluate(() => navigator.clipboard.readText())
      assert.equal(copied.includes('third Double Critter'), mode === '6draft')
      assert.equal(/^dragon2:/m.test(copied), mode === 'Draft')
      assert.equal(copied.includes('Five packs.'), mode === 'Draft')
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    }
    assert.deepEqual(errors, [])
    await context.close()
    console.log('Deck and rules matched the active mode at', viewport.width, '×', viewport.height)
  }
} finally {
  await browser.close()
}
