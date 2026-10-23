import * as h from './headlessGame.js'
import * as cards from './cards.js'
import * as prep from './preparationState.js'
import * as oldPrep from './preBattle.js'
import * as tt from './tabletop.js'
import { createDavidPolicy } from './davidBotCore.js'
import sourcePool from '../../data/david-opponents.json' with { type: 'json' }

export const DAVID_BOT_VERSION = 'david-discard-probability-v1'
export const DAVID_BOT_OPTIONS = Object.freeze({ opponentCount: 50, prepScenarios: 2, chanceLimit: 1000000, stream: 912371 })
const policies = new Map()
const sourceIds = cards.getCoreCards({ tabletop: 'abilities-main' }).map((card) => card.id)

export function getDavidPolicy(input = {}) {
  const config = { mode: 'five-hand-discard', wildDeck: input.wildDeck ?? true,
    tabletop: tt.normalizeTabletopRules(input.tabletop), control: 'both', revealOpponent: false }
  const key = JSON.stringify(config)
  if (policies.has(key)) return policies.get(key)
  const definitions = cards.getCoreCards({ tabletop: config.tabletop })
    .map((card) => config.tabletop ? tt.toTabletopCard(card, config.tabletop) : card)
  const byId = new Map(definitions.map((card) => [card.id, card]))
  // Preserve the tested prior exactly for Abilities. Other resolvers inherit its
  // hand compositions, with current printed mechanics and current card ordering.
  const pool = config.tabletop === 'abilities-main' ? sourcePool : {
    entries: sourcePool.entries.filter((entry) => entry.prepared.every((card) => byId.has(card.id))).map((entry) => ({
      ...entry,
      rawCounts: definitions.map((card) => entry.rawCounts[sourceIds.indexOf(card.id)] ?? 0),
      prepared: entry.prepared.map((card) => ({ ...byId.get(card.id), uid: card.uid,
        ...(card.isCopiedCard ? { isCopiedCard: true, copySourceCardId: card.copySourceCardId } : {}) })),
    })),
  }
  const policy = createDavidPolicy({ h, cards, prep, oldPrep, tt, pool, config })
  policies.set(key, policy)
  return policy
}

export async function davidPlanningSeed(visible, stream = DAVID_BOT_OPTIONS.stream) {
  const bytes = new TextEncoder().encode(JSON.stringify({ v: visible, stream }))
  const hash = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes))
  return new DataView(hash.buffer).getUint32(0, false)
}

export async function searchDavidDecision(state, options = {}) {
  const policy = getDavidPolicy(state.config)
  const seed = await davidPlanningSeed(policy.view(state), options.stream ?? DAVID_BOT_OPTIONS.stream)
  return policy.search(state, { ...DAVID_BOT_OPTIONS, ...options, seed })
}

export function davidStateFromGame(game, side = 'opponent', config = {}) {
  return { config: { ...config, control: 'both', revealOpponent: false }, game, actor: side,
    preparation: null, terminal: false, decisions: { player: 0, opponent: 0 },
    history: [{ scope: 'public', cards: [...(game.playerDiscards ?? []), ...(game.opponentDiscards ?? [])] }] }
}

export async function searchDavidGame(game, side = 'opponent', config = {}, options = {}) {
  return searchDavidDecision(davidStateFromGame(game, side, config), options)
}
