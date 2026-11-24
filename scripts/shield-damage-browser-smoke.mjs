import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
const { chromium } = createRequire(import.meta.url)(process.env.CRD_PLAYWRIGHT_MODULE || 'playwright')
const output = 'artifacts/ui/shield-damage2'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath: process.env.CRD_BROWSER_EXECUTABLE })
const results = [], errors = []
try {
  for (const viewport of [{ width: 1360, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    const context = await browser.newContext({ viewport, permissions: ['clipboard-read', 'clipboard-write'] })
    const page = await context.newPage()
    page.setDefaultTimeout(10000)
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(process.env.CRD_URL || 'http://127.0.0.1:5173/')
    await page.waitForFunction(() => window.crdDev)
    const menu = page.getByRole('button', { name: 'Open menu', exact: true })
    const openMenu = async () => { if (!await page.getByText('Testing', { exact: true }).isVisible()) await menu.click() }
    await openMenu()
    await page.getByText('Testing', { exact: true }).click()
    for (const rules of ['Abilities', 'Abilities+NewCards', 'Monsters']) {
      await openMenu()
      await page.getByRole('radio', { name: rules, exact: true }).click()
      for (const mode of ['Draft', 'Discard', '6draft']) {
        await openMenu()
        await page.getByRole('radio', { name: mode, exact: true }).click()
        await openMenu()
        await page.getByRole('button', { name: 'Collection', exact: true }).click()
        const dialog = page.getByRole('dialog')
        const card = dialog.locator('[data-card-uid="collection__shield_is_dmg__1"]')
        await card.scrollIntoViewIfNeeded()
        assert.equal(await card.locator('img[alt="own shields"]').count(), 1)
        assert.equal(await card.locator('img[alt="power"]').count(), 2)
        const layout = await card.locator('.card-visual__token-row').evaluate(row => {
          const children = [...row.children].map(e => e.getBoundingClientRect())
          const card = row.closest('.card-visual').getBoundingClientRect()
          return { singleRow: children.every(r => Math.abs(r.y + r.height / 2 - children[0].y - children[0].height / 2) < 1), contained: children.every(r => r.right <= card.right + 1 && r.bottom <= card.bottom + 1) }
        })
        assert(layout.singleRow && layout.contained, `${rules}/${mode} card formula fits`)
        await card.click()
        await page.getByText('Adds 2 neutral power per shield point in your hand. Your shields still block.', { exact: true }).waitFor()
        await page.waitForTimeout(350)
        await page.screenshot({ path: `${output}/inspect-${rules}-${mode}-${viewport.width}.png` })
        await page.locator('.card-inspect__card').click()
        await dialog.getByRole('button', { name: 'Close', exact: true }).click()
        await openMenu()
        await page.getByRole('button', { name: 'How to play', exact: true }).click()
        assert.match(await dialog.innerText(), /Shield is Damage adds 2 neutral power per shield point/)
        await dialog.getByRole('button', { name: 'Copy rules', exact: true }).click()
        await dialog.getByText('Copied!', { exact: true }).waitFor()
        assert.match(await page.evaluate(() => navigator.clipboard.readText()), /Shield is Damage adds 2 neutral power per shield point/)
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
        await dialog.getByRole('button', { name: 'Close', exact: true }).click()
        results.push({ viewport, rules, mode, formulaFits: layout })
      }
    }
    // Exercise the actual result and printed card together, beyond the collection.
    await page.evaluate(() => window.crdDev.result('neutral-choice', { rules: 'abilities-new-cards', playerType: 'critter' }))
    await page.waitForTimeout(400)
    const skip = page.getByRole('button', { name: 'Skip to result', exact: true })
    if (await skip.isVisible()) await skip.click()
    await page.waitForFunction(() => document.querySelector('[data-ttr="player-neutral-dmg"]')?.textContent === '6')
    const power = await page.evaluate(async () => {
      const { getExpandedCoreDeck } = await import('/src/game/cards.js')
      const { getTabletopProfile } = await import('/src/game/tabletop.js')
      const deck = getExpandedCoreDeck({ tabletop: 'abilities-new-cards', wildDeck: false })
      return getTabletopProfile(['shield_is_dmg', 'shield2', 'critter_shield'].map(id => deck.find(c => c.id === id))).neutral
    })
    assert.equal(power, 6)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: `${output}/battle-${viewport.width}.png` })
    await context.close()
  }
  assert.deepEqual(errors, [])
  await writeFile(`${output}/verification.json`, JSON.stringify({ passed: true, results, errors }, null, 2))
  console.log(`Shield damage card, inspection, rules and copy verified in ${results.length} desktop/portrait/landscape mode combinations.`)
} finally { await browser.close() }
