// Canonical NEW research/data policy. Historical baseline helpers and archived
// replay protocols retain their old meanings; callers opt into this named policy.
import { searchDavidDecision, DAVID_BOT_OPTIONS, DAVID_BOT_VERSION, DAVID_BOT_IMPLEMENTATION } from './davidBot.js'
import { chooseDanDecision, DAN_BOT_VERSION, DAN_SHARED_MODEL_VERSION, DAN_SHARED_CHECKPOINT_SHA256 } from './danBot.js'
import { OPENING_PRIORITY_VERSION } from './openingPriority.js'
import { chooseFastPreparation, FAST_PREPARATION_VERSION, FAST_PREPARATION_PROFILE } from './fastPreparation.js'
import priorMetadata from '../../data/david-opponents.meta.json' with { type: 'json' }
import { DAN_LOOKUP_PREPARATION_VERSION, DAN_LOOKUP_FIFTH_IMPLEMENTATION, DAN_DISCARD_SIX_LOOKUP_VERSION } from './discardSixLookupPreparation.js'

export function getResearchAiProfile(mode) {
  return { id: mode === 'five-hand-discard' ? 'david' : 'dan',
    ...(mode === 'five-hand-discard' ? { opponentPoolSha256: priorMetadata.publicPoolSha256, implementation: DAVID_BOT_IMPLEMENTATION } : {}),
    decisionVersion: mode === 'five-hand-discard' ? DAVID_BOT_VERSION : DAN_BOT_VERSION,
    decision: mode === 'five-hand-discard' ? DAVID_BOT_OPTIONS : {
      policy: 'shared-equal-handpair-eventual-WDL-maximin', rounds: [2, 3, 4],
      opening: OPENING_PRIORITY_VERSION, round5: 'opponent-first-prepared-response-pick5-v1',
      round5Implementation: DAN_LOOKUP_FIFTH_IMPLEMENTATION, discardSixLookupVersion: DAN_DISCARD_SIX_LOOKUP_VERSION,
      modelVersion: DAN_SHARED_MODEL_VERSION, checkpointSha256: DAN_SHARED_CHECKPOINT_SHA256,
      parameters: 125016, comparisons: [4, 20],
      fallback: 'Preserved Dan v6 for unsupported rules or card identities' },
    preparationVersion: mode === 'draft' ? DAN_LOOKUP_PREPARATION_VERSION : FAST_PREPARATION_VERSION,
    preparation: { ...FAST_PREPARATION_PROFILE, ...(mode === 'draft' ? { opponentModel: 'two preparation orders, restricted minimax/private commitment; six-card empirical discard lookup in pick5 and actual preparation', discardSixLookupVersion: DAN_DISCARD_SIX_LOOKUP_VERSION } : {}) },
    comparisonOpponent: 'search (SvenBot, unchanged historical profile)' }
}

export async function chooseResearchAiDecision(state, { seed, onProgress } = {}) {
  if (state.preparation) return chooseFastPreparation(state)
  if (state.game.mode === 'five-hand-discard') return searchDavidDecision(state, { onProgress })
  return chooseDanDecision(state.game, state.actor, { seed })
}
