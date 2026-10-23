// David plans in a dedicated worker, using the adopted 128-point redraw profile.
// It has no Sven timeout and is terminated when the player changes game or mode.
export function requestDavidAction(game, { side = 'opponent', config = {}, signal, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    let worker
    const finish = (value, error) => {
      signal?.removeEventListener('abort', abort)
      worker?.terminate()
      if (error) reject(error)
      else resolve(value)
    }
    const abort = () => finish(null, new DOMException('Decision cancelled', 'AbortError'))
    if (signal?.aborted) { abort(); return }
    try {
      worker = new Worker(new URL('./davidBot.worker.js', import.meta.url), { type: 'module' })
      signal?.addEventListener('abort', abort, { once: true })
      worker.onmessage = ({ data }) => {
        if (data.kind === 'progress') onProgress?.(data)
        else if (data.kind === 'result') finish(data.action)
        else finish(null, new Error(data.error ?? 'DavidBot could not finish this turn.'))
      }
      worker.onerror = (event) => {
        event.preventDefault?.()
        finish(null, new Error('DavidBot could not finish this turn. Please retry.'))
      }
      worker.postMessage({ game, side, config })
    } catch (error) { finish(null, error) }
  })
}
