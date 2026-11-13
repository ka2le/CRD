import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { BOSS_PRESETS, bossReducer, createBossRun } from '../src/game/bossBattle.js'

const { chromium } = createRequire(import.meta.url)(process.env.CRD_PLAYWRIGHT_MODULE || 'playwright')
const output = resolve(process.env.CRD_BROWSER_OUTPUT || 'artifacts/ui/boss-pocket-reserve')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const errors = [], results = []
try {
  for (const draftMode of ['shared', 'separate']) for (const viewport of [
    { width: 1360, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 },
  ]) {
    const initial = bossReducer(createBossRun({ seed: 771, options: draftMode === 'shared' ? BOSS_PRESETS.original : BOSS_PRESETS.separate, testMode: true }), { type: 'start' })
    const context = await browser.newContext({ viewport })
    await context.addInitScript(s => {
      if (!localStorage.getItem('crd-boss-run-v1')) {
        localStorage.setItem('crd-boss-mode-v1', 'true')
        localStorage.setItem('crd-boss-run-v1', JSON.stringify(s))
      }
    }, initial)
    const page = await context.newPage()
    page.on('pageerror', e => errors.push(e.message))
    const read = () => page.evaluate(() => JSON.parse(localStorage.getItem('crd-boss-run-v1')))
    const button = name => page.getByRole('button', { name: name.endsWith(' Pocket') ? new RegExp(`^${name}:`) : name, exact: true })
    const main = () => page.locator('.boss-dock .table__action')
    const pack = seat => page.locator(`[data-draft-seat="${draftMode === 'shared' ? 'shared' : seat}"]`)
    const row = (s, seat) => draftMode === 'shared' ? s.row : s.rows[seat]
    const pick = seat => pack(seat).locator('[data-card-uid]').first().click()
    const shot = async name => {
      await page.waitForTimeout(400)
      const overflow = await page.locator('.boss-hero .card, .boss-dock, .boss-pocket').evaluateAll(nodes => nodes.flatMap(n => {
        const r = n.getBoundingClientRect()
        return r.width && (r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1) ? [n.className] : []
      }))
      assert.deepEqual(overflow, [])
      await page.screenshot({ path: `${output}/${draftMode}-${name}-${viewport.width}.png` })
    }
    const pocketPack = async seat => {
      const before = await read(), taken = row(before, seat)[0], held = before.pockets[seat]
      await button(`Player ${seat + 1} Pocket`).click()
      assert.equal(await page.locator(`[data-pocket-seat="${seat}"] .pile__card--top`).count(), held ? 1 : 0)
      assert.equal(await page.locator('.sheet').count(), 0, 'Pocket selects on the table without opening a sheet')
      assert.equal(await main().count(), 0, 'Pocket has no Accept step')
      await button('Cancel').click()
      assert.deepEqual(await read(), before, 'Cancel keeps every card unchanged')
      await button(`Player ${seat + 1} Pocket`).click()
      await shot(held ? `held-pocket-${seat}` : `empty-pocket-${seat}`)
      await pack(seat).locator(`[data-card-uid="${taken.uid}"]`).click()
      const after = await read()
      assert.equal(after.pockets[seat].uid, taken.uid)
      assert.equal(row(after, seat)[0].uid, (held ?? before.deck[0]).uid)
      assert.equal(after.deck.length, before.deck.length - Number(!held))
      assert.deepEqual(after.hands, before.hands)
      assert.deepEqual(after.turns, before.turns)
      assert.equal(row(after, seat).length, row(before, seat).length)
    }
    await page.goto(process.env.CRD_URL || 'http://127.0.0.1:5173/')
    await page.locator('.boss-table').waitFor()
    assert.deepEqual((await read()).pockets, [null, null])
    if (draftMode === 'shared') assert.equal(await button('Player 2 Pocket').isDisabled(), true)
    await pocketPack(0)
    await pocketPack(0) // A filled Pocket returns its card and does not draw again.
    await pick(0)
    assert.equal(await button('Player 1 Pocket').isDisabled(), true)
    await pick(1)
    await pocketPack(1) // Both may pocket after the picks, before absorption.
    await pocketPack(0)
    await shot('before-absorption')
    const beforeReload = await read()
    await page.reload()
    assert.deepEqual(await read(), beforeReload)
    for (let guard = 0; guard < 40; guard++) {
      const s = await read()
      if (s.phase === 'collected' && s.pack === s.options.rounds) break
      if (s.phase === 'draft') await pick(s.turns[0])
      else await main().click()
    }
    let s = await read()
    assert.equal(s.phase, 'collected')
    assert.equal(s.pack, s.options.rounds)
    assert.match(await page.locator('.boss-instruction').textContent(), /Final Pocket exchanges/)
    const held = s.pockets[1], old = s.hands[1][0], other = s.hands[0][0], deck = s.deck
    await button('Player 2 Pocket').click()
    await page.locator(`[data-seat="0"] [data-card-uid="${other.uid}"]`).click({ position: { x: 6, y: 12 }, force: true })
    assert.equal(await main().count(), 0)
    assert.deepEqual((await read()).hands[1][0], old, 'Another hand cannot accept this Pocket exchange')
    await page.locator(`[data-seat="1"] [data-card-uid="${old.uid}"]`).click({ position: { x: 6, y: 12 } })
    s = await read()
    assert.equal(s.hands[1][0].uid, held.uid)
    assert.equal(s.pockets[1].uid, old.uid)
    assert.deepEqual(s.deck, deck)
    assert.equal(s.hands[0][0].uid, other.uid)
    const physical = [...s.hands.flat(), ...s.deck, ...s.absorbed, ...s.discard, ...s.refreshed, ...s.pockets.filter(Boolean)]
    assert.equal(physical.length, 73)
    assert.equal(new Set(physical.map(c => c.uid)).size, 73)
    await shot('final-hand-exchange')
    await button('Prepare').click()
    assert.equal(await button('Player 1 Pocket').isDisabled(), true)
    assert.equal(await button('Player 2 Pocket').isDisabled(), true)
    assert.equal((await read()).prep.opponentHand[0].uid, held.uid)
    assert.equal((await read()).prep.opponentHand.some(c => c.uid === old.uid), false)
    results.push({ draftMode, viewport, pass: true })
    await context.close()
  }
  assert.deepEqual(errors, [])
  await writeFile(`${output}/verification.json`, JSON.stringify({ pass: true, results, errors }, null, 2))
  console.log(`Boss Pocket reserve checks passed: ${output}`)
} finally { await browser.close() }
