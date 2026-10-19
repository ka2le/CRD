import { getCoreCards, createSeededRng, shuffle } from './cards.js'
import { createPreparationState } from './preparationState.js'
import {
  HEADLESS_PROTOCOL_VERSION, HEADLESS_RULES_VERSION, encodeObservation,
  getLegalActions, stepHeadlessGame, chooseHeadlessBaselineAction,
} from './headlessGame.js'

export const SAMPLER_VERSION = 'uniform-feasible-random-private-prep-v1'
const PREPARATION_TYPES = new Set(['prepare', 'skip-preparation', 'finish-preparation'])
const otherSide = (side) => side === 'player' ? 'opponent' : 'player'

function sameObservation(left, right) {
  if (left === right) return true
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false
  if (Array.isArray(left) !== Array.isArray(right)) return false
  const keys = Object.keys(left)
  return keys.length === Object.keys(right).length
    && keys.every((key) => Object.hasOwn(right, key) && sameObservation(left[key], right[key]))
}

function ownHandBeforePreparation(observation) {
  const side = observation.side
  if (observation.mode === 'draft') {
    return observation.history.filter((event) => event.type === 'draft-pick' && event.side === side)
      .map((event) => event.card)
  }
  let hand = null
  let refill = []
  for (const event of observation.history) {
    const owner = event.side ?? event.scope
    if (owner !== side) continue
    if (event.type === 'opening-hand') hand = event.cards
    if (event.type === 'refill') refill = event.cards
    if (event.type === 'discard') {
      if (!hand) throw new Error('Missing opening-hand history')
      const discarded = new Set(event.cards.map((card) => card.uid))
      let index = 0
      hand = hand.map((card) => discarded.has(card.uid) ? (refill[index++] ?? card) : card)
      refill = []
    }
  }
  if (!hand) throw new Error('Missing own hand history')
  return hand
}

function knownUids(observation) {
  const seen = new Set()
  const cards = (items = []) => items.forEach((card) => seen.add(card.uid))
  for (const key of ['playerHand', 'opponentHand', 'draftRow', 'discardPile', 'recycleCards']) cards(observation[key])
  for (const event of observation.history) {
    cards(event.cards)
    cards(event.drawn)
    if (event.card) cards([event.card])
    if (event.target) cards([event.target])
    if (event.action?.sourceUid) seen.add(event.action.sourceUid)
  }
  return seen
}

function assertSpecification(spec) {
  if (spec?.protocolVersion !== HEADLESS_PROTOCOL_VERSION || spec.rulesVersion !== HEADLESS_RULES_VERSION) {
    throw new Error('Unsupported observation/spec version')
  }
  if (!Array.isArray(spec.poolCards) || new Set(spec.poolCards.map((card) => card.uid)).size !== spec.poolCards.length) {
    throw new Error('Sampling requires a unique public physical-card catalog')
  }
}

