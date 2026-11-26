import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'

const { chromium } = createRequire(import.meta.url)(process.env.CRD_PLAYWRIGHT_MODULE || 'playwright')
const output = 'artifacts/ui/rules-consistency'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath: process.env.CRD_BROWSER_EXECUTABLE })
const cases = [], errors = []
let activePage
try {
  for (const viewport of [{ width: 1360, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    const context = await browser.newContext({ viewport, permissions: ['clipboard-read', 'clipboard-write'] })
    const page = await context.newPage()
    activePage = page
    page.setDefaultTimeout(15000)
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(process.env.CRD_URL || 'http://127.0.0.1:5173/')
    await page.waitForFunction(() => window.crdDev)
    const menu = page.getByRole('button', { name: 'Open menu', exact: true })
    const dialog = page.getByRole('dialog')
    const openMenu = async () => { if (!await page.getByText('Testing', { exact: true }).isVisible()) await menu.click() }
    await openMenu()
    await page.getByText('Testing', { exact: true }).click()
    for (const rules of ['Battle', 'Threshold', 'Abilities', 'Abilities+NewCards', 'Monsters']) {
      await openMenu()
      await page.getByRole('radio', { name: rules, exact: true }).click()
      await openMenu()
      await page.getByRole('button', { name: 'How to play', exact: true }).click()
      await dialog.locator('.help__special').first().waitFor()
      const helpText = await dialog.innerText()
      assert.doesNotMatch(helpText, /training comes later/)
      const expectedSpecials = await page.evaluate(async () => {
        const { getCardGroup } = await import('/src/components/card/cardMeta.js')
        const { getRulesCards } = await import('/src/components/overlay/rulesPresentation.js')
        const settings = JSON.parse(localStorage.getItem('crd-dev-settings-v1'))
        return getRulesCards(settings).filter(c => getCardGroup(c) === 'special' || (getCardGroup(c) === 'attack' && !c.tags?.includes('base-attack'))).map(c => c.id).sort()
      })
      assert.deepEqual((await dialog.locator('[data-help-card]').evaluateAll(cards => cards.map(c => c.dataset.helpCard))).sort(), expectedSpecials)
      await dialog.getByRole('button', { name: 'Copy rules', exact: true }).click()
      await dialog.getByText('Copied!', { exact: true }).waitFor()
      assert.match(await page.evaluate(() => navigator.clipboard.readText()), /Cards — \d+ in deck/)
      if (rules === 'Monsters') {
        assert.match(helpText, /against Robot or Dragon or Monster/)
        assert.match(await dialog.locator('[data-help-card="monster_robot_dmg"]').innerText(), /Tabletop power/i)
        assert.equal(await dialog.locator('[data-help-card="single_faction_2"] img[alt="monster"]').count(), 1)
        assert(await dialog.locator('[data-help-card="single_faction_2"] .card-visual__token-row').evaluate(row => [...row.children].every(child => child.getBoundingClientRect().right <= row.closest('.card-visual').getBoundingClientRect().right + 1)), 'All four Specialist faction icons fit')
      }
      if (['Abilities+NewCards', 'Monsters'].includes(rules)) {
        const guard = dialog.locator('[data-help-card="critter_shield"]')
        await guard.click()
        await page.locator('.card-inspect__card').waitFor()
        assert.equal(await page.locator('.card-inspect__card img[alt="critter"]').count(), 1)
        assert.equal(await page.locator('.card-inspect__card img[alt="shield"]').count(), 1)
        await page.screenshot({ animations: 'disabled', path: `${output}/guard-${rules}-${viewport.width}.png` })
        await page.locator('.card-inspect__card').click()
      }
      await dialog.locator('.sheet__body').evaluate(e => { e.scrollTop = 0 })
      await page.screenshot({ animations: 'disabled', path: `${output}/help-${rules}-${viewport.width}.png` })
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      await dialog.getByRole('button', { name: 'Close', exact: true }).click()
      await openMenu()
      await page.getByRole('button', { name: 'Score card', exact: true }).click()
      const refs = dialog.locator('.sc-card')
      assert.equal(await refs.count(), 4)
      if (rules !== 'Battle' && rules !== 'Threshold') assert.match(await refs.first().getAttribute('aria-label'), new RegExp(rules.replace('+', '\\+')))
      assert.equal(await refs.locator('.ab-pc__wm').count(), 0)
      const geometry = await refs.evaluateAll(cards => cards.map(card => {
        const rect = card.getBoundingClientRect()
        const rows = [...card.querySelectorAll('.ab-ledger__row, .ab-band')]
        return rows.every(row => {
          const bounds = row.getBoundingClientRect()
          return bounds.bottom <= rect.bottom + 1 && [...row.querySelectorAll('.ab-note, .ab-rule, .th-two')].every(e => e.getBoundingClientRect().bottom <= bounds.bottom + 1)
        })
      }))
      assert(geometry.every(Boolean), `${rules} reference rows fit at ${viewport.width}: ${geometry}`)
      await page.screenshot({ animations: 'disabled', path: `${output}/score-${rules}-${viewport.width}.png` })
      await dialog.getByRole('button', { name: 'Close', exact: true }).click()
      cases.push({ viewport, rules, specialCount: expectedSpecials.length, referenceRowsFit: true })
    }
    for (const mode of ['6draft', 'Discard', '20Cards', 'Draft']) {
      await openMenu()
      await page.getByRole('radio', { name: mode, exact: true }).click()
      if (mode === 'Draft') {
        await openMenu()
        await page.getByText('Secret Card', { exact: true }).click()
      }
      await openMenu()
      await page.getByRole('button', { name: 'How to play', exact: true }).click()
      const expected = mode === 'Draft' ? 'Secret Card Draft:' : mode === 'Discard' ? 'Discard mode: six cards' : mode + ':'
      assert((await dialog.innerText()).includes(expected))
      await dialog.getByRole('button', { name: 'Copy rules' }).click()
      await dialog.getByText('Copied!', { exact: true }).waitFor()
      assert((await page.evaluate(() => navigator.clipboard.readText())).includes(expected))
      await dialog.getByRole('button', { name: 'Close', exact: true }).click()
      cases.push({ viewport, rules: 'Monsters', mode, activeInstructions: true })
    }
    await openMenu()
    await page.getByRole('button', { name: 'Collection', exact: true }).click()
    await dialog.getByRole('button', { name: 'Edit deck counts' }).click()
    await dialog.getByRole('spinbutton', { name: 'Shield2 copies', exact: true }).fill('0')
    await dialog.getByRole('spinbutton', { name: 'From Nothing copies', exact: true }).fill('2')
    await dialog.getByRole('button', { name: 'Apply & deal' }).click()
    await page.waitForFunction(() => [...document.querySelectorAll('button')].find(button => button.textContent === 'Apply & deal')?.disabled)
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    await openMenu()
    await page.getByRole('button', { name: 'How to play', exact: true }).click()
    assert.equal(await dialog.locator('[data-help-card="shield2"]').count(), 0)
    assert.equal(await dialog.locator('[data-help-card="no_stats_to_2"]').count(), 1)
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    await openMenu()
    await page.getByRole('button', { name: 'Boss battle · Co-op', exact: true }).click()
    await page.getByRole('button', { name: 'Open menu', exact: true }).click()
    await page.getByRole('button', { name: 'Boss rules', exact: true }).click()
    assert.match(await dialog.innerText(), /Shield is Damage adds 2 neutral power per shield point/)
    assert.equal(await dialog.locator('.help__ability').count(), 3)
    await page.screenshot({ animations: 'disabled', path: `${output}/boss-help-${viewport.width}.png` })
    console.log('Rules, custom recipes and Boss help verified at', viewport.width, '×', viewport.height)
    await context.close()
  }
  assert.deepEqual(errors, [])
  await writeFile(`${output}/verification.json`, JSON.stringify({ passed: true, cases, errors }, null, 2))
  console.log(`Verified ${cases.length} rules/layout combinations, actual card faces, inspection, copy and reference cards.`)
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage.screenshot({ animations: 'disabled', path: `${output}/failure.png` })
    console.log((await activePage.locator('body').innerText()).slice(-4000))
  }
  throw error
} finally { await browser.close() }
