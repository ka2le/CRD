import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createDraftGame, applyDraftPick, resolveOpponentDraftPick, commitDraftDiscard, revealNextDraftPack } from '../src/game/draftMode.js'
import { createTwentyCardsGame, chooseBotLineup } from '../src/game/twentyCards.js'
import { getExpandedCoreDeck, createSeededRng } from '../src/game/cards.js'
import { createPreparationState, getPreparationActions, applyPreparationAction } from '../src/game/preparationState.js'
import { chooseFelixNcDecision, FELIX_NC_CHECKPOINT_SHA256 } from '../src/game/felixNcBot.js'
import { chooseFelixNcSecretDecision } from '../src/game/felixNcSecretBot.js'
import { chooseSvenTwentyLineup, strongestDisjointPair, scoreTwentyCardsHand } from '../src/game/svenTwentyCards.js'
import { testingPreparationObservation, chooseTestingBotPreparationAction, completeTestingBotPreparation } from '../src/game/testingBotPreparation.js'
import { getOpponentAiOptions, normalizeOpponentSettings, getOpponentAiName,
  requestOpponentSearchAction, requestOpponentPreparation, requestOpponentLineup } from '../src/game/opponentAi.js'

let vite, sessionApi
before(async () => {
  vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  sessionApi = await vite.ssrLoadModule('/src/hooks/useGameSession.js')
})
after(async () => { await vite?.close() })

test('FelixNCSecret opening is exactly the existing actor-first FelixNC call, with the same frozen checkpoint', async () => {
  let game = createDraftGame({ tabletop: 'abilities-new-cards', secretCard: true, seed: 472 })
  game = applyDraftPick(game, game.draftRow[0].uid)
  const expected = chooseFelixNcDecision({ mode: 'draft', playerHand: [], opponentHand: [], draftRow: game.draftRow })
  const actual = chooseFelixNcSecretDecision(game)
  assert.deepEqual(actual.values, expected.values)
  assert.deepEqual(actual.action, expected.action)
  assert.equal(actual.predictions, 20)
  assert.equal(actual.checkpointSha256, FELIX_NC_CHECKPOINT_SHA256)
  assert.equal(actual.checkpointSha256, 'e9b03e264b3e486fa93fb8f7a084a62b683540d405c7a57bcf8ce85d632958af')
  assert.deepEqual(await requestOpponentSearchAction(game, 'felix-nc-secret'), actual.action)
  Object.defineProperty(game, 'playerHand', { get() { throw Error('opening looked at rival private cards') } })
  assert.deepEqual(chooseFelixNcSecretDecision(game).values, actual.values)
})

test('FelixNCSecret keeps its extra card on all picks and never reads the rival secret or hidden deck', () => {
  const stages = new Set()
  for (const firstPicker of ['player', 'opponent']) {
    let game = createDraftGame({ tabletop: 'abilities-new-cards', secretCard: true, seed: 42, firstPicker })
    for (let guard = 0; game.phase !== 'battle-ready' && guard < 80; guard++) {
      if (['draft-player-pick', 'draft-opponent-thinking'].includes(game.phase)) {
        const side = game.currentPicker, enemy = side === 'player' ? 'opponent' : 'player'
        const result = chooseFelixNcSecretDecision(game, side)
        stages.add(game[`${side}Hand`].length + 1)
        assert(result.values.every(Number.isFinite))
        const hidden = { ...game }
        Object.defineProperty(hidden, 'deck', { get() { throw Error('read hidden deck') } })
        if (!game.secretOpening) {
          const secret = { secret: true }
          Object.defineProperty(secret, 'id', { get() { throw Error('read secret identity') } })
          hidden[`${enemy}Hand`] = [secret, ...game[`${enemy}Hand`].filter(card => !card.secret)]
          const blank = { id: '__zero__', uid: '__zero__', tabletop: 'abilities-new-cards', felixEffects: Array(16).fill(0) }
          const reference = chooseFelixNcDecision({ mode: 'draft', draftRow: game.draftRow,
            [`${side}Hand`]: game[`${side}Hand`], [`${enemy}Hand`]: [...game[`${enemy}Hand`].filter(card => !card.secret), blank] }, side)
          assert.deepEqual(result.values, reference.values)
        }
        assert.deepEqual(chooseFelixNcSecretDecision(hidden, side).values, result.values)
        game = side === 'player' ? applyDraftPick(game, result.action.uid)
          : resolveOpponentDraftPick({ ...game, pendingOpponentPickUid: result.action.uid })
      } else if (game.phase === 'draft-pack-clearing') game = commitDraftDiscard(game)
      else game = revealNextDraftPack(game)
    }
    assert.equal(game.phase, 'battle-ready')
  }
  assert.deepEqual([...stages].sort(), [1, 2, 3, 4, 5])
})

