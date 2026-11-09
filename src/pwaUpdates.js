let updateAvailable = false
const listeners = new Set()

export const getAppUpdate = () => updateAvailable
export function subscribeAppUpdate(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export function reloadApp() { window.location.reload() }

export function startAppUpdates() {
  if (!('serviceWorker' in navigator)) return
  const workers = navigator.serviceWorker
  let controlled = Boolean(workers.controller)
  let interacted = false
  let reloading = false
  let registration
  let lastCheck = 0

  // A fresh navigation can reload automatically; an active game waits for its
  // player to choose Update game or refresh normally.
  const markInteraction = () => { interacted = true }
  window.addEventListener('pointerdown', markInteraction, { once: true, capture: true })
  window.addEventListener('keydown', markInteraction, { once: true, capture: true })
  workers.addEventListener('message', (event) => {
    if (event.data?.type === 'CRD_UPDATE_CHECK') event.ports[0]?.postMessage('CRD_UPDATE_MANAGED')
  })
  workers.addEventListener('controllerchange', () => {
    // First installation already has the current page; it needs no reload.
    if (!controlled) { controlled = true; return }
    if (reloading) return
    if (!interacted) {
      reloading = true
      reloadApp()
    } else {
      updateAvailable = true
      listeners.forEach((listener) => listener())
    }
  })

  async function checkForUpdate() {
    if (!registration || document.visibilityState === 'hidden' || Date.now() - lastCheck < 60000) return
    lastCheck = Date.now()
    try { await registration.update() } catch { /* Keep the installed game usable offline. */ }
  }
  window.addEventListener('focus', checkForUpdate)
  document.addEventListener('visibilitychange', checkForUpdate)
  async function register() {
    try {
      registration = await workers.register(`${import.meta.env.BASE_URL}service-worker.js`, {
        scope: import.meta.env.BASE_URL,
        updateViaCache: 'none',
      })
      lastCheck = Date.now()
    } catch (error) {
      console.error('CRD service worker registration failed:', error)
    }
  }
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
}
