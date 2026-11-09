const APP_BASE_URL = new URL('./', self.registration.scope)
const APP_SCOPE = APP_BASE_URL.pathname
const CACHE_PREFIX = `crd-pwa:${APP_SCOPE}:`
const CACHE_NAME = `${CACHE_PREFIX}__CRD_BUILD_VERSION__`
const APP_SHELL = APP_BASE_URL.href
// Filled by Vite after bundling, including AI workers, all art and all icons.
const PRECACHE_ASSETS = /* __CRD_PRECACHE__ */ []

async function removeOldCaches() {
  const names = await caches.keys()
  await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
    .map((name) => caches.delete(name)))
}

async function cleanAfterNavigation(event) {
  const clients = await self.clients.matchAll({ type: 'window' })
  const navigating = [event.clientId, event.replacesClientId, event.resultingClientId].filter(Boolean)
  if (!clients.some((client) => !navigating.includes(client.id))) await removeOldCaches()
}

function managesUpdates(client) {
  if (!client.postMessage) return Promise.resolve(false)
  return new Promise((resolve) => {
    const channel = new MessageChannel()
    const finish = (managed) => {
      clearTimeout(timeout)
      channel.port1.close()
      resolve(managed)
    }
    const timeout = setTimeout(() => finish(false), 1000)
    channel.port1.onmessage = (event) => finish(event.data === 'CRD_UPDATE_MANAGED')
    try { client.postMessage({ type: 'CRD_UPDATE_CHECK' }, [channel.port2]) }
    catch { finish(false) }
  })
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    // Installation is atomic: a partial download never replaces the usable app.
    await cache.addAll(PRECACHE_ASSETS.map((asset) => new Request(new URL(asset, APP_BASE_URL), { cache: 'reload' })))
    const shell = await cache.match(new URL('index.html', APP_BASE_URL))
    if (!shell) throw new Error('Offline app shell is missing')
    await cache.put(APP_SHELL, shell)
    // Existing pages keep running their loaded code. Retain their cached assets
    // below so an old AI worker can still start after this update activates.
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await self.clients.claim()
    const clients = await self.clients.matchAll({ type: 'window' })
    if (!clients.length) await removeOldCaches()
    // Upgrade older pages that have no update listener, including installations
    // predating automatic updates. Newer pages manage reloads without disrupting
    // an active game. The legacy migration also works at the ordinary app URL.
    const managed = await Promise.all(clients.map(managesUpdates))
    for (const [index, client] of clients.entries()) {
      if (managed[index]) continue
      const url = new URL(client.url)
      url.searchParams.delete('update')
      // Navigation can wait for activation; awaiting it here would deadlock.
      client.navigate(url.href).catch(() => {})
    }
  })())
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(APP_SCOPE)) return

  // Navigations use the latest completely installed build. Open pages may still
  // request their old content-hashed scripts/workers, including while offline.
  if (request.mode === 'navigate') event.waitUntil(cleanAfterNavigation(event))
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME)
    if (request.mode === 'navigate') return await cache.match(APP_SHELL) ?? fetch(request)
    // Module/CSS requests can carry a different Origin header from installation
    // fetches. These same-origin build assets are identical across that Vary.
    const cached = await cache.match(request, { ignoreVary: true })
    if (cached) return cached
    for (const name of (await caches.keys()).reverse()) {
      if (name === CACHE_NAME || !name.startsWith(CACHE_PREFIX)) continue
      const previous = await (await caches.open(name)).match(request, { ignoreVary: true })
      if (previous) return previous
    }
    return fetch(request)
  })())
})