test('Sven subset optimization matches an independent exhaustive disjoint-pair search', () => {
  const rng = createSeededRng(8)
  for (let fixture = 0; fixture < 8; fixture++) {
    const candidates = []
    for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) candidates.push({ mask: (1 << a) | (1 << b), score: Math.floor(rng() * 30) })
    let floor = -Infinity, total = -Infinity
    for (let i = 0; i < candidates.length; i++) for (let j = i + 1; j < candidates.length; j++) {
      if (candidates[i].mask & candidates[j].mask) continue
      const low = Math.min(candidates[i].score, candidates[j].score), sum = candidates[i].score + candidates[j].score
      if (low > floor || (low === floor && sum > total)) { floor = low; total = sum }
    }
    const actual = strongestDisjointPair(candidates, 6)
    assert.equal(actual.floor, floor); assert.equal(actual.total, total)
    assert.equal(candidates[actual.pair[0]].mask & candidates[actual.pair[1]].mask, 0)
  }
})

test('Sven20Cards evaluates all 15504 combinations, uses fifteen own cards and randomizes only lane order', async () => {
  const game = createTwentyCardsGame({ tabletop: 'abilities-new-cards', seed: 42 })
  const before = JSON.stringify(game.opponentPool)
  const first = chooseSvenTwentyLineup(game.opponentPool, { rng: () => 0 })
  const second = chooseSvenTwentyLineup([...game.opponentPool].reverse(), { rng: () => .999 })
  const hands = result => [0, 1, 2].map(i => result.lineup.slice(5 * i, 5 * i + 5).join(',')).sort()
  assert.equal(first.combinations, 15504)
  assert.equal(new Set(first.lineup).size, 15)
  assert(first.lineup.every(uid => game.opponentPool.some(card => card.uid === uid)))
  assert.deepEqual(hands(first), hands(second)); assert.notDeepEqual(first.lineup, second.lineup)
  first.scores.forEach((score, i) => assert.equal(score, scoreTwentyCardsHand(first.lineup.slice(i * 5, i * 5 + 5).map(uid => game.opponentPool.find(card => card.uid === uid)))))
  const top = [...first.scores].sort((a, b) => b - a)
  assert.equal(top[1], first.strongPairFloor)
  assert.equal(top[0] + top[1], first.strongPairTotal)
  assert.equal(JSON.stringify(game.opponentPool), before)
  assert.equal((await requestOpponentLineup(game.opponentPool, { seed: 52 })).length, 15)
})

test('new opponents appear only in their supported menu contexts and survive stored settings', () => {
  assert.deepEqual(getOpponentAiOptions('draft', 'abilities-new-cards', { secretCard: true }).map(option => option.id), ['rules', 'felix-nc-secret'])
  assert.deepEqual(getOpponentAiOptions('draft', 'monsters', { secretCard: true }).map(option => option.id), ['rules'])
  assert.deepEqual(getOpponentAiOptions('20cards', 'monsters').map(option => option.id), ['rules', 'sven-20cards'])
  assert(!getOpponentAiOptions('draft', 'abilities-new-cards').some(option => option.id === 'felix-nc-secret'))
  let settings = normalizeOpponentSettings({ gameMode: 'draft', tabletop: 'abilities-new-cards', opponentAi: 'felix' }, { secretCard: true })
  assert.equal(settings.opponentAi, 'felix-nc-secret')
  assert.equal(normalizeOpponentSettings(JSON.parse(JSON.stringify(settings))).opponentAi, 'felix-nc-secret')
  assert.equal(normalizeOpponentSettings(settings, { secretCard: false }).opponentAi, 'felix')
  settings = sessionApi.normalizePlaySettings({ ...settings, testing: true }, { gameMode: '20cards' })
  assert.equal(settings.opponentAi, 'sven-20cards')
  assert.equal(sessionApi.normalizePlaySettings(settings, { testing: false }).opponentAi, 'search')
  const discard = normalizeOpponentSettings({ gameMode: 'draft', tabletop: 'abilities-new-cards', opponentAi: 'felix' }, { gameMode: 'five-hand-discard' })
  assert.equal(normalizeOpponentSettings(discard, { gameMode: '20cards' }).opponentAi, 'sven-20cards')
  assert.equal(getOpponentAiName('felix-nc-secret'), getOpponentAiName('felix'))
  assert.equal(getOpponentAiName('sven-20cards'), getOpponentAiName('search'))
})

