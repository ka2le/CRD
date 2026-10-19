// Runs Search AI decisions off the main thread so animations stay smooth.
import { searchDecision, searchSidePreparation } from './searchAi.js'

self.onmessage = (event) => {
  const { id, kind, game, side, options, preparation } = event.data ?? {}
  try {
    if (kind === 'preparation') {
      // Whole pre-battle preparation for one seat: every step is searched, then applied.
      const result = searchSidePreparation(preparation, game, side, options)
      self.postMessage({ id, ok: true, preparation: result.preparation, steps: result.steps })
      return
    }
    const result = searchDecision(game, side, options)
    self.postMessage({
      id, ok: true, action: result.action, samples: result.samples, elapsedMs: result.elapsedMs,
    })
  } catch (error) {
    self.postMessage({ id, ok: false, error: String(error?.message ?? error) })
  }
}
