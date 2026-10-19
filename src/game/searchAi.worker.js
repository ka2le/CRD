// Runs Search AI decisions off the main thread so animations stay smooth.
import { searchDecision } from './searchAi.js'

self.onmessage = (event) => {
  const { id, game, side, options } = event.data ?? {}
  try {
    const result = searchDecision(game, side, options)
    self.postMessage({
      id, ok: true, action: result.action, samples: result.samples, elapsedMs: result.elapsedMs,
    })
  } catch (error) {
    self.postMessage({ id, ok: false, error: String(error?.message ?? error) })
  }
}
