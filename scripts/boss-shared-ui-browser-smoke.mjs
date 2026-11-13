import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { BOSS_PRESETS, bossReducer, createBossRun } from '../src/game/bossBattle.js'
import { createPreparationState } from '../src/game/preparationState.js'

const { chromium } = createRequire(import.meta.url)(process.env.CRD_PLAYWRIGHT_MODULE || 'playwright')
const output = resolve(process.env.CRD_BROWSER_OUTPUT || 'artifacts/ui/boss-shared-parity')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const errors = [], results = []
try {
  for (const draftMode of ['shared', 'separate']) for (const viewport of [
    { width: 1360, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 },
  ]) {
    const initial = bossReducer(createBossRun({ seed: 771, options: draftMode === 'shared' ? BOSS_PRESETS.original : BOSS_PRESETS.separate }), { type: 'start' })
    const context = await browser.newContext({ viewport })
    const page = await context.newPage()
    page.on('pageerror', e => errors.push(e.message))
    const read = () => page.evaluate(() => JSON.parse(localStorage.getItem('crd-boss-run-v1')))
    const install = async state => {
      await page.evaluate(s => {
        localStorage.setItem('crd-boss-mode-v1', 'true')
        localStorage.setItem('crd-boss-run-v1', JSON.stringify(s))
      }, state)
      await page.reload()
      await page.locator('.boss-table').waitFor()
    }
    const button = name => page.getByRole('button', { name: name.endsWith(' Pocket') ? new RegExp(`^${name}:`) : name, exact: true })
    const pick = async seat => page.locator(`[data-draft-seat="${draftMode === 'shared' ? 'shared' : seat}"] [data-card-uid]`).first().click()
    const shot = async name => {
      await page.waitForTimeout(400)
      if (await page.locator('.boss-turn').count()) {
        assert.equal(await page.locator('.boss-hero--current').count(), 1)
        const turn = await page.locator('.boss-turn').boundingBox()
        assert.ok(Math.abs(turn.x + turn.width / 2 - viewport.width / 2) <= 3, 'Turn label must be centered in the bottom row')
        assert.equal(await page.locator('.boss-turn').evaluate(n => getComputedStyle(n).borderTopStyle), 'solid')
        assert.match(await page.locator('.boss-turn').textContent(), /^Player [12]’s Turn$/)
      }
      const overflow = await page.locator('.boss-dock, .boss-hero .card, .boss-player-name, .boss-faction-prompt').evaluateAll(nodes => nodes.flatMap(n => {
        const r = n.getBoundingClientRect()
        return r.width && (r.left < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) ? [n.className] : []
      }))
      assert.deepEqual(overflow, [])
      await page.screenshot({ path: `${output}/${draftMode}-${name}-${viewport.width}.png` })
    }
    await page.goto(process.env.CRD_URL || 'http://127.0.0.1:5173/')
    await install(initial)
    for (const seat of [0, 1]) for (const power of ['Pocket', 'Refresh', '2 now', 'Swap']) {
      assert.equal(await button(`Player ${seat + 1} ${power}`).count(), 1)
    }
    assert.equal(await page.locator('.boss-dock .boss-tools button').count(), 0)
    assert.equal(await page.locator('.boss-turn').textContent(), 'Player 1’s Turn')
    assert.equal(await page.locator('.boss-hero--current').count(), 1)
    await shot('first-pick')
    if (draftMode === 'separate') {
      await pick(1) // One highlight is a visual cue; either player can still pick first.
      assert.equal(await page.locator('.boss-turn').textContent(), 'Player 1’s Turn')
      assert.equal(await page.locator('.boss-hero--current').getAttribute('data-seat'), '0')
      await install(initial)
    }
    await pick(0)
    assert.equal(await page.locator('.boss-turn').textContent(), 'Player 2’s Turn')
    assert.equal(await page.locator('.boss-hero--current').getAttribute('data-seat'), '1')
    await shot('second-pick')
    await pick(1)
    let s = await read()
    const latest = s.hands.map(h => h.at(-1).uid)
    const charges = s.playerTools
    assert.equal(await page.locator('.boss-center .boss-switch-latest').count(), 0)
    assert.equal(await page.locator('.boss-actions .boss-switch-latest .svg-icon').count(), 1)
    assert.equal(await page.locator('.boss-switch-latest').evaluate(n => n.nextElementSibling?.textContent), 'Absorb')
    const switchBox = await button('Switch latests').boundingBox(), absorbBox = await button('Absorb').boundingBox()
    assert.ok(switchBox.x + switchBox.width <= absorbBox.x)
    assert.ok(absorbBox.x - switchBox.x - switchBox.width <= 12)
    assert.ok(Math.abs(switchBox.y + switchBox.height / 2 - absorbBox.y - absorbBox.height / 2) < 2)
    await button('Switch latests').click()
    s = await read()
    assert.deepEqual(s.hands.map(h => h.at(-1).uid), latest.toReversed())
    assert.deepEqual(s.playerTools, charges)
    await page.reload()
    await button('Switch latests').click()
    assert.deepEqual((await read()).hands.map(h => h.at(-1).uid), latest)
    await shot('free-exchange')
    // Both players have their own Refresh, even when they share the pack.
    for (const seat of [0, 1]) {
      await button(`Player ${seat + 1} Refresh`).click()
      await page.locator(`[data-draft-seat="${draftMode === 'shared' ? 'shared' : seat}"] [data-card-uid]`).first().click()
      await button('Accept').click()
      assert.equal(await button(`Player ${seat + 1} Refresh`).isDisabled(), true)
    }
    await button('Absorb').click()
    assert.equal(await button('Switch latests').count(), 0)
    await button('Next pack').click()
    assert.equal(await page.locator('.boss-turn').textContent(), 'Player 2’s Turn')
    assert.equal(await button('Switch latests').count(), 0)

    // A neutral-only hand must explicitly choose its faction, using the regular
    // faction choices inside its own lane. The other hand remains interactive.
    const deck = [...initial.deck, ...initial.row, ...initial.rows.flat()]
    const take = id => deck.splice(deck.findIndex(c => c.id === id), 1)[0]
    const hands = [
      ['draw_2_extra', 'robot1', 'robot_attack', 'critter1'].map(take),
      (viewport.width === 844 ? ['one_off_each', 'critter1', 'robot1', 'shield2'] : ['bite', 'critter1', 'robot1', 'dragon1']).map(take),
    ]
    await install({ ...initial, phase: 'prepare', hands, deck, row: [], rows: draftMode === 'separate' ? [[], []] : [],
      prep: createPreparationState({ mode: '20cards', playerHand: hands[0], opponentHand: hands[1], deck }) })
    const prompt = page.getByRole('group', { name: 'Player 2 · Main faction', exact: true })
    assert.equal(await prompt.count(), 1)
    assert.equal(await prompt.locator('.faction-picker__option').count(), 3)
    // Ready stars and rings must have no clipping ancestor; test the actual
    // animated badge/ring bounds against each clipping ancestor and viewport.
    await page.waitForTimeout(400)
    const clipped = await page.locator('.boss-hero .card__badge--ready, .boss-hero .card--ready .card__frame').evaluateAll(nodes => nodes.flatMap(n => {
      const r = n.getBoundingClientRect(), bad = []
      if (r.left < 0 || r.right > innerWidth || r.top < 0 || r.bottom > innerHeight) bad.push('viewport')
      for (let p = n.parentElement; p; p = p.parentElement) {
        const css = getComputedStyle(p), b = p.getBoundingClientRect()
        if (/hidden|clip|auto|scroll/.test(css.overflowX) && (r.left < b.left - 1 || r.right > b.right + 1)
          || /hidden|clip|auto|scroll/.test(css.overflowY) && (r.top < b.top - 1 || r.bottom > b.bottom + 1)) bad.push(p.className)
      }
      return bad
    }))
    assert.deepEqual(clipped, [])
    await shot('neutral-choice')
    await prompt.getByRole('button', { name: 'Dragons', exact: true }).click()
    assert.equal((await read()).types[1], 'dragon')
    assert.equal(await prompt.count(), 0)
    assert.match(await page.locator('.boss-turn').textContent(), /Player 2/)
    assert.equal(await page.locator('.boss-hero--current').getAttribute('data-seat'), '1')
    await button('Ready').click()
    assert.equal((await read()).prep.opponentFinished, true)
    assert.equal((await read()).prep.playerFinished, false)
    assert.match(await page.locator('.boss-turn').textContent(), /Player 1/)
    await shot('one-ready')
    results.push({ draftMode, viewport, pass: true })
    await context.close()
  }
  assert.deepEqual(errors, [])
  await writeFile(`${output}/verification.json`, JSON.stringify({ pass: true, results, errors }, null, 2))
  console.log(`Boss shared/separate UI checks passed: ${output}`)
} finally { await browser.close() }
