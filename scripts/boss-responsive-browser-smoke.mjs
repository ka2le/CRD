import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { BOSS_PRESETS, bossReducer, createBossRun } from '../src/game/bossBattle.js'
import { createPreparationState } from '../src/game/preparationState.js'

const { chromium } = createRequire(import.meta.url)(process.env.CRD_PLAYWRIGHT_MODULE || 'playwright')
const output = resolve(process.env.CRD_BROWSER_OUTPUT || 'artifacts/ui/boss-responsive')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const results = [], errors = []
function fixture(absorbedCount) {
  const initial = createBossRun({ bossId: 'wildmouth', seed: 771, options: BOSS_PRESETS.separate })
  const deck = [...initial.deck]
  const take = id => deck.splice(deck.findIndex(c => c.id === id), 1)[0]
  const hands = [
    ['robot1', 'robot_attack', 'critter1', 'swarm', 'shield2'].map(take),
    ['dragon2', 'dragon1', 'dragons_breath', 'dragon_ulti', 'one_off_each'].map(take),
  ]
  const pockets = [take('bite'), take('critter_shield')]
  const absorbed = deck.splice(0, absorbedCount)
  let state = { ...initial, phase: 'prepare', hands, deck, pockets, absorbed,
    prep: createPreparationState({ mode: '20cards', playerHand: hands[0], opponentHand: hands[1], deck }) }
  state = bossReducer(state, { type: 'faction', seat: 0, faction: 'robot' })
  state = bossReducer(state, { type: 'faction', seat: 1, faction: 'dragon' })
  return state
}
try {
  for (const viewport of [{ width: 1360, height: 900 }, { width: 1280, height: 590 }, { width: 844, height: 390 },
    { width: 740, height: 360 }, { width: 667, height: 375 }, { width: 590, height: 1280 },
    { width: 390, height: 844 }, { width: 320, height: 568 }].filter(v => !process.env.CRD_BROWSER_WIDTH || v.width === Number(process.env.CRD_BROWSER_WIDTH))) {
    const context = await browser.newContext({ viewport })
    const page = await context.newPage()
    page.on('pageerror', e => errors.push(e.message))
    await page.goto(process.env.CRD_URL || 'http://127.0.0.1:5173/')
    for (const count of [5, 30]) {
      const prep = fixture(count)
      let result = prep
      for (const seat of [0, 1]) result = bossReducer(result, { type: 'prepare', seat, action: { type: 'finish-preparation' } })
      assert.equal(result.phase, 'result')
      for (const [phase, state] of [['prepare', prep], ['result', result]]) {
        await page.evaluate(s => {
          localStorage.setItem('crd-battle-animation-v1', 'off')
          localStorage.setItem('crd-boss-mode-v1', 'true')
          localStorage.setItem('crd-boss-run-v1', JSON.stringify(s))
        }, state)
        await page.reload()
        await page.locator('.boss-table').waitFor()
        await page.waitForTimeout(500)
        const metrics = await page.evaluate(() => {
          const box = n => {
            const r = n.getBoundingClientRect()
            return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
          }
          const outside = [...document.querySelectorAll('.boss-table .card, .boss-result-heading, .boss-result-actions .ui-button, .boss-scoreboard .ttr-row, .boss-scoreboard .ttr-cell, .boss-scoreboard .ttr-sum, .boss-pocket, .boss-dock')]
            .filter(n => { const r = box(n); return r.width && (r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1) }).map(n => n.className)
          const equations = [...document.querySelectorAll('.boss-scoreboard .ttr-sum')].map(n => [...n.children].map(box))
          const hands = [...document.querySelectorAll('.boss-hero')].map(n => ({
            cards: [...n.querySelectorAll('.boss-hero-cards .card')].map(box),
            area: box(n),
            pocket: box(n.querySelector('.boss-pocket')),
          }))
          return { outside, equations, hands, boss: box(document.querySelector('.boss-portrait .card')),
            menu: box(document.querySelector('.screen-menu__trigger')),
            resultParts: [...document.querySelectorAll('.boss-center, .boss-result, .boss-result-heading, .boss-scoreboard')].map(n => ({ className: n.className, ...box(n) })),
            cards: [...document.querySelectorAll('.boss-table .card')].map(box),
            scroll: document.documentElement.scrollHeight > innerHeight }
        })
        const label = `${phase}-${count}-${viewport.width}`
        await page.screenshot({ path: `${output}/${label}.png` })
        assert.deepEqual(metrics.outside, [], `${label}: ${JSON.stringify(metrics.resultParts)}`)
        assert.equal(metrics.scroll, false, label)
        assert.ok(metrics.boss.width > 0 && metrics.boss.height > 0, `${label}: boss is visible`)
        const separated = (a, b) => a.right <= b.left + .5 || b.right <= a.left + .5 || a.bottom <= b.top + .5 || b.bottom <= a.top + .5
        for (const card of metrics.cards) assert.ok(separated(card, metrics.menu), `${label}: menu covers a card`)
        for (const parts of metrics.equations) for (let i = 1; i < parts.length; i++) assert.ok(parts[i].left >= parts[i - 1].right - .5, `${label}: equation overlap`)
        for (const { cards, area } of metrics.hands) for (const card of cards) {
          assert.ok(card.width > 0 && card.height > 0 && card.top >= area.top - 1 && card.bottom <= area.bottom + 1, `${label}: hand card is visible in its lane`)
        }
        for (const { cards } of metrics.hands) for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
          const a = cards[i], b = cards[j]
          assert.ok(a.right <= b.left + .5 || b.right <= a.left + .5 || a.bottom <= b.top + .5 || b.bottom <= a.top + .5, `${label}: hand overlap`)
        }
        results.push({ viewport, phase, absorbedCount: count, ...metrics })
      }
    }
    assert.equal(await page.locator('.boss-heading, .boss-header [aria-label="Boss rules"]').count(), 0)
    await page.getByRole('button', { name: 'Open menu', exact: true }).click()
    await page.getByRole('button', { name: 'Boss rules', exact: true }).click()
    await page.locator('.sheet .boss-help').waitFor()
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await context.close()
  }
  assert.deepEqual(errors, [])
  await writeFile(`${output}/verification.json`, JSON.stringify({ pass: true, results, errors }, null, 2))
  console.log(`Boss responsive checks passed: ${results.length} cases`)
} finally { await browser.close() }
