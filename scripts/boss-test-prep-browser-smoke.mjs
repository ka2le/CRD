import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createBossRun } from '../src/game/bossBattle.js'

const { chromium } = createRequire(import.meta.url)(process.env.CRD_PLAYWRIGHT_MODULE || 'playwright')
const output = resolve(process.env.CRD_BROWSER_OUTPUT || 'artifacts/ui/boss-final-ui/test-prep')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const results = [], errors = []
try {
  for (const viewport of [{ width: 1360, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 667, height: 375 }]) {
    const context = await browser.newContext({ viewport })
    const page = await context.newPage()
    page.on('pageerror', e => errors.push(e.message))
    await page.goto(process.env.CRD_URL || 'http://127.0.0.1:5173/')
    await page.evaluate(s => {
      localStorage.setItem('crd-boss-mode-v1', 'true')
      localStorage.setItem('crd-boss-run-v1', JSON.stringify(s))
      localStorage.setItem('crd-battle-animation-v1', 'off')
    }, createBossRun({ seed: 771, bossId: 'briarback' }))
    await page.reload()
    const read = () => page.evaluate(() => JSON.parse(localStorage.getItem('crd-boss-run-v1')))
    const button = name => page.getByRole('button', { name, exact: true })
    await button('Open menu').click()
    await button('Boss options').click()
    assert.equal(await page.getByLabel('Draft packs', { exact: true }).inputValue(), 'shared')
    assert.equal(await page.getByLabel('Double the lower-power player', { exact: false }).isChecked(), false)
    assert.equal((await read()).testMode, false)
    await button('Jump to prep').click()
    let s = await read()
    assert.equal(s.phase, 'prepare')
    const copy = s.prep.playerHand.find(c => c.id === 'copy_card_in_hand')
    const draw = s.prep.playerHand.find(c => c.id === 'draw_2_extra')
    const attack = s.prep.playerHand.find(c => c.id === 'robot_attack')
    await page.locator(`[data-card-uid="${copy.uid}"]`).click()
    await page.locator(`[data-card-uid="${attack.uid}"]`).click()
    await page.locator(`[data-card-uid="${draw.uid}"]`).click()
    assert.equal((await read()).prep.playerHand.length, 7)
    await page.screenshot({ path: `${output}/copy-draw-${viewport.width}.png` })
    for (const [seat, faction] of [[0, 'Robots'], [1, 'Dragons']]) {
      const choice = page.locator(`[data-seat="${seat}"] .boss-faction-status button`)
      if (await choice.count()) {
        await choice.click()
        await page.locator(`[data-seat="${seat}"]`).getByRole('button', { name: faction, exact: true }).click()
      } else await page.locator(`[data-seat="${seat}"] .boss-player-name`).click()
      await button('Ready').click()
    }
    s = await read()
    assert.equal(s.phase, 'result')
    assert.equal(await page.locator('.boss-team-score strong').textContent(), String(s.result.teamPower))
    const layout = await page.evaluate(() => {
      const box = n => { const r = n.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height } }
      const rows = [...document.querySelectorAll('.boss-center .ttr-row')].map(box)
      return { rows, team: box(document.querySelector('.boss-center .boss-team-score')), boss: box(document.querySelector('.boss-center .ttr-row--opponent .ttr-sum__total')) }
    })
    assert.ok(Math.abs(layout.team.top - layout.rows[0].top) <= 1)
    assert.ok(Math.abs(layout.team.bottom - layout.rows[1].bottom) <= 1)
    assert.ok(Math.abs(layout.boss.top - layout.rows[2].top) <= 1)
    assert.ok(Math.abs(layout.boss.bottom - layout.rows[2].bottom) <= 1)
    assert.ok(layout.team.left >= layout.rows[0].right)
    assert.ok(layout.team.bottom < layout.rows[2].top)
    await page.screenshot({ path: `${output}/result-${viewport.width}.png` })
    await page.evaluate(() => localStorage.setItem('crd-battle-animation-v1', 'on'))
    await page.reload()
    await button('Fast forward').click()
    const fx = await page.locator('body > .ttr__fx').boundingBox()
    assert.deepEqual(fx, { x: 0, y: 0, width: viewport.width, height: viewport.height })
    const controls = await page.locator('.boss-count-controls').boundingBox()
    assert.ok(controls.y >= 0 && controls.y + controls.height <= viewport.height)
    await button('Skip to result').click()
    await page.locator('.boss-scoreboard.ttr--done').waitFor()
    results.push({ viewport, pass: true, layout })
    await context.close()
  }
  assert.deepEqual(errors, [])
  await writeFile(`${output}/verification.json`, JSON.stringify({ pass: true, results, errors }, null, 2))
  console.log(`Boss test-prep and merged totals checks passed: ${results.length} viewports`)
} finally { await browser.close() }
