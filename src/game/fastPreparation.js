// Shared actual preparation for Dan Draft and David Discard. The action/chance
// tree is the frozen research resolver; only its dependency/worker boundary changes.
import * as search from './searchAi.js'
import * as prep from './preparationState.js'
import * as rules from './preBattle.js'
import * as tt from './tabletop.js'
import * as cards from './cards.js'
import { createProbabilityPreparation } from './probabilityPreparationCore.js'
import { createOpponentScoreEvaluator } from './davidOpponentScores.js'
import { compileCombatCycle, compareCombatCycles } from './davidCombat.js'
import sourcePool from '../../data/david-opponents.json' with { type: 'json' }
import { supportsOpponentFirst } from './opponentFirstPreparation.js'
import { chooseTwoOrderPreparation } from './twoOrderPreparation.js'

export const FAST_PREPARATION_VERSION = 'david-preparation-adaptive-probability-unbiased-v2'
export const FAST_PREPARATION_PROFILE = Object.freeze({ chanceLimit: 16, maxDepth: 8, maxNodes: 12000,
  timeBudgetMs: 1e12, discardAllBias: 0 })
const core = createProbabilityPreparation({ search, prep, rules, tt })
const sourceIds = cards.getCoreCards({ tabletop: 'abilities-main' }).map(c => c.id)

function settings(state) {
  const marked = [...state.preparation.playerHand, ...state.preparation.opponentHand, ...state.preparation.deck].find(c => c.tabletop)
  return { tabletop: tt.normalizeTabletopRules(state.config?.tabletop ?? marked?.tabletop) }
}

export async function preparationOpponentModel(state) {
  const { tabletop } = settings(state), v = search.preparationView(state.preparation, state.game, state.actor)
  // Battle Draft uses the same sequence tree with the official digital outcome.
  if (state.game.mode === 'draft') {
    if (tabletop) return null
    const enemy = compileCombatCycle(v.enemyPublicHand)
    return { id: 'public-raw-opponent-digital-21-50', evaluate(hand) {
      return { reward: compareCombatCycles(compileCombatCycle(hand), enemy), margin: 0 }
    } }
  }
  const definitions = cards.getCoreCards({ tabletop }).map(c => tabletop ? tt.toTabletopCard(c, tabletop) : c)
  const ids = definitions.map(c => c.id), byId = new Map(definitions.map(c => [c.id, c]))
  const counts = ids.map(id => v.unseen.filter(c => c.id === id).length)
  const compatible = sourcePool.entries.filter(e => e.prepared.every(c => byId.has(c.id)) &&
    e.rawCounts.every((n, i) => n <= (counts[ids.indexOf(sourceIds[i])] ?? 0)))
  if (!compatible.length) throw Error('No public-compatible empirical preparation opponents')
  const key = JSON.stringify([v.ownHand.map(c => [c.id, c.uid]), v.ownDiscard.map(c => [c.id, c.uid]), counts, v.ownActivated])
  const hash = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))
  const seed = new DataView(hash).getUint32(0, false)
  const shuffled = cards.shuffle(compatible, { rng: cards.createSeededRng(seed ^ 0x563812) })
  const selected = [], families = new Set()
  for (const e of shuffled) if (!families.has(e.family)) { selected.push(e); families.add(e.family); if (selected.length === 50) break }
  for (const e of shuffled) if (selected.length < 50 && !selected.includes(e)) selected.push(e)
  while (selected.length < 50) selected.push(shuffled[selected.length % shuffled.length])
  const enemies = selected.map(e => {
    const hand = e.prepared.map(c => ({ ...byId.get(c.id), uid: c.uid,
      ...(c.isCopiedCard ? { isCopiedCard: true, copySourceCardId: c.copySourceCardId } : {}) }))
    return tabletop ? { hand, type: tt.chooseTabletopType(hand), shields: tt.getTabletopProfile(hand).shields } :
      { hand, cycle: compileCombatCycle(hand) }
  })
  const evaluator = tabletop ? createOpponentScoreEvaluator(tt, enemies) : null, groups = new Map()
  if (tabletop) for (const e of enemies) {
    if (!groups.has(e.shields)) groups.set(e.shields, { enemies: [], means: new Map() })
    groups.get(e.shields).enemies.push(e)
  }
  return {
    id: tabletop === 'abilities-main' ? 'public-compatible-empirical50-prepared-opponent-cdf-current-v10' :
      `public-compatible-empirical50-prepared-opponent-${tabletop || 'digital-21-50'}`,
    evaluate(hand) {
      if (!tabletop) {
        const cycle = compileCombatCycle(hand)
        return { reward: enemies.reduce((n, e) => n + compareCombatCycles(cycle, e.cycle), 0) / enemies.length, margin: 0 }
      }
      const reward = evaluator.evaluate(hand), type = tt.chooseTabletopType(hand), ownShield = tt.getTabletopProfile(hand).shields
      let margin = 0
      for (const [shield, group] of groups) {
        if (!group.means.has(ownShield)) group.means.set(ownShield, group.enemies.reduce((n, e) => n + tt.scoreTabletopHand(e.hand, ownShield, e.type).score, 0))
        margin += tt.scoreTabletopHand(hand, shield, type).score * group.enemies.length - group.means.get(ownShield)
      }
      return { reward, margin: margin / enemies.length }
    },
    audit: { count: 50, eligible: compatible.length, sourceFamilies: [...families], sourceEntries: selected.map(e => [e.family, e.side]),
      conditioning: 'Root known physical cards; independent empirical prepared-hand prior, not a full posterior after each hypothetical draw.' }
  }
}

export async function chooseFastPreparation(state, options = {}) {
  if (supportsOpponentFirst(state.game)) return chooseTwoOrderPreparation(state, options)
  // Once credited, DiscardAll cannot gain another bonus on a later real action.
  const used = Boolean(state.history?.some(e => e.side === state.actor && e.action?.type === 'prepare' && e.action.cardId === 'draw_all_new_1') ||
    state.preparation[`${state.actor}Discard`]?.some(c => c.id === 'draw_all_new_1' &&
    state.preparation[`${state.actor}Activated`]?.includes(c.uid)))
  const model = await preparationOpponentModel(state)
  const result = core.choose(state, { ...FAST_PREPARATION_PROFILE, discardAllAlreadyUsed: used, ...options, opponentModel: model })
  return { ...result, version: FAST_PREPARATION_VERSION, ...(model?.audit ? { opponentPrior: model.audit } : {}) }
}

export async function completeFastPreparation(preparation, game, side = 'opponent', options = {}) {
  let current = preparation, used = false
  const steps = []
  for (let guard = 0; guard < 64 && !current[`${side}Finished`]; guard++) {
    const result = await chooseFastPreparation({ preparation: current, game, actor: side },
      { ...options, discardAllAlreadyUsed: used })
    steps.push(result)
    used ||= result.action.type === 'prepare' && result.action.cardId === 'draw_all_new_1'
    current = prep.applyPreparationAction(current, side, result.action)
  }
  if (!current[`${side}Finished`]) throw Error('Preparation exceeded action limit')
  return { preparation: current, steps }
}