// Deliberately takes NO live state/session/episode seed. Everything comes from permitted
// information plus an independent planning RNG. This is a feasible-world approximation,
// not a policy-conditioned Bayesian posterior.
export function sampleHeadlessWorld(observation, spec, { seed = 1, maxAttempts = 128 } = {}) {
  assertSpecification(spec)
  if (!observation || observation.terminal || observation.actor !== observation.side) {
    throw new Error('Sampling requires a nonterminal observation at that seat\'s decision')
  }
  if (!Number.isSafeInteger(seed) || seed < 0 || !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 1000) {
    throw new Error('Invalid sampling seed/attempt budget')
  }
  const definitions = new Map(getCoreCards().map((card) => [card.id, card]))
  const poolByUid = new Map(spec.poolCards.map((card) => [card.uid, card]))
  const restore = (card) => {
    if (!card || !definitions.has(card.id) || typeof card.uid !== 'string' || !card.uid) {
      throw new Error('Unsupported observed card')
    }
    if (poolByUid.has(card.uid) && poolByUid.get(card.uid).id !== card.id) throw new Error('Card identity mismatch')
    return { ...definitions.get(card.id), uid: card.uid, imageIndex: 0 }
  }
  const side = observation.side
  const enemy = otherSide(side)
  const rng = createSeededRng(seed)
  const seen = knownUids(observation)
  const isPreparation = observation.phase === 'preparation'
  const priorActions = isPreparation ? observation.history.filter((event) => (
    event.scope === side && PREPARATION_TYPES.has(event.type)
  )) : []
  const reserved = priorActions.flatMap((event) => event.drawn ?? []).map(restore)
  const rootReadyHand = (isPreparation ? ownHandBeforePreparation(observation) : observation.playerHand).map(restore)
  const baseHistory = observation.history.filter((event) => !PREPARATION_TYPES.has(event.type))
  const discards = observation.history.filter((event) => event.type === 'discard')
  const publicDiscard = observation.discardPile.map(restore)
  const baseDecisions = {
    [side]: observation.steps - priorActions.length,
    [enemy]: baseHistory.filter((event) => event.side === enemy
      && (event.type === 'discard' || event.type === 'draft-pick')).length,
  }
  let lastFailure = 'No consistent world found'
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let unseen = shuffle(spec.poolCards.filter((card) => !seen.has(card.uid)).map(restore), { rng })
    const enemyHand = observation.opponentHand.length
      ? observation.opponentHand.map(restore) : unseen.splice(0, observation.opponentHandCount)
    if (enemyHand.length !== observation.opponentHandCount) throw new Error('Pool cannot supply the hidden hand')
    const hands = { [side]: rootReadyHand, [enemy]: enemyHand }
    const game = {
      mode: observation.mode, phase: isPreparation ? 'battle-ready' : observation.phase,
      playerHand: hands.player, opponentHand: hands.opponent,
      deck: [...reserved, ...unseen],
      draftRow: observation.draftRow.map(restore),
      packNumber: observation.packNumber, picksThisPack: observation.picksThisPack,
      firstPicker: observation.firstPicker, currentPicker: isPreparation ? null : observation.actor,
      pendingOpponentPickUid: null, recentMoves: [],
      playerDiscardsUsed: side === 'player' ? observation.playerDiscardsUsed : observation.opponentDiscardsUsed,
      opponentDiscardsUsed: side === 'opponent' ? observation.playerDiscardsUsed : observation.opponentDiscardsUsed,
      ...(observation.mode === 'draft' ? { draftDiscard: publicDiscard } : {
        playerDiscards: discards.flatMap((event) => event.cards).map(restore),
        opponentDiscards: discards.filter((event) => event.side === 'opponent').flatMap((event) => event.cards).map(restore),
      }),
    }
    let state = {
      config: {
        mode: observation.mode, wildDeck: observation.wildDeck, control: 'both',
        revealOpponent: observation.mode !== 'draft' && observation.opponentHand.length > 0,
      },
      game, history: structuredClone(isPreparation ? baseHistory : observation.history),
      decisions: { ...baseDecisions }, actor: isPreparation ? 'player' : observation.actor,
      preparation: isPreparation ? createPreparationState(game) : null,
      terminal: false, battleResult: null,
    }
    if (!isPreparation) {
      if (!sameObservation(encodeObservation(state, side), observation)) {
        throw new Error('Observation/history cannot reconstruct this hand-building state')
      }
      return { state, attempts: attempt }
    }
    try {
      // Withhold our historical draws while proposing the first seat's unobserved private
      // preparation. Their decision policy sees the proper original deck count, not this
      // withholding. Reject proposals that would consume reserved cards or contradict us.
      state.preparation = { ...state.preparation, deck: unseen }
      if (side === 'opponent') {
        let guard = 0
        while (state.actor === 'player') {
          if (++guard > 1000) throw new Error('Hidden preparation proposal exceeded guard')
          const legal = getLegalActions(state)
          const action = legal[Math.floor(rng() * legal.length)]
          const source = state.preparation.playerHand.find((card) => card.uid === action.sourceUid)
          const requested = action.type !== 'prepare' ? 0 : source?.id === 'draw_2_extra' ? 2
            : source?.id === 'draw_all_new_1' ? state.preparation.playerHand.length + 1 : 0
          if (reserved.length && requested > state.preparation.deck.length) throw new Error('Prior draw would consume reserved cards')
          state = stepHeadlessGame(state, action)
        }
      }
      unseen = state.preparation.deck
      state = { ...state, actor: side,
        preparation: { ...state.preparation, deck: [...reserved, ...unseen] } }
      for (const event of priorActions) {
        state = stepHeadlessGame(state, event.action)
        const generated = state.history.at(-1)
        if (!sameObservation(generated, event)) throw new Error('Known preparation outcome contradicts sampled world')
      }
      if (!sameObservation(encodeObservation(state, side), observation)) throw new Error('Sample does not reproduce the root observation')
      return { state, attempts: attempt }
    } catch (error) {
      lastFailure = error.message
    }
  }
  throw new Error(`Could not condition a hidden preparation world after ${maxAttempts} attempts: ${lastFailure}`)
}