test('lineup locking waits for Sven, rejects stale/invalid replies, then prepares the selected lane', () => {
  const game = createTwentyCardsGame({ tabletop: 'abilities-new-cards', seed: 5 })
  const state = { game: { ...game, playerLineup: chooseBotLineup(game.playerPool) }, preBattle: createPreparationState(game),
    settings: { opponentAi: 'sven-20cards' }, dealId: 6 }
  const locked = sessionApi.sessionReducer(state, { type: 'LOCK_LINEUP' })
  assert(locked.game.playerLocked); assert(!locked.game.opponentLocked)
  assert.equal(locked.game.phase, 'lineup')
  const lineup = chooseSvenTwentyLineup(game.opponentPool, { seed: 3 }).lineup
  const decisionKey = sessionApi.getOpponentDecisionKey(6, game)
  assert.equal(sessionApi.sessionReducer(locked, { type: 'SET_OPPONENT_LINEUP', lineup, decisionKey: 'old' }), locked)
  assert.equal(sessionApi.sessionReducer(locked, { type: 'SET_OPPONENT_LINEUP', lineup: Array(15).fill(lineup[0]), decisionKey }), locked)
  const ready = sessionApi.sessionReducer(locked, { type: 'SET_OPPONENT_LINEUP', lineup, decisionKey })
  assert.equal(ready.game.phase, 'battle-ready')
  assert.deepEqual(ready.preBattle.opponentHand.map(card => card.uid), lineup.slice(0, 5))
})

test('preparation observations use only the public recipe, actor knowledge and previous public reveals', () => {
  const game = createTwentyCardsGame({ tabletop: 'abilities-new-cards', seed: 42 })
  game.opponentHand = game.opponentPool.slice(0, 5)
  const preparation = createPreparationState(game)
  const expected = testingPreparationObservation(preparation, game, 'opponent')
  const privateGame = { ...game }, privatePrep = { ...preparation }
  for (const field of ['deck', 'playerPool', 'playerHand', 'playerLineup', 'playerSeenCards']) Object.defineProperty(privateGame, field, { get() { throw Error('read private ' + field) } })
  for (const field of ['deck', 'playerHand', 'playerDiscard', 'playerActivated']) Object.defineProperty(privatePrep, field, { get() { throw Error('read private preparation ' + field) } })
  assert.deepEqual(testingPreparationObservation(privatePrep, privateGame, 'opponent'), expected)
  assert(expected.preparation.deck.every(card => !game.opponentPool.some(own => own.uid === card.uid)))
  const seen = expected.preparation.deck[0]
  game.opponentSeenCards = [seen]
  assert(!testingPreparationObservation(preparation, game, 'opponent').preparation.deck.some(card => card.uid === seen.uid))
})

