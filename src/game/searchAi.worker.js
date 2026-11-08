// Runs Search AI decisions off the main thread so animations stay smooth.
import { searchDecision, searchSidePreparation } from './searchAi.js'
import { chooseDanDecision } from './danBot.js'
import { chooseFelixDecision } from './felixBot.js'
import { completeFastPreparation } from './fastPreparation.js'
import { chooseFelixNcSecretDecision } from './felixNcSecretBot.js'
import { chooseSvenTwentyLineup } from './svenTwentyCards.js'
import { completeTestingBotPreparation } from './testingBotPreparation.js'

self.onmessage = async (event) => {
  const { id, kind, game, side, options, preparation, bot } = event.data ?? {}
  try {
    if (kind === '20cards-lineup') {
      self.postMessage({ id, ok: true, action: chooseSvenTwentyLineup(event.data.pool, options) })
      return
    }
    if (kind === 'testing-preparation') {
      const result = completeTestingBotPreparation(preparation, game, side, bot, options)
      self.postMessage({ id, ok: true, preparation: result.preparation })
      return
    }
    if (kind === 'fast-preparation') {
      const result = await completeFastPreparation(preparation, game, side, options)
      self.postMessage({ id, ok: true, preparation: result.preparation })
      return
    }
    if (kind === 'preparation') {
      // Whole pre-battle preparation for one seat: every step is searched, then applied.
      const result = searchSidePreparation(preparation, game, side, options)
      self.postMessage({ id, ok: true, preparation: result.preparation, steps: result.steps })
      return
    }
    const result = bot === 'felix-nc-secret' ? chooseFelixNcSecretDecision(game, side)
      : bot === 'felix' ? chooseFelixDecision(game, side, options) : bot === 'dan' ? chooseDanDecision(game, side, options) : searchDecision(game, side, options)
    self.postMessage({
      id, ok: true, action: result.action, samples: result.samples, elapsedMs: result.elapsedMs,
    })
  } catch (error) {
    self.postMessage({ id, ok: false, error: String(error?.message ?? error) })
  }
}
