import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { getCoreCards, getExpandedCoreDeck } from '../src/game/cards.js'
import { scoreTabletopHand, resolveTabletopBattle } from '../src/game/tabletop.js'

test('rules, inspection and printed cards follow the selected physical deck and scorer', async () => {
  const server = await createServer({ configFile: false, plugins: [react()], server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: 'custom' })
  try {
    const { getRulesText } = await server.ssrLoadModule('/src/components/overlay/rulesText.js')
    const { getRulesCards, getHandBuildingFacts, getShieldCosts } = await server.ssrLoadModule('/src/components/overlay/rulesPresentation.js')
    const { getCardSummary } = await server.ssrLoadModule('/src/components/card/cardMeta.js')
    const { default: HelpSheet } = await server.ssrLoadModule('/src/components/overlay/HelpSheet.jsx')
    const { default: CardVisual } = await server.ssrLoadModule('/src/components/card/CardVisual.jsx')
    const { MainAbilityLedgerCard } = await server.ssrLoadModule('/src/components/overlay/AbilityCards.jsx')
    const { default: MonsterDeckEditor } = await server.ssrLoadModule('/src/components/overlay/MonsterDeckEditor.jsx')
    const { CardMotionProvider } = await server.ssrLoadModule('/src/components/animation/CardMotionContext.jsx')
    const { STAT_ICONS, DISPLAY_ICONS } = await server.ssrLoadModule('/src/components/card/cardData.js')
    const { getIconUrl } = await server.ssrLoadModule('/src/components/ui/iconSources.js')
    for (const [key, url] of Object.entries(STAT_ICONS)) assert.equal(url, getIconUrl(key))
    assert.equal(DISPLAY_ICONS.dmg, getIconUrl('damage'))
    const render = (Component, props) => renderToStaticMarkup(createElement(Component, props))
    for (const tabletop of [false, 'threshold', 'abilities-prototype', 'abilities-main', 'abilities-new-cards', 'monsters']) {
      for (const mode of ['draft', '6draft', 'five-hand-discard', '20cards']) {
        for (const wildDeck of [false, true]) {
          const options = { tabletop, mode, wildDeck }
          const deck = getExpandedCoreDeck(options)
          const cards = getRulesCards(options)
          assert.equal(cards.reduce((n, c) => n + c.copies, 0), deck.length)
          const text = getRulesText(tabletop, mode, mode, { wildDeck })
          for (const card of cards) {
            assert.equal(card.copies, deck.filter(c => c.id === card.id).length)
            assert(text.includes(`${card.name}: ${getCardSummary(card).timing}. ${getCardSummary(card).text}`))
            const face = render(CardVisual, { card })
            for (const type of ['critter', 'robot', 'dragon', 'monster']) {
              if (card.type === 'stat') assert.equal((face.match(new RegExp(`alt="${type}"`, 'g')) ?? []).length, card.stats.filter(s => s === type).length)
            }
            if (card.effect?.dmg) assert.equal((face.match(/alt="damage"/g) ?? []).length, card.effect.dmg)
          }
          if (mode === '20cards') { assert.match(text, /20Cards: deal twenty/); assert.doesNotMatch(text, /Draft: pick/); }
          if (mode === '6draft') assert.equal(text.includes('third Double Critter'), tabletop === 'abilities-new-cards' && !wildDeck)
        }
      }
      const help = render(HelpSheet, { open: true, tabletop, mode: 'draft' })
      assert.equal(help.includes('data-help-card="critter_shield"'), ['abilities-new-cards', 'monsters'].includes(tabletop))
      if (tabletop) {
        const deck = getExpandedCoreDeck({ tabletop })
        const hand = [deck.find(c => c.id === 'bite')]
        const costs = getShieldCosts(tabletop)
        for (const type of Object.keys(costs)) {
          // Chameleon makes the older rules' faction choices explicit.
          const testHand = ['threshold', 'abilities-prototype'].includes(tabletop) ? [...hand, deck.find(c => c.id === 'chameleon')] : hand
          assert.equal(scoreTabletopHand(testHand, 1, type).shieldPenalty, costs[type])
        }
      }
    }
    const options = { tabletop: 'monsters', wildDeck: true, monsterDeck: { shield2: 0, no_stats_to_2: 2, shield_ulti: 1, monster_critter_dmg: 0 } }
    const text = getRulesText('monsters', 'draft', undefined, options)
    const html = render(HelpSheet, { open: true, ...options })
    assert.match(text, /From Nothing: Passive stats/)
    assert.doesNotMatch(text, /2 of every stat/)
    assert.match(html, /data-help-card="no_stats_to_2"/)
    assert.doesNotMatch(html, /data-help-card="shield2"|data-help-card="monster_critter_dmg"/)
    const deck = getExpandedCoreDeck({ tabletop: 'monsters' })
    const specialist = deck.find(c => c.id === 'single_faction_2')
    assert.match(render(CardVisual, { card: specialist }), /alt="monster"/)
    assert.equal(scoreTabletopHand([specialist, deck.find(c => c.id === 'monster1')], 0, 'monster').score, 2)
    assert.equal(getCardSummary(deck.find(c => c.id === 'monster_robot_dmg')).timing, 'Tabletop power')
    const bite = deck.find(c => c.id === 'bite')
    assert.equal(resolveTabletopBattle([bite], [bite], { playerType: 'critter', opponentType: 'monster' }).winner, 'player')
    const reference = render(MainAbilityLedgerCard, { rules: 'monsters' })
    assert.match(reference, /No faction bonus/)
    assert.match(reference, /card-visual__art/)
    assert.doesNotMatch(reference, /ab-pc__wm/)
    assert.match(getHandBuildingFacts('monsters', 'draft', { secretCard: true })[0].text, /five-card pack.*5 alternating public packs of 6/s)
    assert.match(getRulesText('abilities', 'draft'), /Critters Robots Dragons — Abilities/)
    const minimumDeck = { ...Object.fromEntries(getCoreCards({ tabletop: 'monsters', includeDisabled: true }).map(card => [card.id, 0])), critter1: 30, robot1: 6 }
    const editor = renderToStaticMarkup(createElement(CardMotionProvider, null, createElement(MonsterDeckEditor, { mode: '20cards', monsterDeck: minimumDeck, onApply: () => {} })))
    assert.match(editor, /Keep at least 40 cards for this mode/)
    assert.match(editor, /three ordered hands of five/)
  } finally { await server.close() }
})
