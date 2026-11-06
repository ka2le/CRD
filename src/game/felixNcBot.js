import model from '../../data/felix-nc-draft-net.json' with { type: 'json' }
import * as tt from './tabletop.js'
import * as cards from './cards.js'
import { makeAdapter } from './felixEffects.js'
import { createNCAdapter, createNCDraftPolicy } from './felixNcPolicy.js'

export const FELIX_NC_VERSION = model.version
export const FELIX_NC_CHECKPOINT_SHA256 = model.checkpoint_sha256
export const felixNcAdapter = createNCAdapter({ tt, cards, makeAdapter })
export const felixNcPolicy = createNCDraftPolicy(model, felixNcAdapter)

export function isFelixNcGame(game) {
  return game.mode === 'draft' && [...(game.draftRow ?? []), ...(game.playerHand ?? []), ...(game.opponentHand ?? [])]
    .some(card => card.tabletop === 'abilities-new-cards')
}

export function chooseFelixNcDecision(game, side = 'opponent') {
  if (!isFelixNcGame(game)) throw Error('FelixNC requires Abilities+NewCards Draft')
  return { ...felixNcPolicy.choose(game, side), kernel: 'FelixNC-neural-draft', modelVersion: FELIX_NC_VERSION }
}

// Same bounded native planner as the qualified offline FelixNC. The existing
// worker runs the complete preparation; no learned preparation model is used.
export function getFelixPreparationOptions(game) {
  return { discardSixLookup: false, ...(isFelixNcGame(game)
    ? { timeBudgetMs: 1e12, maxNodes: 12000, maxDepth: 8 }
    : {}) }
}
