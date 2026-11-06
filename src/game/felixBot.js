import model from '../../data/felix-handpairs-net.json' with { type: 'json' }
import * as tt from './tabletop.js'
import * as cards from './cards.js'
import { makeAdapter } from './felixEffects.js'
import { createFelixPolicy } from './felixHandEvaluator.js'
import { chooseDanDecision } from './danBot.js'
import { chooseOpponentFirstFifth, supportsOpponentFirst } from './opponentFirstPreparation.js'
import { isFelixNcGame, chooseFelixNcDecision } from './felixNcBot.js'

export const FELIX_BOT_VERSION = 'felix-draft-effects12345-240k-v1'
export const FELIX_INFERENCE_STAGES = Object.freeze([1, 2, 3, 4, 5])
export const FELIX_MODEL_VERSION = model.version
export const FELIX_CHECKPOINT_SHA256 = model.checkpoint_sha256
// Explicit current engine semantics, checked against official arithmetic and the
// frozen research adapter. Numeric rule values still come from the live engine.
export const felixAdapter = makeAdapter(tt, cards,
  { totalThreshold: true, dragonOnly: true, blockBonus: true })
export const felixPolicy = createFelixPolicy(model, felixAdapter)
export const expandedFelixAdapter = makeAdapter(tt, cards,
  { totalThreshold: true, dragonOnly: true, blockBonus: true }, { tabletop: 'abilities-new-cards' })

export function chooseFelixDecision(game, side = 'opponent', options = {}) {
  if (game.mode !== 'draft') throw Error('FelixBot plays Draft only')
  if (isFelixNcGame(game)) return chooseFelixNcDecision(game, side)
  const pick = game[`${side}Hand`].length + 1
  const enemy = side === 'player' ? 'opponent' : 'player'
  const adapter = felixAdapter
  const supported = [...game[`${side}Hand`], ...game[`${enemy}Hand`], ...game.draftRow]
    .every(c => c.tabletop === 'abilities-main' && adapter.definitions.has(c.id))
  if (FELIX_INFERENCE_STAGES.includes(pick) && supported) {
    return { ...felixPolicy.choose(game, side), version: FELIX_BOT_VERSION, modelVersion: FELIX_MODEL_VERSION }
  }
  if (pick === 5 && supportsOpponentFirst(game)) {
    return { ...chooseOpponentFirstFifth(game, side), version: FELIX_BOT_VERSION, stage: 'opponent-first-round5' }
  }
  return { ...chooseDanDecision(game, side, options), version: FELIX_BOT_VERSION, fallback: 'DanBot' }
}
