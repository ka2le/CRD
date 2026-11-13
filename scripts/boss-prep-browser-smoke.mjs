import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { BOSS_PRESETS, bossReducer, createBossRun, resolveBossBattle } from '../src/game/bossBattle.js'
import { createPreparationState } from '../src/game/preparationState.js'

const { chromium } = createRequire(import.meta.url)(process.env.CRD_PLAYWRIGHT_MODULE || 'playwright')
const output = resolve(process.env.CRD_BROWSER_OUTPUT || 'artifacts/ui/boss-free-prep')
await mkdir(output, { recursive: true })
const initial = createBossRun({ seed: 771, options: { ...BOSS_PRESETS.separate, rounds: 4 }, testMode: true })
const deck = [...initial.deck]
const take = id => deck.splice(deck.findIndex(c => c.id === id), 1)[0]
const hands = [
  ['copy_card_in_hand', 'draw_2_discard_2', 'robot1', 'robot_attack'].map(take),
  ['draw_2_extra', 'discard_for_damage', 'recycle_card', 'dragon1'].map(take),
]
const fixture = bossReducer({ ...initial, phase: 'prepare', hands, deck,
  prep: createPreparationState({ mode: '20cards', playerHand: hands[0], opponentHand: hands[1], deck }) }, { type: 'replay-prep' })
