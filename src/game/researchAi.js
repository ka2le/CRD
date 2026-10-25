// Canonical NEW research/data policy. Historical baseline helpers and archived
// replay protocols retain their old meanings; callers opt into this named policy.
import { searchDavidDecision, DAVID_BOT_OPTIONS, DAVID_BOT_VERSION, DAVID_BOT_IMPLEMENTATION } from './davidBot.js'
import { chooseDanDecision, DAN_BOT_VERSION, DAN_SEARCH_OPTIONS, DAN_PAIR_TABLE_VERSION, DAN_PAIR_SOURCE_SHA256, DAN_ROUND3_MODEL_VERSION, DAN_ROUND3_CHECKPOINT_SHA256 } from './danBot.js'
import { chooseFastPreparation, FAST_PREPARATION_VERSION, FAST_PREPARATION_PROFILE } from './fastPreparation.js'
import priorMetadata from '../../data/david-opponents.meta.json' with { type: 'json' }
import { DAN_PREPARATION_VERSION, DAN_FIFTH_VERSION } from './opponentFirstPreparation.js'

export function getResearchAiProfile(mode) {
  return { id: mode === 'five-hand-discard' ? 'david' : 'dan',
    ...(mode === 'five-hand-discard' ? { opponentPoolSha256: priorMetadata.publicPoolSha256, implementation: DAVID_BOT_IMPLEMENTATION } : {}),
    decisionVersion: mode === 'five-hand-discard' ? DAVID_BOT_VERSION : DAN_BOT_VERSION,
    decision: mode === 'five-hand-discard' ? DAVID_BOT_OPTIONS : { opening: 'frozen-single-card-ranking',
      round2: { policy: 'own-pair-ranking', version: DAN_PAIR_TABLE_VERSION, sourceTableSha256: DAN_PAIR_SOURCE_SHA256 },
      round3: { policy: 'frozen-final-outcome-net-maximin', modelVersion: DAN_ROUND3_MODEL_VERSION,
        checkpointSha256: DAN_ROUND3_CHECKPOINT_SHA256, comparisons: [4, 20] },
      laterRounds: [4], later: DAN_SEARCH_OPTIONS,
      round5: { policy: DAN_FIFTH_VERSION, comparisons: [4, 20], scope: 'Regular Abilities; other pools retain search' } },
    preparationVersion: mode === 'draft' ? DAN_PREPARATION_VERSION : FAST_PREPARATION_VERSION,
    preparation: { ...FAST_PREPARATION_PROFILE, ...(mode === 'draft' ? { opponentModel: 'two preparation orders, restricted minimax/private commitment; Regular Abilities; pick5 remains single opponent-first' } : {}) },
    comparisonOpponent: 'search (SvenBot, unchanged historical profile)' }
}

export async function chooseResearchAiDecision(state, { seed, onProgress } = {}) {
  if (state.preparation) return chooseFastPreparation(state)
  if (state.game.mode === 'five-hand-discard') return searchDavidDecision(state, { onProgress })
  return chooseDanDecision(state.game, state.actor, { seed })
}
