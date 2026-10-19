import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { createServer } from 'vite'

const digital = JSON.parse(await readFile(new URL('../data/cards.json', import.meta.url)))
const tabletop = JSON.parse(await readFile(new URL('../data/tabletop-cards.json', import.meta.url)))
const cards = [...digital.cards, ...tabletop.cards.map((card) => ({ ...card, tabletop: true }))]
for (const base of ['/', '/CRD/']) {
  const server = await createServer({ base, server: { middlewareMode: true }, appType: 'custom' })
  try {
    const { default: CardVisual } = await server.ssrLoadModule('/src/components/card/CardVisual.jsx')
    const { STAT_ICONS, DISPLAY_ICONS } = await server.ssrLoadModule('/src/components/card/cardData.js')
    for (const source of [...Object.values(STAT_ICONS), ...Object.values(DISPLAY_ICONS).filter((value) => value !== 'CRD')]) {
      assert.ok(source.startsWith(`${base}images/`), source)
    }
    let count = 0
    for (const card of cards) {
      for (let imageIndex = 0; imageIndex < card.images.length; imageIndex += 1) {
        const html = renderToStaticMarkup(createElement(CardVisual, {
          card: { ...card, imageIndex, copyOverlayImage: cards[0].images[0] },
        }))
        assert.ok(!/src="https?:/.test(html), `Remote image on ${card.id}`)
        assert.ok(!/<img(?![^>]*\bsrc=)[^>]*>/.test(html), `Missing image on ${card.id}`)
        for (const [, source] of html.matchAll(/<img[^>]*\bsrc="([^"]+)"/g)) {
          assert.ok(source.startsWith(`${base}images/`), source)
          await readFile(new URL(`../public/${source.slice(base.length)}`, import.meta.url))
          count += 1
        }
      }
    }
    console.log(`Verified ${count} rendered image references at base ${base}, including all art variants, custom icons and copy overlays.`)
  } finally {
    await server.close()
  }
}
