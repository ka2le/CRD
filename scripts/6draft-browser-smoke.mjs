import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const { chromium } = createRequire(import.meta.url)(process.env.CRD_PLAYWRIGHT_MODULE || 'playwright')
const output = resolve(process.env.CRD_BROWSER_OUTPUT || 'artifacts/ui/6draft')
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true,
  ...(process.env.CRD_BROWSER_EXECUTABLE ? { executablePath: process.env.CRD_BROWSER_EXECUTABLE } : {}) })
const errors = [], results = []
try {
  for (const viewport of [{ width: 1360, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }]
    .filter(v => !process.env.CRD_BROWSER_WIDTH || v.width === Number(process.env.CRD_BROWSER_WIDTH))) {
    const page = await browser.newPage({ viewport })
    page.setDefaultTimeout(20000)
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(process.env.CRD_URL || 'http://127.0.0.1:5173/')
    await page.waitForFunction(() => localStorage.getItem('crd-local-game-v1'))
    const read = () => page.evaluate(() => JSON.parse(localStorage.getItem('crd-local-game-v1')).state)
    const install = async (phase, opponentAi = 'rules') => {
      await page.evaluate(async ({ phase, opponentAi }) => {
        const draft = await import('/src/game/draftMode.js')
        const { createPreparationState } = await import('/src/game/preparationState.js')
        const { sessionReducer, normalizePlaySettings } = await import('/src/hooks/useGameSession.js')
        const saved = JSON.parse(localStorage.getItem('crd-local-game-v1'))
        let game = draft.createDraftGame({ mode: '6draft', seed: 71, tabletop: 'abilities-new-cards' })
        if (phase !== 'draft') {
          while (game.phase !== 'draft-hidden-discard' && !(phase === 'sixth' && game.packNumber === 6)) {
            if (game.phase === 'draft-player-pick') game = draft.applyDraftPick(game, game.draftRow[0].uid)
            else if (game.phase === 'draft-opponent-thinking') game = draft.resolveOpponentDraftPick(game)
            else if (game.phase === 'draft-pack-clearing') game = draft.commitDraftDiscard(game)
            else game = draft.revealNextDraftPack(game)
          }
          if (phase === 'prepare' || phase === 'battle') {
            game = draft.applyHiddenDraftDiscard(game, 'player', game.playerHand[0].uid)
            game = draft.applyHiddenDraftDiscard(game, 'opponent', game.opponentHand[0].uid)
          }
        }
        if (opponentAi === 'search') game.pendingOpponentPickUid = null
        const base = sessionReducer(saved.state, { type: 'RESET_GAME', nextMode: '6draft' })
        saved.state = { ...base, gameMode: '6draft', game,
          settings: normalizePlaySettings(base.settings, { gameMode: '6draft', opponentAi }),
          preBattle: { ...base.preBattle, ...createPreparationState(game) },
          battleStarted: phase === 'battle' }
        localStorage.setItem('crd-local-game-v1', JSON.stringify(saved))
        localStorage.setItem('crd-battle-animation-v1', 'off')
      }, { phase, opponentAi })
      await page.reload()
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('crd-local-game-v1')).state.game.mode === '6draft')
      await page.locator('.shuffle-intro').waitFor({ state: 'hidden' })
    }
    const verifyLayout = async label => {
      await page.waitForTimeout(550)
      const metrics = await page.evaluate(() => ({
        scroll: document.documentElement.scrollHeight > innerHeight,
        outside: [...document.querySelectorAll('.table .card, .table__action, .screen-menu__trigger')].filter(node => {
          const r = node.getBoundingClientRect()
          return r.width && r.height && (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1)
        }).map(node => node.className),
      }))
      await page.screenshot({ path: `${output}/${label}-${viewport.width}.png` })
      assert.equal(metrics.scroll, false, label)
      assert.deepEqual(metrics.outside, [], label)
      results.push({ label, viewport, ...metrics })
    }
    // The normal menu exposes the new mode and only compatible bots.
    await page.getByRole('button', { name: 'Open menu', exact: true }).click()
    await page.getByRole('radio', { name: '6draft', exact: true }).click()
    assert.equal((await read()).game.mode, '6draft')
    await page.getByRole('button', { name: 'Open menu', exact: true }).click()
    const opponentOptions = await page.locator('select option').allTextContents()
    assert(opponentOptions.some(text => text.includes('Sven')))
    assert(opponentOptions.some(text => /Felix/.test(text)))
    assert(!opponentOptions.some(text => /DanBot|DavidBot|IngaBot/.test(text)))
    await page.screenshot({ path: `${output}/menu-${viewport.width}.png` })
    await page.getByRole('button', { name: 'Open menu', exact: true }).click()
    await install('draft')
    await verifyLayout('draft')
    if (viewport.width === 1360 && !process.env.CRD_SKIP_FULL_DRAFT) {
      // Play all six real human turns and asynchronous Rolf turns.
      for (let pick = 0; pick < 6; pick++) {
        await page.waitForFunction(() => {
          const s = JSON.parse(localStorage.getItem('crd-local-game-v1')).state
          return s.game.phase === 'draft-player-pick' && !s.pendingPlayerDraftPickAnimation
        })
        await page.locator('.pack-area .card[aria-disabled="false"]').first().click()
        await page.waitForFunction(n => JSON.parse(localStorage.getItem('crd-local-game-v1')).state.game.playerHand.length === n, pick + 1)
      }
      await page.getByRole('button', { name: 'Discard 1', exact: true }).waitFor()
    } else await install('discard')
    await verifyLayout('hidden-discard')
    assert.equal(await page.locator('.hand-area--opponent .card:not(.card--facedown)').count(), 0)
    assert.equal(await page.getByRole('button', { name: 'Discard 1', exact: true }).isDisabled(), true)
    let state = await read()
    const discardUid = state.game.playerHand[0].uid
    await page.locator(`.hand-area--player [data-card-uid="${discardUid}"]`).click()
    await page.getByRole('button', { name: 'Discard 1', exact: true }).click()
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('crd-local-game-v1')).state.game.phase === 'battle-ready')
    state = await read()
    assert.equal(state.preBattle.playerHand.length, 5)
    assert.equal(state.preBattle.opponentHand.length, 5)
    assert.equal(state.game.playerHiddenDiscard[0].uid, discardUid)
    assert(!state.preBattle.playerDiscard.some(card => card.uid === discardUid))
    await page.reload()
    assert.equal((await read()).game.playerHiddenDiscard[0].uid, discardUid)
    await verifyLayout('hidden-prep')
    assert.equal(await page.locator('.hand-area--opponent .card:not(.card--facedown)').count(), 0)
    await install('battle')
    await verifyLayout('battle')
    await page.getByRole('button', { name: 'View the table', exact: true }).click()
    await page.getByRole('button', { name: /Set aside/ }).click()
    assert.equal(await page.locator('.sheet-cards .card').count(), 2)
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await install('discard', 'local')
    assert.equal(await page.locator('.local-handoff').count(), 1)
    await verifyLayout('local-handoff')
    await page.getByRole('button', { name: /Reveal .*hand/ }).click()
    await page.getByRole('button', { name: 'Show all', exact: true }).click()
    assert.equal(await page.locator('.hand-area--opponent .card--facedown').count(), 0)
    await page.getByRole('button', { name: 'Hide', exact: true }).click()
    assert.equal(await page.locator('.hand-area--opponent .card:not(.card--facedown)').count(), 0)
    // Start Sven at the hidden choice boundary and ensure its real worker completes it.
    if (viewport.width === 1360) {
      await install('sixth', 'search')
      await page.waitForFunction(() => {
        const g = JSON.parse(localStorage.getItem('crd-local-game-v1')).state.game
        return g.phase === 'draft-player-pick' && g.opponentHand.length === 6
      })
      await page.locator('.pack-area .card[aria-disabled="false"]').first().click()
      await page.getByRole('button', { name: 'Discard 1', exact: true }).waitFor()
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('crd-local-game-v1')).state.game.opponentHiddenDiscard.length === 1)
      state = await read()
      await page.locator(`.hand-area--player [data-card-uid="${state.game.playerHand[0].uid}"]`).click()
      await page.getByRole('button', { name: 'Discard 1', exact: true }).click()
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('crd-local-game-v1')).state.game.phase === 'battle-ready')
      const choice = await page.evaluate(async () => {
        const { getTabletopChoice, getCardTabletopTypes } = await import('/src/game/tabletop.js')
        const prep = JSON.parse(localStorage.getItem('crd-local-game-v1')).state.preBattle
        const choice = getTabletopChoice(prep)
        return choice.needsChoice ? prep.playerHand.find(card => getCardTabletopTypes(card, choice).length)?.uid : null
      })
      if (choice) {
        await page.getByRole('button', { name: 'Battle', exact: true }).click()
        await page.locator(`.hand-area--player [data-card-uid="${choice}"]`).click()
        if (await page.locator('.faction-picker__option').count()) await page.locator('.faction-picker__option').first().click()
      }
      await page.getByRole('button', { name: 'Battle', exact: true }).click()
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('crd-local-game-v1')).state.battleStarted)
      assert.equal(await page.locator('[role=alert]').count(), 0)
    }
    await page.close()
  }
  assert.deepEqual(errors, [])
  await writeFile(`${output}/verification.json`, JSON.stringify({ url: process.env.CRD_URL || 'http://127.0.0.1:5173/', results, errors, fullRolfDraft: !process.env.CRD_SKIP_FULL_DRAFT && results.some(r => r.viewport.width === 1360), svenDraftDiscardPrep: results.some(r => r.viewport.width === 1360) }, null, 2))
  console.log(`6draft browser checks passed: ${results.length} layouts; draft/discard/reload, Sven sixth-pick/discard/preparation worker (desktop), same-screen handoff.`)
} finally { await browser.close() }
