import sharedModel from '../../data/dan-shared-handpairs-net.json' with { type: 'json' }
import { createLearnedHandPolicy } from './learnedHandEvaluator.js'
import { chooseDanDecision as chooseLegacyDanDecision, DAN_BOT_VERSION as LEGACY_DAN_BOT_VERSION } from './legacyDanBotV6.js'
import { supportsOpponentFirst } from './opponentFirstPreparation.js'
import { chooseDiscardSixFifth } from './discardSixLookupPreparation.js'

export const DAN_BOT_VERSION = 'dan-draft-shared234-discard6lookup-opponentfirst5-twoorderprep-v10'
export const DAN_SHARED_MODEL_VERSION = sharedModel.version
export const DAN_SHARED_CHECKPOINT_SHA256 = sharedModel.checkpoint_sha256
// Keep historical metadata imports available for explicit fallback/replay users.
export { DAN_SEARCH_OPTIONS, DAN_PAIR_TABLE_VERSION, DAN_PAIR_SOURCE_SHA256,
  DAN_ROUND3_MODEL_VERSION, DAN_ROUND3_CHECKPOINT_SHA256 } from './legacyDanBotV6.js'

const policies = Object.fromEntries([2, 3, 4].map(size =>
  [size, createLearnedHandPolicy({ ...sharedModel, hand_size: size })]))

export function chooseDanDecision(game, side = 'opponent', options = {}) {
  if (game.mode !== 'draft') throw Error('DanBot plays Draft only')
  const pick = game[`${side}Hand`].length + 1
  const policy = policies[pick]
  if (policy?.supports(game, side)) {
    return { ...policy.choose(game, side), version: DAN_BOT_VERSION }
  }
  if (pick === 5 && supportsOpponentFirst(game)) {
    return { ...chooseDiscardSixFifth(game, side), version: DAN_BOT_VERSION, stage: 'opponent-first-round5' }
  }
  // Opening and unsupported rules/card pools retain the explicit historical fallback.
  return { ...chooseLegacyDanDecision(game, side, options), version: DAN_BOT_VERSION,
    ...([1, 5].includes(pick) ? { componentVersion: LEGACY_DAN_BOT_VERSION } : { fallbackVersion: LEGACY_DAN_BOT_VERSION }) }
}
