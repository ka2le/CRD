import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
const { chromium } = createRequire(import.meta.url)(process.env.CRD_PLAYWRIGHT_MODULE || 'playwright')
const output = process.env.CRD_BROWSER_OUTPUT || 'artifacts/ui/felix-nc6'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, ...(process.env.CRD_BROWSER_EXECUTABLE ? { executablePath: process.env.CRD_BROWSER_EXECUTABLE } : {}) })
const results = [], errors = []
try {
  for (const viewport of [{ width: 1360, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    const page = await browser.newPage({ viewport }); page.on('pageerror', e => errors.push(e.message))
    await page.goto(process.env.CRD_URL || 'http://127.0.0.1:5173/'); await page.waitForFunction(() => localStorage.getItem('crd-local-game-v1'))
    await page.locator('.shuffle-intro').waitFor({ state: 'hidden' })
    await page.getByRole('button', { name: 'Open menu', exact: true }).click()
    await page.getByRole('radio', { name: 'Draft', exact: true }).click()
    await page.getByRole('button', { name: 'Open menu', exact: true }).click()
    await page.getByRole('combobox', { name: 'Opponent', exact: true }).selectOption('felix')
    // Menu choices close the menu; inspect live state rather than assuming its
    // visibility after an interaction.
    const open = async () => { if (!await page.getByRole('radio', { name: '6draft', exact: true }).isVisible()) await page.getByRole('button', { name: 'Open menu', exact: true }).click() }
    for (const mode of ['6draft', 'Draft', '6draft']) {
      await open(); await page.getByRole('radio', { name: mode, exact: true }).click(); await open()
      assert.equal(await page.getByRole('combobox', { name: 'Opponent', exact: true }).inputValue(), 'felix')
      assert.equal(await page.getByRole('combobox', { name: 'Opponent', exact: true }).locator('option').filter({ hasText: 'Felix' }).count(), 1)
    }
    await page.waitForTimeout(350)
    await page.screenshot({ path: `${output}/menu-${viewport.width}.png` })
    const worker = await page.evaluate(async () => {
      const { createHeadlessGame, stepHeadlessGame } = await import('/src/game/headlessGame.js')
      const { requestOpponentSearchAction, requestOpponentPreparation } = await import('/src/game/opponentAi.js')
      const { chooseFelixNc6Decision, FELIX_NC6_CHECKPOINT_SHA256 } = await import('/src/game/felixNc6Bot.js')
      let s = createHeadlessGame({ mode: '6draft', tabletop: 'abilities-new-cards', wildDeck: false, control: 'both', seed: 617, firstPicker: 'opponent' })
      let workerPicks = 0, workerDiscards = 0
      while (!s.preparation) {
        const action = s.actor === 'opponent' ? await requestOpponentSearchAction(s.game, 'felix') : chooseFelixNc6Decision(s.game, 'player').action
        if (s.actor === 'opponent') { if (action.type === 'draft-pick') workerPicks++; else workerDiscards++ }
        s = stepHeadlessGame(s, action)
      }
      const p = await requestOpponentPreparation(s.preparation, s.game, 'felix')
      return { workerPicks, workerDiscards, prepared: p.opponentFinished, modelName: 'Felix', checkpoint: FELIX_NC6_CHECKPOINT_SHA256 }
    })
    const { checkpoint, ...steps } = worker
    assert.deepEqual(steps, { workerPicks: 6, workerDiscards: 1, prepared: true, modelName: 'Felix' })
    assert.match(checkpoint, /^[0-9a-f]{64}$/)
    if (process.env.CRD_NC6_EXPECTED_CHECKPOINT) assert.equal(checkpoint, process.env.CRD_NC6_EXPECTED_CHECKPOINT)
    assert.equal(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight), false)
    results.push({ viewport, ...worker }); await page.close()
  }
  assert.deepEqual(errors, [])
  await writeFile(`${output}/verification.json`, JSON.stringify({ passed: true, results, errors }, null, 2))
  console.log('Felix6 browser menu persistence and worker draft/discard/preparation passed at all three sizes.')
} finally { await browser.close() }
