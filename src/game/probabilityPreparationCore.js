// Adaptive preparation sequences: max over actions, expectation over revealed draws.
// Never finishes a branch with a rollout policy or reads a real hidden deck order.
import { chooseBig, unrankCombination } from './preparationChance.js'

export function weightedDraws(deck, requested, limit = 16, exact = false) {
  const count = Math.min(deck.length, requested), total = chooseBig(deck.length, count)
  const all = exact || total <= BigInt(limit), points = all ? Number(total) : limit
  if (points > 100000) throw Error('Exact fixture draw space exceeds bounded test size')
  const groups = new Map()
  for (let i = 0; i < points; i++) {
    const rank = all ? BigInt(i) : BigInt(2 * i + 1) * total / BigInt(2 * points)
    const ids = unrankCombination(deck.length, count, rank).map(j => deck[j].id).sort()
    const key = JSON.stringify(ids)
    if (!groups.has(key)) groups.set(key, { ids, weight: 0 })
    groups.get(key).weight += 1 / points
  }
  return { outcomes: [...groups.values()], exact: all, points, count }
}

export function createProbabilityPreparation({ search, prep, rules, tt }) {
  const mechanics = c => JSON.stringify([c.id, c.stats, c.effect, c.tabletopAttackUnits ?? null, c.tabletop ?? null])
  const better = (a, b) => a.utility > b.utility + 1e-10 ||
    (Math.abs(a.utility - b.utility) <= 1e-10 && a.margin > b.margin + 1e-10)
  function choose(state, { chanceLimit = 16, exactChance = false, maxDepth = 8,
    maxNodes = 12000, timeBudgetMs = 250, trace = false, cache = true, discardAllBias = 0, discardAllAlreadyUsed = false, opponentModel = null } = {}) {
    if (!Number.isFinite(discardAllBias) || discardAllBias < 0 || discardAllBias > .2) throw Error("Bias must be in [0, .2]")
    const started = performance.now(), side = state.actor
    if (!state.preparation || !['draft', 'five-hand-discard'].includes(state.game.mode)) throw Error('Preparation required')
    const actions = prep.getPreparationActions(state.preparation, side)
    const v = search.preparationView(state.preparation, state.game, side)
    if (!v.enemyPublicHand && !opponentModel) throw Error('Private opponent requires public-information model')
    const metrics = { nodes: 0, actionEdges: 0, chanceEdges: 0, memoHits: 0, equivalentActions: 0,
      leafQueries: 0, leafCacheHits: 0, exactChanceNodes: 0, approximateChanceNodes: 0,
      scenarioCompletions: 0, rolloutSteps: 0 }
    const types = new Map(), codeCache = new WeakMap(), unknownCache = new WeakMap()
    const typeCode = c => {
      if (codeCache.has(c)) return codeCache.get(c)
      const key = mechanics(c)
      if (!types.has(key)) types.set(key, types.size)
      const code = types.get(key); codeCache.set(c, code); return code
    }
    for (const c of [...v.ownHand, ...v.ownDiscard, ...v.unseen, ...(v.enemyPublicHand ?? [])]) typeCode(c)
    const ids = [...new Set([...v.ownHand, ...v.ownDiscard, ...v.unseen, ...(v.enemyPublicHand ?? [])].map(c => c.id))].sort()
    const idIndex = new Map(ids.map((id, i) => [id, i]))
    const cardKey = (cs, used = []) => cs.map(c => 2 * typeCode(c) + Number(used.includes(c.uid))).sort((a,b)=>a-b).join(',')
    const unknownKey = deck => {
      if (unknownCache.has(deck)) return unknownCache.get(deck)
      const counts = new Array(ids.length).fill(0)
      for (const c of deck) counts[idIndex.get(c.id)]++
      const key = counts.join(','); unknownCache.set(deck, key); return key
    }
    const keyOf = (p, unknown) => cardKey(p.playerHand, p.playerActivated) + '/' +
      cardKey(p.playerDiscard, p.playerActivated) + '/' + unknownKey(unknown) + '/' + Number(p.playerFinished)
    const leafCache = new Map(), memo = new Map(), distributions = new Map(), traceEdges = []
    const root = prep.createPreparationState({ playerHand: v.ownHand, opponentHand: v.enemyPublicHand ?? [],
      playerDiscards: v.ownDiscard, opponentDiscards: v.enemyPublicPile, deck: [] })
    root.playerActivated = [...v.ownActivated]
    function leaf(p, usedDiscardAll) {
      const key = cardKey(p.playerHand) + '/' + Number(usedDiscardAll); metrics.leafQueries++
      if (cache && leafCache.has(key)) { metrics.leafCacheHits++; return leafCache.get(key) }
      let score
      if (opponentModel) score = opponentModel.evaluate(p.playerHand)
      else {
        const battle = tt.resolveTabletopBattle(p.playerHand, v.enemyPublicHand, {
          playerType: tt.chooseTabletopType(p.playerHand), opponentType: tt.chooseTabletopType(v.enemyPublicHand) })
        score = { reward: battle.winner === 'tie' ? 0 : battle.winner === 'player' ? 1 : -1,
          margin: battle.player.score - battle.opponent.score }
      }
      const value = { ...score, truncated: false }
      value.activationProbability = Number(usedDiscardAll)
      value.utility = value.reward + discardAllBias * value.activationProbability
      leafCache.set(key, value); return value
    }
    const abort = Symbol('budget')
    function check() {
      metrics.nodes++
      // Always complete the first root pass. Never publish an incomplete deeper root pass.
      if (depthPass > 1 && (metrics.nodes > maxNodes || performance.now() - started > timeBudgetMs)) throw abort
    }
    let frontier = 0, depthPass = 1
    function value(p, unknown, depth, usedDiscardAll) {
      check()
      if (p.playerFinished) return leaf(p, usedDiscardAll)
      const legal = prep.getPreparationActions(p, 'player')
      if (legal.length === 1) return leaf(p, usedDiscardAll)
      if (depth === 0) { frontier++; return { ...leaf(p, usedDiscardAll), truncated: true } }
      const key = keyOf(p, unknown) + ':' + depth + ':' + Number(usedDiscardAll)
      if (cache && memo.has(key)) { metrics.memoHits++; return memo.get(key) }
      let best = null, truncated = false
      for (const action of legal) {
        const current = actionValue(p, unknown, depth, action, usedDiscardAll)
        truncated ||= current.truncated
        if (!best || better(current, best)) best = current
      }
      const result = { ...best, truncated }
      if (cache) memo.set(key, result)
      return result
    }
    function actionValue(p, unknown, depth, action, usedDiscardAll) {
      metrics.actionEdges++
      const requested = action.type !== 'prepare' ? 0 : action.cardId === 'draw_2_extra' ? 2 :
        action.cardId === 'draw_all_new_1' ? p.playerHand.length + 1 : 0
      const distributionKey = unknownKey(unknown) + ':' + requested
      if (!distributions.has(distributionKey)) distributions.set(distributionKey, weightedDraws(unknown, requested, chanceLimit, exactChance))
      const distribution = distributions.get(distributionKey)
      if (requested) metrics[distribution.exact ? 'exactChanceNodes' : 'approximateChanceNodes']++
      const result = { reward: 0, margin: 0, activationProbability: 0, utility: 0, truncated: false }
      for (const outcome of distribution.outcomes) {
        const remaining = [...unknown], drawn = []
        for (const id of outcome.ids) {
          const i = remaining.findIndex(c => c.id === id)
          if (i < 0) throw Error('Infeasible draw')
          drawn.push(remaining.splice(i, 1)[0])
        }
        const next = prep.applyPreparationAction({ ...p, deck: drawn }, 'player', action)
        assertConsumed(next)
        // Max occurs AFTER revealed cards are incorporated, not before the expectation.
        const child = value(next, remaining, depth - 1, usedDiscardAll ||
          (action.type === 'prepare' && action.cardId === 'draw_all_new_1'))
        result.reward += outcome.weight * child.reward
        result.margin += outcome.weight * child.margin
        result.activationProbability += outcome.weight * child.activationProbability
        result.utility += outcome.weight * child.utility
        result.truncated ||= child.truncated
        metrics.chanceEdges++
        if (trace && traceEdges.length < 20000) traceEdges.push({ depthPass, depth, action, drawn: outcome.ids,
          probability: outcome.weight, own: next.playerHand.map(c => c.id), remaining: remaining.map(c => c.id), child })
      }
      return result
    }
    function assertConsumed(p) {
      if (p.deck.length !== 0) throw Error('Root effect failed to consume its provided immediate draw')
    }
    const baseline = rules.pickPreparationAction(state.preparation, side)
    const baselineIndex = Math.max(0, actions.findIndex(a => JSON.stringify(a) === JSON.stringify(baseline)))
    let selected = null, completedDepth = 0, finishedTree = false, budgetHit = false
    const iterations = []
    const rootStates = actions.map(action => JSON.stringify(action))
    for (depthPass = 1; depthPass <= maxDepth; depthPass++) {
      frontier = 0
      try {
        const values = actions.map(action => actionValue(root, v.unseen, depthPass, action, discardAllAlreadyUsed))
        let chosenIndex = baselineIndex
        values.forEach((current, i) => { if (better(current, values[chosenIndex])) chosenIndex = i })
        selected = { values, chosenIndex, action: actions[chosenIndex] }; completedDepth = depthPass
        iterations.push({ depth: depthPass, frontier, nodes: metrics.nodes, elapsedMs: performance.now() - started })
        if (!values.some(v => v.truncated)) { finishedTree = true; break }
      } catch (error) { if (error !== abort) throw error; budgetHit = true; break }
    }
    if (!selected || rootStates.length !== selected.values.length) throw Error('Incomplete root coverage')
    return { ...selected, baselineIndex, completedDepth, finishedTree, budgetHit, iterations, metrics,
      elapsedMs: performance.now() - started, version: 'david-preparation-adaptive-probability-v1', discardAllBias, discardAllAlreadyUsed,
      leafModel: opponentModel?.id ?? 'Expected W/D/L versus public raw opposing hand; expected native score margin breaks equal values',
      chanceLimit, exactChance, ...(trace ? { trace: traceEdges } : {}) }
  }
  return { choose }
}
