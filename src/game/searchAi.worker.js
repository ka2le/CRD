// Runs Search AI decisions off the main thread so animations stay smooth.
import { searchDecision, searchSidePreparation } from './searchAi.js'
import { chooseDanDecision } from './danBot.js'
import { completeFastPreparation } from './fastPreparation.js'

self.onmessage = async (event) => {
  const { id, kind, game, side, options, preparation, bot } = event.data ?? {}
  try {
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
    const result = bot === 'dan' ? chooseDanDecision(game, side, options) : searchDecision(game, side, options)
    self.postMessage({
      id, ok: true, action: result.action, samples: result.samples, elapsedMs: result.elapsedMs,
    })
  } catch (error) {
    self.postMessage({ id, ok: false, error: String(error?.message ?? error) })
  }
}
