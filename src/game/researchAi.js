// Canonical NEW research/data policy. Historical baseline helpers and archived
// replay protocols retain their old meanings; callers opt into this named policy.
import { searchDavidDecision, DAVID_BOT_OPTIONS, DAVID_BOT_VERSION, DAVID_BOT_IMPLEMENTATION } from './davidBot.js'
import { searchDecision, searchPreparationDecision, SEARCH_AI_VERSION } from './searchAi.js'
import { BOT_SEARCH_PROFILES } from './opponentAi.js'
import priorMetadata from '../../data/david-opponents.meta.json' with { type: 'json' }

export function getResearchAiProfile(mode) {
  return { id: mode === 'five-hand-discard' ? 'david' : 'search',
    ...(mode === 'five-hand-discard' ? { opponentPoolSha256: priorMetadata.publicPoolSha256, implementation: DAVID_BOT_IMPLEMENTATION } : {}),
    decisionVersion: mode === 'five-hand-discard' ? DAVID_BOT_VERSION : SEARCH_AI_VERSION,
    decision: mode === 'five-hand-discard' ? DAVID_BOT_OPTIONS : BOT_SEARCH_PROFILES.search.decision,
    preparationVersion: SEARCH_AI_VERSION, preparation: BOT_SEARCH_PROFILES.search.preparation }
}

export async function chooseResearchAiDecision(state, { seed, onProgress } = {}) {
  if (state.preparation) return searchPreparationDecision(state.preparation, state.game, state.actor,
    { ...BOT_SEARCH_PROFILES.search.preparation, seed })
  if (state.game.mode === 'five-hand-discard') return searchDavidDecision(state, { onProgress })
  return searchDecision(state.game, state.actor, { ...BOT_SEARCH_PROFILES.search.decision, seed })
}
