import { getExpandedCoreDeck } from './cards.js'
import * as search from './searchAi.js'
import * as prep from './preparationState.js'
import * as rules from './preBattle.js'
import * as tt from './tabletop.js'
import { createProbabilityPreparation } from './probabilityPreparationCore.js'

const native = createProbabilityPreparation({ search, prep, rules, tt })
const otherSide = side => side === 'player' ? 'opponent' : 'player'

// Build the unknown pool from the public recipe and the actor's own knowledge.
// Never inspect the actual draw deck, enemy secret, enemy twenty-card pool,
// reserved lanes, or the enemy's private preparation/discards.
export function testingPreparationObservation(preparation, game, side) {
  const enemy = otherSide(side)
  const ownPool = game.mode === '20cards' ? game[`${side}Pool`] : game[`${side}Hand`]
  const config = game.poolOptions ?? { tabletop: ownPool.find(card => card.tabletop)?.tabletop ?? false }
  const visibleEnemy = game.secretCard ? game[`${enemy}Hand`].filter(card => !card.secret) : []
  const publicPile = game.secretCard ? game.draftDiscard : []
  const known = new Set([...ownPool, ...(game[`${side}SeenCards`] ?? []), ...(game.revealedCards ?? []),
    ...preparation[`${side}Hand`], ...preparation[`${side}Discard`], ...visibleEnemy, ...publicPile]
    .flatMap(card => [card.uid, card.sourceCopyUid].filter(Boolean)))
  const unknown = getExpandedCoreDeck(config).filter(card => !known.has(card.uid))
  const mode = game.secretCard ? 'draft' : 'five-hand-discard'
  const publicGame = { mode, phase: 'battle-ready', [`${side}Hand`]: preparation[`${side}Hand`],
    [`${enemy}Hand`]: game.secretCard ? visibleEnemy : Array(5).fill(null),
    draftDiscard: publicPile, playerDiscards: [], opponentDiscards: [], deck: unknown }
  const publicPreparation = { ...prep.createPreparationState({ playerHand: [], opponentHand: [], deck: unknown }),
    [`${side}Hand`]: preparation[`${side}Hand`], [`${side}Discard`]: preparation[`${side}Discard`],
    [`${side}Activated`]: preparation[`${side}Activated`], [`${side}PendingDiscard`]: preparation[`${side}PendingDiscard`],
    [`${enemy}Hand`]: visibleEnemy, [`${enemy}Discard`]: publicPile }
  return { game: publicGame, preparation: publicPreparation, actor: side, config }
}

export function chooseTestingBotPreparationAction(preparation, game, side, bot, options = {}) {
  const legal = prep.getPreparationActions(preparation, side)
  if (legal.length === 1) return legal[0]
  const observation = testingPreparationObservation(preparation, game, side)
  return bot === 'felix-nc-secret'
    ? native.choose(observation, { chanceLimit: 16, maxNodes: 12000, maxDepth: 8, timeBudgetMs: 1e12, ...options }).action
    : search.searchPreparationDecision(observation.preparation, observation.game, side,
      { minSamples: 16, maxSamples: 96, timeBudgetMs: 250, ...options }).action
}

export function completeTestingBotPreparation(preparation, game, side, bot, options = {}) {
  let current = preparation
  for (let step = 0; step < 64 && !current[`${side}Finished`]; step++) {
    const action = chooseTestingBotPreparationAction(current, game, side, bot, { ...options,
      ...(Number.isSafeInteger(options.seed) ? { seed: options.seed + step * 7919 } : {}) })
    // Only the selected legal action is applied to the real shared draw deck.
    current = prep.applyPreparationAction(current, side, action)
  }
  if (!current[`${side}Finished`]) throw Error('Testing bot preparation exceeded action limit')
  return { preparation: current }
}