function utility(state, side) {
  return state.battleResult.winner === 'tie' ? 0 : (state.battleResult.winner === side ? 1 : -1)
}

function standardError(values) {
  if (values.length < 2) return null
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance / values.length)
}

export function evaluateRolloutActions(observation, spec, {
  seed = 1, samples = 8, completionPolicy = 'heuristic', maxDecisions = 1000,
} = {}) {
  if (!Number.isSafeInteger(seed) || seed < 0) throw new Error('Invalid planning seed')
  if (!Number.isInteger(samples) || samples < 1 || samples > 256) throw new Error('samples must be in 1..256')
  if (!['heuristic', 'random'].includes(completionPolicy)) throw new Error('Unknown completion policy')
  if (!Number.isInteger(maxDecisions) || maxDecisions < 1 || maxDecisions > 10000) throw new Error('Invalid rollout decision guard')
  const seedRng = createSeededRng(seed)
  let results = null
  let baselineIndex = null
  let samplingAttempts = 0
  for (let sample = 0; sample < samples; sample++) {
    const worldSeed = Math.floor(seedRng() * 0x100000000)
    const policySeed = Math.floor(seedRng() * 0x100000000)
    const { state: root, attempts } = sampleHeadlessWorld(observation, spec, { seed: worldSeed })
    samplingAttempts += attempts
    const legal = getLegalActions(root)
    if (!results) {
      results = legal.map((action) => ({ action, outcomes: [] }))
      const baseline = chooseHeadlessBaselineAction(root)
      baselineIndex = legal.findIndex((action) => action.type === baseline.type
        && action.uid === baseline.uid && action.sourceUid === baseline.sourceUid
        && action.targetUid === baseline.targetUid
        && (action.type !== 'discard' || (action.selectedIds.length === baseline.selectedIds.length
          && action.selectedIds.every((uid) => baseline.selectedIds.includes(uid)))))
      if (baselineIndex < 0) throw new Error('Baseline policy did not select a legal root action')
    }
    if (JSON.stringify(legal) !== JSON.stringify(results.map((result) => result.action))) {
      throw new Error('Legal actions changed between information-consistent worlds')
    }
    for (let index = 0; index < legal.length; index++) {
      let state = stepHeadlessGame(root, legal[index])
      const rng = createSeededRng(policySeed)
      let decisions = 1
      while (!state.terminal) {
        if (++decisions > maxDecisions) throw new Error('Rollout exceeded decision guard; no outcome label generated')
        const actions = getLegalActions(state)
        const action = completionPolicy === 'heuristic' ? chooseHeadlessBaselineAction(state)
          : actions[Math.floor(rng() * actions.length)]
        state = stepHeadlessGame(state, action)
      }
      results[index].outcomes.push(utility(state, observation.side))
    }
  }
  const candidates = results.map(({ action, outcomes }) => ({
    action, value: outcomes.reduce((sum, result) => sum + result, 0) / samples,
    samples, standardError: standardError(outcomes),
    wins: outcomes.filter((value) => value === 1).length,
    draws: outcomes.filter((value) => value === 0).length,
    losses: outcomes.filter((value) => value === -1).length,
  }))
  const bestValue = Math.max(...candidates.map((candidate) => candidate.value))
  const bestIndices = candidates.flatMap((candidate, index) => candidate.value === bestValue ? [index] : [])
  const reference = results[bestIndices[0]].outcomes
  const baselineValue = candidates[baselineIndex].value
  const baselineOutcomes = results[baselineIndex].outcomes
  candidates.forEach((candidate, index) => {
    candidate.gapFromBest = bestValue - candidate.value
    candidate.pairedGapStandardError = standardError(reference.map((value, sample) => value - results[index].outcomes[sample]))
    candidate.deltaFromBaseline = candidate.value - baselineValue
    candidate.pairedDeltaStandardError = standardError(results[index].outcomes.map((value, sample) => value - baselineOutcomes[sample]))
  })
  return {
    samplerVersion: SAMPLER_VERSION, rulesVersion: HEADLESS_RULES_VERSION,
    completionPolicy, completionPolicyVersion: `${completionPolicy}-v1`,
    samples, samplingAttempts, simulations: samples * candidates.length,
    candidates, bestIndices, bestValue, baselineIndex, baselineValue,
    bestDeltaFromBaseline: bestValue - baselineValue,
    belief: 'Uniform feasible unseen cards; random hidden prior preparation conditioned on known outcomes. Not a policy-conditioned posterior.',
  }
}