test('FelixNCSecret and Sven20Cards choose private-invariant legal preparation and finish mandatory effects', async () => {
  const deck = getExpandedCoreDeck({ tabletop: 'abilities-new-cards' })
  const take = id => deck.find(card => card.id === id)
  const ownHand = ['robot1', 'robot_attack', 'draw_2_discard_2'].map(take)
  for (const bot of ['felix-nc-secret', 'sven-20cards']) {
    const game = { mode: bot === 'felix-nc-secret' ? 'draft' : '20cards', secretCard: bot === 'felix-nc-secret',
      poolOptions: { tabletop: 'abilities-new-cards', wildDeck: false },
      opponentHand: ownHand, opponentPool: ownHand, playerHand: [{ ...take('dragon1'), secret: true }], draftDiscard: [] }
    let preparation = createPreparationState({ ...game, deck: ['critter1', 'shield2'].map(take) })
    preparation = applyPreparationAction(preparation, 'opponent', { type: 'prepare', sourceUid: take('draw_2_discard_2').uid })
    assert.equal(preparation.opponentPendingDiscard.remaining, 2)
    const options = { seed: 18, minSamples: 2, maxSamples: 2, timeBudgetMs: 1e12, maxDepth: 2, chanceLimit: 2 }
    const action = chooseTestingBotPreparationAction(preparation, game, 'opponent', bot, options)
    const changed = { ...game, playerHand: [{ ...take('devour'), secret: true }], playerPool: deck.slice(20, 40), playerLineup: [] }
    assert.deepEqual(chooseTestingBotPreparationAction({ ...preparation, playerHand: [take('devour')], deck: [...preparation.deck].reverse() }, changed, 'opponent', bot, options), action)
    assert(getPreparationActions(preparation, 'opponent').some(legal => JSON.stringify(legal) === JSON.stringify(action)))
    const result = completeTestingBotPreparation(preparation, game, 'opponent', bot, options).preparation
    assert(result.opponentFinished); assert.equal(result.opponentPendingDiscard, null)
    const patch = await requestOpponentPreparation(preparation, game, bot)
    assert(patch.opponentFinished); assert.equal(patch.opponentPendingDiscard, null)
  }
})

test('Sven20Cards supports digital and Monster pools without changing the five-card lane size', () => {
  for (const tabletop of [false, 'monsters']) {
    const game = createTwentyCardsGame({ tabletop, seed: 88 })
    const result = chooseSvenTwentyLineup(game.opponentPool, { seed: 6 })
    assert.equal(result.lineup.length, 15)
    assert.equal(new Set(result.lineup).size, 15)
    assert(result.scores.every(Number.isFinite))
    const prep = createPreparationState({ ...game, opponentHand: result.lineup.slice(0, 5).map(uid => game.opponentPool.find(card => card.uid === uid)) })
    const observation = testingPreparationObservation(prep, game, 'opponent')
    assert.equal(observation.game.playerHand.length, 5)
    assert.equal(observation.config.tabletop, tabletop)
  }
})

test('worker messages omit enemy secrets and opponent lineups/pools', async () => {
  const originalWorker = globalThis.Worker, messages = []
  globalThis.Worker = class {
    postMessage(message) {
      messages.push(message)
      const action = message.kind === '20cards-lineup' ? { lineup: message.pool.slice(0, 15).map(card => card.uid) }
        : { uid: message.game?.draftRow?.[0].uid }
      this.onmessage({ data: { id: message.id, ok: true, action,
        ...(message.kind === 'testing-preparation' ? { preparation: { ...message.preparation, opponentFinished: true } } : {}) } })
    }
  }
  try {
    let secret = createDraftGame({ tabletop: 'abilities-new-cards', secretCard: true, seed: 4 })
    secret = applyDraftPick(secret, secret.draftRow[0].uid)
    await requestOpponentSearchAction(secret, 'felix-nc-secret')
    assert.equal(messages.at(-1).game.playerHand.length, 0)
    assert.equal(messages.at(-1).game.playerSecretPack, undefined)
    const game = createTwentyCardsGame({ tabletop: 'abilities-new-cards', seed: 4 })
    await requestOpponentLineup(game.opponentPool, { seed: 1 })
    assert.equal(messages.at(-1).game, undefined)
    assert.deepEqual(messages.at(-1).pool, game.opponentPool)
    await requestOpponentPreparation(createPreparationState(game), game, 'sven-20cards')
    const message = messages.at(-1)
    assert.equal(message.game.playerPool, undefined); assert.equal(message.game.playerLineup, undefined)
    assert.equal(message.game.opponentLineup, undefined); assert.equal(message.preparation.playerHand.length, 0)
  } finally { globalThis.Worker = originalWorker }
})