const browser = await chromium.launch({ headless: true })
const errors = [], results = []
try {
  for (const draftMode of ['shared', 'separate']) for (const viewport of [{ width: 1360, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    const context = await browser.newContext({ viewport })
    await context.addInitScript(s => {
      if (!localStorage.getItem('crd-boss-run-v1')) {
        localStorage.setItem('crd-boss-mode-v1', 'true')
        localStorage.setItem('crd-boss-run-v1', JSON.stringify(s))
      }
    }, { ...fixture, options: { ...fixture.options, draftMode } })
    const page = await context.newPage()
    page.on('pageerror', e => errors.push(e.message))
    const read = () => page.evaluate(() => JSON.parse(localStorage.getItem('crd-boss-run-v1')))
    const button = name => page.getByRole('button', { name: name.endsWith(' Pocket') ? new RegExp(`^${name}:`) : name, exact: true })
    const main = () => page.locator('.boss-dock .table__action')
    const focus = seat => page.locator(`[data-seat="${seat}"] .boss-player-name`).click()
    const readyHand = async seat => {
      const types = page.locator(`[data-seat="${seat}"] .boss-faction-status button`)
      const choices = page.locator(`[data-seat="${seat}"] .boss-faction-prompt .faction-picker__option`)
      if (await choices.count()) await choices.first().click()
      else if (await types.count()) { await types.first().click(); await choices.first().click() }
      else await focus(seat)
      assert.equal(await main().textContent(), 'Ready')
      await main().click()
    }
    const card = (seat, uid) => page.locator(`[data-seat="${seat}"] [data-card-uid="${uid}"]`)
    const tap = (seat, uid) => card(seat, uid).click({ position: { x: 6, y: 12 } })
    const phase = async expected => {
    await page.waitForFunction(e => JSON.parse(localStorage.getItem('crd-boss-run-v1'))?.phase === e, expected)
    if (expected === 'result') {
      const skip = page.getByRole('button', { name: 'Skip to result', exact: true })
      if (await skip.count()) await skip.click()
    }
  }
    const layout = async name => {
      await page.waitForTimeout(350)
      const overflow = await page.locator('.boss-hero button').evaluateAll(nodes => nodes.flatMap(n => {
        const r = n.getBoundingClientRect(), p = n.closest('.boss-hero').getBoundingClientRect()
        return r.width && (r.left < p.left - 2 || r.right > p.right + 2 || r.top < p.top - 2 || r.bottom > p.bottom + 2) ? [n.getAttribute('aria-label')] : []
      }))
      assert.deepEqual(overflow, [])
      await page.screenshot({ path: `${output}/${draftMode}-${name}-${viewport.width}.png` })
    }
    await page.goto(process.env.CRD_URL || 'http://127.0.0.1:5173/')
    await phase('prepare')
    await layout('prepare')
    assert.equal(await main().count(), 1)
    assert.equal(await page.locator('.boss-prep-controls').count(), 0)
    await focus(1)
    assert.equal(await main().textContent(), 'Choose faction') // This hand has three eligible types.
    await main().click()
    assert.equal(await page.getByRole('group', { name: 'Player 2 · Main faction', exact: true }).count(), 1)
    await page.locator('[data-seat="1"] .boss-faction-prompt .faction-picker__option').first().click()
    assert.equal(await main().isEnabled(), true)
    const copy = hands[0].find(c => c.id === 'copy_card_in_hand')
    const robot = hands[0].find(c => c.id === 'robot1')
    const draw = hands[0].find(c => c.id === 'draw_2_discard_2')
    const attack = hands[0].find(c => c.id === 'robot_attack')
    const draw2 = hands[1].find(c => c.id === 'draw_2_extra')
    const sacrifice = hands[1].find(c => c.id === 'discard_for_damage')
    const dragon = hands[1].find(c => c.id === 'dragon1')
    const recycle = hands[1].find(c => c.id === 'recycle_card')
    // A Copy choice in the left lane must survive a right-lane draw.
    await tap(0, copy.uid)
    await tap(1, draw2.uid)
    assert.equal((await read()).prep.opponentHand.length, 6)
    assert.ok(await page.locator('[data-seat="0"] .card--targetable').count())
    await tap(0, robot.uid)
    assert.equal((await read()).prep.playerHand.filter(c => c.id === 'robot1').length, 2)
    await tap(0, draw.uid)
    await tap(0, attack.uid)
    await tap(1, sacrifice.uid)
    assert.equal(await page.locator('[data-seat="0"] .card--discard-marked').count(), 1)
    let s = await read()
    assert.equal(s.prep.playerPendingDiscard.remaining, 2)
    assert.equal(s.prep.opponentPendingDiscard.remaining, null)
    await layout('both-pending')
    await page.reload(); await phase('prepare')
    s = await read()
    assert.ok(s.prep.playerPendingDiscard && s.prep.opponentPendingDiscard)
    assert.equal(await button('Player 1 Swap').isDisabled(), true)
    await tap(1, dragon.uid)
    await tap(0, attack.uid)
    await tap(0, draw.uid)
    await main().click()
    assert.equal((await read()).prep.playerPendingDiscard, null)
    assert.ok((await read()).prep.opponentPendingDiscard)
    assert.equal(await page.locator('[data-seat="1"] .card--discard-marked').count(), 1)
    await focus(1); await button('Cancel').click()
    assert.equal((await read()).prep.opponentPendingDiscard, null)
    assert.equal((await read()).prep.opponentHand.some(c => c.uid === dragon.uid), true)
    await tap(1, recycle.uid)
    await page.locator(`.sheet [data-card-uid="${draw.uid}"]`).click()
    assert.equal((await read()).prep.playerDiscard.some(c => c.uid === draw.uid), false)
    await tap(1, draw.uid)
    await readyHand(0) // The other hand still owes discards.
    s = await read()
    assert.equal(s.prep.playerFinished, true)
    assert.equal(s.prep.opponentFinished, false)
    assert.equal(await page.locator(`[data-seat="0"] [data-card-uid]`).first().getAttribute('aria-disabled'), 'true')
    const discardUids = s.prep.opponentHand.slice(-2).map(c => c.uid)
    for (const uid of discardUids) await tap(1, uid)
    await main().click()
    await readyHand(1)
    await phase('result')
    s = await read()
    assert.deepEqual(s.result, resolveBossBattle(s))
    const physical = [...s.prep.playerHand, ...s.prep.opponentHand, ...s.prep.deck, ...s.prep.playerDiscard, ...s.pockets.filter(Boolean)]
    assert.equal(physical.length, 73)
    assert.equal(new Set(physical.map(c => c.uid)).size, 73)
    await page.locator('.boss-result-actions').getByRole('button', { name: 'Replay prep', exact: true }).click()
    assert.deepEqual((await read()).prep, fixture.prep)
    // Pocket is a draft reserve and closes when preparation begins.
    assert.equal(await button('Player 2 Pocket').isDisabled(), true)
    assert.equal(await button('Player 1 Pocket').isDisabled(), true)
    await tap(1, draw2.uid)
    await readyHand(1)
    await button('Player 1 Swap').click()
    await tap(0, robot.uid)
    await tap(1, draw2.uid)
    await main().click()
    s = await read()
    assert.equal(s.prep.playerFinished, false)
    assert.equal(s.prep.opponentFinished, false)
    assert.deepEqual(s.types, [null, null])
    assert.equal(s.prep.playerHand.some(c => c.uid === draw2.uid), true)
    assert.equal(s.prep.playerActivated.includes(draw2.uid), true)
    assert.equal(s.playerTools[0].swap, 0)
    assert.equal(s.playerTools[1].swap, 1)
    const deckSize = s.prep.deck.length
    await tap(0, draw2.uid)
    assert.equal((await read()).prep.deck.length, deckSize)
    assert.equal(await button('Player 1 Refresh').count(), 0)
    await layout('late-powers')
    await button('Open menu').click()
    await page.locator('.screen-menu__popover').getByRole('button', { name: 'Replay prep', exact: true }).click()
    assert.deepEqual((await read()).prep, fixture.prep)
    assert.deepEqual((await read()).pockets, fixture.pockets)
    await readyHand(1)
    assert.equal((await read()).prep.playerFinished, false)
    await readyHand(0)
    await phase('result')
    results.push({ draftMode, viewport, pass: true })
    await context.close()
  }
  assert.deepEqual(errors, [])
  await writeFile(`${output}/verification.json`, JSON.stringify({ pass: true, results, errors,
    checks: ['both hands immediately interactive', 'Copy target survives other hand draw', 'independent staged discards', 'overlapping pending actions/reload', 'cancel only own sacrifice', 'shared Recycle', 'Ready during other hand debt', 'Pocket remains visible and closes after prep begins', 'Swap reopens both hands and moves used-special markers', 'Refresh absent in prep', 'pending discards block Swap', 'both Ready orders', 'physical uniqueness', 'exact prep replay including power charges', 'desktop/portrait/landscape controls and cards'] }, null, 2))
  console.log(`Independent boss prep browser checks passed: ${output}`)
} finally { await browser.close() }
