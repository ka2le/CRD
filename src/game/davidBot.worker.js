import { searchDavidGame } from './davidBot.js'

self.onmessage = async ({ data }) => {
  const { game, side, config } = data
  try {
    const result = await searchDavidGame(game, side, config, {
      onProgress: (progress) => self.postMessage({ kind: 'progress', ...progress }),
    })
    self.postMessage({ kind: 'result', action: result.action })
  } catch (error) {
    self.postMessage({ kind: 'error', error: error.message })
  }
}
