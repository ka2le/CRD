import opening from '../../data/dan-opening.json' with { type: 'json' }
import pairs from '../../data/dan-pairs.json' with { type: 'json' }
import net3 from '../../data/dan-round3-net.json' with { type: 'json' }
import { searchDecision } from './searchAi.js'
import { createLearnedHandPolicy } from './learnedHandEvaluator.js'

export const DAN_BOT_VERSION = 'dan-draft-scalar2-subset3-search128-v3'
export const DAN_ROUND3_MODEL_VERSION = net3.version
export const DAN_ROUND3_CHECKPOINT_SHA256 = net3.checkpoint_sha256
export const DAN_PAIR_TABLE_VERSION = pairs.version
export const DAN_PAIR_SOURCE_SHA256 = pairs.sourceTableSha256
export const DAN_SEARCH_OPTIONS = Object.freeze({ minSamples: 128, maxSamples: 128, timeBudgetMs: 1e12, rollout: 'prep-lookahead' })
const scores = new Map(opening.cards.map(c => [c.card, c.score]))
const pairScores = new Map(pairs.pairs.map(p => [JSON.stringify([...p.cards].sort()), p.score]))
const round3 = createLearnedHandPolicy(net3)

export function chooseDanDecision(game, side = 'opponent', options = {}) {
  if (game.mode !== 'draft') throw Error('DanBot plays Draft only')
  const own = game[`${side}Hand`]
  // First actual pick, including second picker in a pack. Unknown expansion cards
  // use the existing search rather than an invented historical score.
  if (own.length === 0 && game.draftRow.every(c => scores.has(c.id))) {
    const values = game.draftRow.map(c => scores.get(c.id))
    const best = values.indexOf(Math.max(...values))
    return { action: { type: 'draft-pick', uid: game.draftRow[best].uid }, values, samples: 0,
      version: DAN_BOT_VERSION, stage: 'opening-ranking', labelSemantics: opening.semantics }
  }
  if (own.length === 1) {
    const values = game.draftRow.map(c => pairScores.get(JSON.stringify([own[0].id, c.id].sort())))
    // Wild/other rule pools can contain combinations outside the tested table.
    if (values.length && values.every(Number.isFinite)) {
      const chosenIndex = values.indexOf(Math.max(...values))
      return { action: { type: 'draft-pick', uid: game.draftRow[chosenIndex].uid }, values, chosenIndex, samples: 0,
        version: DAN_BOT_VERSION, stage: 'pair-ranking', pairTableVersion: DAN_PAIR_TABLE_VERSION, labelSemantics: pairs.semantics }
    }
  }
  if (own.length === 2 && round3.supports(game, side)) {
    return { ...round3.choose(game, side), version: DAN_BOT_VERSION }
  }
  return { ...searchDecision(game, side, { ...DAN_SEARCH_OPTIONS, ...options }), version: DAN_BOT_VERSION, stage: 'search' }
}
