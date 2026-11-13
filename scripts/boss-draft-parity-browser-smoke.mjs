import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { BOSS_PRESETS, bossReducer, createBossRun, bossHand } from '../src/game/bossBattle.js'
import { createPreparationState } from '../src/game/preparationState.js'

const { chromium } = createRequire(import.meta.url)(process.env.CRD_PLAYWRIGHT_MODULE || 'playwright')
const output = resolve(process.env.CRD_BROWSER_OUTPUT || 'artifacts/ui/boss-draft-parity/results')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const errors = [], results = []
const viewports = [{ width: 1360, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 320, height: 568 }, { width: 740, height: 360 }]
function fixture(options) {
  const initial = createBossRun({ bossId: 'briarback', seed: 771, options })
  const deck = [...initial.deck]
  const take = id => {
    const at = deck.findIndex(c => c.id === id)
    assert.ok(at >= 0, id)
    return deck.splice(at, 1)[0]
  }
  // Robot balance and shield costs; Dragon Overwhelming; multiple eligible
  // factions in P1's hand make the selected Robot commitment observable.
  const hands = [
    ['robot1', 'robot_attack', 'critter1', 'swarm', 'shield2'].map(take),
    ['dragon2', 'dragon1', 'dragons_breath', 'dragon_ulti', 'one_off_each'].map(take),
  ]
  const pockets = [take('bite'), take('critter_shield')]
  const absorbed = ['robot_dragon', 'robot_critter', 'dragon_rabbit', 'shield2', 'robot_attack', 'critter1'].map(take)
  return { ...initial, phase: 'prepare', hands, deck, pockets, absorbed,
    prep: createPreparationState({ mode: '20cards', playerHand: hands[0], opponentHand: hands[1], deck }) }
}
try {
  for (const options of [BOSS_PRESETS.separate, BOSS_PRESETS.original]) for (const viewport of viewports) {
    const context = await browser.newContext({ viewport })
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(process.env.CRD_URL || 'http://127.0.0.1:5173/')
    const install = async state => {
      await page.evaluate(s => {
        localStorage.setItem('crd-battle-animation-v1', 'off')
        localStorage.setItem('crd-boss-mode-v1', 'true')
        localStorage.setItem('crd-boss-run-v1', JSON.stringify(s))
      }, state)
      await page.reload()
      await page.locator('.boss-table').waitFor()
    }
    const read = () => page.evaluate(() => JSON.parse(localStorage.getItem('crd-boss-run-v1')))
    const shot = async name => {
      await page.waitForTimeout(400)
      const overflow = await page.locator('.boss-scoreboard .ttr-row, .boss-scoreboard .ttr-cell, .boss-scoreboard .ttr-sum, .boss-hero .card, .boss-pocket, .boss-faction-prompt, .boss-dock').evaluateAll(nodes => nodes.flatMap(n => {
        const r = n.getBoundingClientRect()
        return r.width && (r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1) ? [n.className] : []
      }))
      assert.deepEqual(overflow, [], name)
      assert.equal(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight), false)
      await page.screenshot({ path: `${output}/${options.draftMode}-${name}-${viewport.width}.png` })
    }
    const initial = fixture(options)
    await install(initial)
    assert.equal(await page.locator('[data-seat="0"] .boss-faction-prompt').count(), 0, 'Typed hands start with highlighted cards')
    const robot = initial.hands[0].find(c => c.id === 'robot_attack')
    await page.locator(`[data-seat="0"] [data-card-uid="${robot.uid}"]`).click({ position: { x: 6, y: 12 } })
    assert.equal((await read()).types[0], 'robot', 'One eligible type selects directly')
    assert.equal(await page.locator(`[data-card-uid="${robot.uid}"].card--selected`).count(), 1)
    await shot('faction-selected')
    await page.getByRole('button', { name: 'Ready', exact: true }).click()
    await page.getByRole('button', { name: 'Ready', exact: true }).click()
    const final = await read()
    assert.equal(final.phase, 'result')
    assert.equal(final.result.heroes[0].damageType, 'robot')
    assert.equal(final.result.heroes[0].bonus, 3)
    assert.equal(final.result.heroes[1].overwhelming, true)
    const rows = page.locator('.boss-center .boss-scoreboard .ttr-row')
    assert.equal(await rows.count(), 3)
    for (const [i, score] of [...final.result.heroes, final.result.boss].entries()) {
      const row = rows.nth(i)
      for (const type of ['critter', 'robot', 'dragon']) {
        assert.equal(await row.locator(`.ttr-cell--${type} .ttr-cell__stat`).textContent(), String(score.stats[type] ?? 0))
        assert.equal(await row.locator(`.ttr-cell--${type} .ttr-cell__dmg`).textContent(), String(score.contributions[type] ?? 0))
      }
      assert.equal(await row.locator('.ttr-cell--neutral .ttr-cell__dmg').textContent(), String(score.neutral))
      assert.equal(await row.locator('.ttr-sum__total').textContent(), String(score.score))
      assert.equal(await row.locator(`.ttr-cell--${score.damageType}.is-main`).count(), 1)
    }
    assert.equal(await page.locator('.boss-center .boss-team-score strong').textContent(), String(final.result.teamPower))
    await shot('result')
    await page.getByRole('button', { name: 'Battle scores', exact: true }).click()
    assert.equal(await page.locator('.sheet .boss-scoreboard .ttr-row').count(), 3)
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await page.getByRole('button', { name: 'Replay prep', exact: true }).click()
    assert.equal((await read()).phase, 'prepare')

    // Neutral-only cards, like ordinary draft, open the same faction options
    // when tapped. Both hands can choose independently; neither obscures cards.
    const neutral = fixture(options)
    neutral.hands = [[neutral.pockets[0]], []]
    neutral.prep = createPreparationState({ mode: '20cards', playerHand: neutral.hands[0], opponentHand: [], deck: neutral.deck })
    neutral.pockets = [null, neutral.pockets[1]]
    await install(neutral)
    const choices = page.locator('[data-seat="0"] .faction-picker__option')
    assert.equal(await choices.count(), 3)
    await choices.filter({ hasText: 'Robots' }).click()
    await page.locator(`[data-seat="0"] [data-card-uid="${neutral.hands[0][0].uid}"]`).click()
    assert.equal(await choices.count(), 3, 'Tapping a card with multiple eligible factions opens choices')
    await choices.filter({ hasText: 'Dragons' }).click()
    assert.equal((await read()).types[0], 'dragon')
    await shot('neutral-and-empty')
    // An explicit non-default commitment must survive the saved result.
    let resolved = bossReducer(neutral, { type: 'faction', seat: 0, faction: 'dragon' })
    resolved = bossReducer(resolved, { type: 'faction', seat: 1, faction: 'robot' })
    for (const seat of [0, 1]) resolved = bossReducer(resolved, { type: 'prepare', seat, action: { type: 'finish-preparation' } })
    assert.ok(bossHand(resolved).length)
    await install(resolved)
    assert.equal(await page.locator('.boss-center .ttr-row').nth(0).locator('.ttr-cell--dragon.is-main').count(), 1)
    assert.equal(await page.locator('.boss-center .ttr-row').nth(1).locator('.ttr-cell--robot.is-main').count(), 1)
    await shot('zero-result')
    if (options.draftMode === 'separate' && [1360, 390, 844].includes(viewport.width)) {
      // Exercise the shared real count-up, including a complete natural run,
      // fast-forward, skip and switching the preference off mid-count.
      await install(final)
      await page.evaluate(() => localStorage.setItem('crd-battle-animation-v1', 'on'))
      await page.reload()
      await page.getByRole('button', { name: 'Fast forward', exact: true }).click()
      await page.waitForFunction(() => document.querySelector('.boss-scoreboard.ttr--counting .ttr-row.is-current'))
      await shot('counting')
      if (viewport.width === 1360) {
        await page.waitForFunction(() => document.querySelector('.boss-scoreboard .ttr-row[aria-label="Player 2"].is-current'), null, { timeout: 60000 })
        assert.equal(await page.locator('.boss-center .ttr-row').nth(0).locator('.ttr-sum__total').textContent(), String(final.result.heroes[0].score))
        await page.waitForFunction(() => document.querySelector('.boss-scoreboard .ttr-row[aria-label="Briarback"].is-current'), null, { timeout: 60000 })
        assert.equal(await page.locator('.boss-center .ttr-row').nth(1).locator('.ttr-sum__total').textContent(), String(final.result.heroes[1].score))
        await page.locator('.boss-scoreboard.ttr--done').waitFor({ timeout: 60000 })
        assert.equal(await page.locator('.boss-center .ttr-row').nth(2).locator('.ttr-sum__total').textContent(), String(final.result.boss.score))
      } else if (viewport.width === 390) {
        await page.getByRole('button', { name: 'Skip to result', exact: true }).click()
        assert.equal(await page.locator('.boss-scoreboard.ttr--done').count(), 1)
      } else {
        await page.getByRole('button', { name: 'Open menu', exact: true }).click()
        await page.locator('.screen-menu__toggle').filter({ hasText: 'Battle animation' }).click()
        await page.getByRole('button', { name: 'Open menu', exact: true }).click()
        assert.equal(await page.locator('.boss-scoreboard.ttr--done').count(), 1)
      }
      await shot('counted')
    }
    results.push({ draftMode: options.draftMode, viewport, pass: true })
    await context.close()
  }
  assert.deepEqual(errors, [])
  await writeFile(`${output}/verification.json`, JSON.stringify({ pass: true, results, errors }, null, 2))
  console.log(`Boss draft parity checks passed: ${output}`)
} finally { await browser.close() }
