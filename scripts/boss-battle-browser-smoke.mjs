import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createBossRun, resolveBossBattle } from '../src/game/bossBattle.js'
import { getExpandedCoreDeck } from '../src/game/cards.js'
import { createPreparationState } from '../src/game/preparationState.js'
const { chromium } = createRequire(import.meta.url)(process.env.CRD_PLAYWRIGHT_MODULE || 'playwright')
const output = resolve(process.env.CRD_BROWSER_OUTPUT || 'artifacts/ui/boss-battle')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const errors = []
try {
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } })
  page.setDefaultTimeout(30000)
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(process.env.CRD_URL || 'http://127.0.0.1:5187/')
  const read = () => page.evaluate(() => JSON.parse(localStorage.getItem('crd-boss-run-v1')))
  const main = () => page.locator('.boss-dock > button')
  const readyHand = async seat => {
    const types = page.locator(`[data-seat="${seat}"] .boss-factions button`)
    if (await types.count()) await types.first().click()
    else await page.locator(`[data-seat="${seat}"] .boss-player-name`).click()
    await main().click()
  }
  const saveShot = async name => { await page.waitForTimeout(600); await page.screenshot({ path: `${output}/${name}.png` }) }
  const phase = async expected => { await page.waitForFunction(e => JSON.parse(localStorage.getItem('crd-boss-run-v1'))?.phase === e, expected) }
  const pick = async () => {
    const s = await read()
    await page.locator('.boss-center [data-card-uid]').filter({ visible: true }).first().click()
    assert.notEqual((await read()).row.length, s.row.length)
  }
  const finishDraft = async () => {
    for (let n = 0; n < 40; n++) {
      const s = await read()
      if (s.phase === 'prepare') return
      if (s.phase === 'draft') await pick()
      else await main().click()
    }
    throw Error('Draft did not finish')
  }
  const layoutCheck = async () => {
    const bad = await page.locator('.boss-header, .boss-dock, .boss-heroes, .boss-enemy, .boss-choices').evaluateAll(nodes => nodes.flatMap(n => {
      const r = n.getBoundingClientRect()
      return r.width && (r.left < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) ? [n.className] : []
    }))
    assert.deepEqual(bad, [])
    const overflowingCards = await page.locator('.boss-center .card, .boss-hero .card').evaluateAll(nodes => nodes.flatMap(n => {
      const r = n.getBoundingClientRect(), parent = n.closest('.boss-center, .boss-hero').getBoundingClientRect()
      return r.left < parent.left - 2 || r.right > parent.right + 2 || r.top < parent.top - 2 || r.bottom > parent.bottom + 2 ? [n.getAttribute('data-card-uid')] : []
    }))
    assert.deepEqual(overflowingCards, [])
    const stretchedCards = await page.locator('.boss-shell .card').evaluateAll(nodes => nodes.flatMap(n => {
      const r = n.getBoundingClientRect()
      return r.height > 0 && Math.abs(r.width / r.height - 635 / 888) > .003 ? [n.getAttribute('data-card-uid')] : []
    }))
    assert.deepEqual(stretchedCards, [])
    assert.ok((await page.getByRole('button', { name: 'Open menu', exact: true }).boundingBox()).x > page.viewportSize().width * .8)
    assert.equal(await page.locator('img').evaluateAll(imgs => imgs.filter(i => !i.complete || !i.naturalWidth).length), 0)
  }

  // Entry is available only through Testing, with an automatic open co-op setup.
  await page.getByRole('button', { name: 'Open menu', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: 'Boss battle · Co-op', exact: true }).count(), 0)
  await page.locator('.screen-menu__toggle').filter({ hasText: 'Testing' }).click()
  await page.getByRole('button', { name: 'Boss battle · Co-op', exact: true }).click()
  await phase('setup')
  await page.getByRole('button', { name: 'Open menu', exact: true }).click()
  await page.getByRole('button', { name: 'Boss options', exact: true }).click()
  await page.getByRole('button', { name: 'Original shared draft', exact: true }).click()
  await page.getByRole('button', { name: 'Apply rules & restart deal', exact: true }).click()
  await saveShot('setup-desktop')
  await layoutCheck()
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport)
    await saveShot(`setup-${viewport.width}`)
    await layoutCheck()
  }
  await page.setViewportSize({ width: 1360, height: 900 })
  await main().click()
  await phase('draft')
  assert.equal(await page.locator('.boss-enemy .ttr--live').count(), 1)
  assert.equal(await page.locator('.boss-piles .pile--discard').count(), 1)
  assert.equal(await page.locator('.boss-piles .pile--deck').count(), 1)
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await page.locator('.boss-center [data-card-uid]').first().click()
  await main().click()
  assert.equal((await read()).refreshed.length, 1)
  await page.getByRole('button', { name: '2 now', exact: true }).click()
  await page.getByRole('button', { name: 'Pocket', exact: true }).click()
  await page.locator('.boss-pocket-preview .card').click()
  assert.equal((await read()).hands[0].length, 1)
  await pick()
  await pick()
  await phase('collect')
  await main().click()
  await phase('collected')
  const liveStats = await page.locator('.boss-enemy .ttr-cell__stat').allTextContents()
  assert.equal(liveStats.length, 3)
  assert.equal(liveStats.some(n => Number(n) > 0), (await read()).absorbed.some(c => c.stats?.length))
  await main().click()
  assert.deepEqual((await read()).turns, [1])
  await page.getByRole('button', { name: 'Swap', exact: true }).click()
  await page.locator('[data-seat="0"] [data-card-uid]').first().click()
  await page.locator('[data-seat="1"] [data-card-uid]').first().click()
  await main().click()
  assert.equal((await read()).tools.swap, 0)
  await saveShot('draft-desktop')
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport)
    await saveShot(`draft-${viewport.width}`)
    await layoutCheck()
  }
  await page.setViewportSize({ width: 1360, height: 900 })
  const beforeReload = await read()
  await page.reload()
  await phase('draft')
  assert.deepEqual(await read(), beforeReload)
  await finishDraft()
  assert.deepEqual((await read()).hands.map(h => h.length), [5, 5])
  await saveShot('prepare-desktop')
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport)
    await saveShot(`prepare-${viewport.width}`)
    await layoutCheck()
  }
  await page.setViewportSize({ width: 1360, height: 900 })
  await readyHand(1)
  await readyHand(0)
  await phase('result')
  await saveShot('result-desktop')
  await page.getByRole('button', { name: 'Details', exact: true }).click()
  assert.equal(await page.locator('.boss-result-details .tabletop-formula').count(), 3)
  await page.getByRole('button', { name: 'Close', exact: true }).click()

  // All four cards start playable encounters, including larger random packs.
  for (const id of ['ironhide', 'wildmouth', 'briarback']) {
    await page.getByRole('button', { name: 'Choose boss', exact: true }).click()
    await page.locator(`.sheet [data-card-uid="boss_${id}"]`).click()
    await main().click()
    await finishDraft()
    await readyHand(0)
    await readyHand(1)
    await phase('result')
    const s = await read()
    assert.ok(Number.isFinite(s.result.teamPower))
    assert.ok(s.absorbed.length)
  }

  // Official Copy, draw/debt, sacrifice and shared Recycle controls through the UI.
  const prepFixture = (() => {
    const deck = getExpandedCoreDeck({ tabletop: 'abilities-new-cards' })
    const ids = ['copy_card_in_hand', 'draw_2_discard_2', 'discard_for_damage', 'robot1', 'robot_attack', 'recycle_card', 'dragon1', 'dragons_breath', 'bite', 'shield2', 'rabbit2', 'swarm']
    const take = id => deck.splice(deck.findIndex(c => c.id === id), 1)[0]
    const cs = ids.map(take)
    const s = createBossRun({ seed: 991, bossId: 'ironhide', options: { draftMode: 'shared', absorption: 'boss', weakerBonus: true } })
    s.absorbed = [take('robot_attack'), take('robot_attack'), take('bite')]
    s.phase = 'prepare'; s.hands = [cs.slice(0, 5), cs.slice(5, 10)]
    s.prep = createPreparationState({ mode: '20cards', playerHand: s.hands[0], opponentHand: s.hands[1], deck, discardPile: cs.slice(10) })
    return s
  })()
  await page.evaluate(s => localStorage.setItem('crd-boss-run-v1', JSON.stringify(s)), prepFixture)
  await page.reload()
  await phase('prepare')
  let s = await read()
  const copy = s.prep.playerHand.find(c => c.id === 'copy_card_in_hand')
  const robot = s.prep.playerHand.find(c => c.id === 'robot1')
  await page.locator(`[data-seat="0"] [data-card-uid="${copy.uid}"]`).click()
  await page.locator(`[data-seat="0"] [data-card-uid="${robot.uid}"]`).click()
  s = await read()
  assert.equal(s.prep.playerHand.filter(c => c.id === 'robot1').length, 2)
  const draw = s.prep.playerHand.find(c => c.id === 'draw_2_discard_2')
  await page.locator(`[data-seat="0"] [data-card-uid="${draw.uid}"]`).click()
  s = await read()
  assert.equal(s.prep.playerPendingDiscard.remaining, 2)
  const removed = [draw.uid, s.prep.playerHand.at(-1).uid]
  for (const uid of removed) await page.locator(`[data-seat="0"] [data-card-uid="${uid}"]`).click()
  await main().click()
  assert.equal((await read()).prep.playerPendingDiscard, null)
  s = await read()
  const sacrifice = s.prep.playerHand.find(c => c.id === 'discard_for_damage')
  await page.locator(`[data-seat="0"] [data-card-uid="${sacrifice.uid}"]`).click()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  assert.equal((await read()).prep.playerPendingDiscard, null)
  assert.equal((await read()).prep.playerActivated.includes(sacrifice.uid), false)
  await page.locator(`[data-seat="0"] [data-card-uid="${sacrifice.uid}"]`).click()
  await main().click() // Zero sacrifices are legal.
  s = await read()
  const recycle = s.prep.opponentHand.find(c => c.id === 'recycle_card')
  await page.locator(`[data-seat="1"] [data-card-uid="${recycle.uid}"]`).click()
  await page.locator(`.sheet [data-card-uid="${draw.uid}"]`).click()
  s = await read()
  assert.equal(s.prep.opponentHand.some(c => c.uid === draw.uid), true)
  assert.equal(s.prep.playerDiscard.some(c => c.uid === draw.uid), false)
  // Check displayed numbers against the actual co-op outcome, including shields
  // from both heroes and the boss's selected faction abilities.
  const expected = resolveBossBattle(await read()).boss
  for (const faction of ['critter', 'robot', 'dragon']) {
    assert.equal(Number(await page.locator(`[data-ttr="opponent-${faction}-stat"]`).textContent()), expected.stats[faction])
    assert.equal(Number(await page.locator(`[data-ttr="opponent-${faction}-dmg"]`).textContent()), expected.contributions[faction])
  }
  assert.equal(Number(await page.locator('[data-ttr="opponent-neutral-dmg"]').textContent()), expected.neutral)
  assert.equal(Number(await page.locator('.ttr-sum__total').textContent()), expected.score)
  assert.equal(Number(await page.locator('[data-ttr="opponent-bonus"]').textContent()), expected.bonus)
  assert.equal(Number(await page.locator('[data-ttr="opponent-shield"]').textContent().then(t => t.replace('−', ''))), expected.blocked)
  await page.getByRole('button', { name: /^Discard pile:/ }).click()
  assert.equal(await page.locator('.sheet').count(), 1)
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await readyHand(0)
  await readyHand(1)
  await phase('result')
  await page.getByRole('button', { name: 'Open menu', exact: true }).click()
  await page.getByRole('button', { name: 'Normal play', exact: true }).click()
  assert.equal(await page.locator('.boss-shell').count(), 0)
  assert.deepEqual(errors, [])
  await writeFile(`${output}/verification.json`, JSON.stringify({ pass: true, errors, checks: ['Testing gate', 'four bosses', 'all tools', 'reload', 'five-card budgets', 'Copy', 'draw/discard', 'sacrifice', 'shared Recycle', 'complete combat', 'exit', 'desktop/portrait/landscape layout and images', 'fixed card proportions including Pocket choices', 'top-right menu', 'existing physical deck/discard piles', 'live ledger stats/typed and neutral damage/Robot bonus/pooled shield reduction/total'] }, null, 2))
  console.log(`Boss browser checks passed: ${output}`)
} finally { await browser.close() }
