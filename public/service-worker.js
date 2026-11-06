const APP_BASE_URL = new URL('./', self.registration.scope)
const APP_SCOPE = APP_BASE_URL.pathname
const CACHE_PREFIX = `crd-pwa:${APP_SCOPE}:`
const CACHE_NAME = `${CACHE_PREFIX}__CRD_BUILD_VERSION__`
const APP_SHELL = APP_BASE_URL.href
// Filled by Vite after bundling, including AI workers, all art and all icons.
const PRECACHE_ASSETS = /* __CRD_PRECACHE__ */ []

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    // Installation is atomic: a partial download never replaces the usable app.
    await cache.addAll(PRECACHE_ASSETS.map((asset) => new Request(new URL(asset, APP_BASE_URL), { cache: 'reload' })))
    const shell = await cache.match(new URL('index.html', APP_BASE_URL))
    if (!shell) throw new Error('Offline app shell is missing')
    await cache.put(APP_SHELL, shell)
    // Activate after existing games close, keeping each page and its workers on
    // the same build even when an update arrives midway through a game.
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map((name) => caches.delete(name)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(APP_SCOPE)) return

  // Serve one complete build. Network-first HTML can otherwise point at new
  // scripts that were never saved before the device went offline.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME)
    if (request.mode === 'navigate') return await cache.match(APP_SHELL) ?? fetch(request)
    // Module/CSS requests can carry a different Origin header from installation
    // fetches. These same-origin build assets are identical across that Vary.
    const cached = await cache.match(request, { ignoreVary: true })
    if (cached) return cached
    return fetch(request)
  })())
})
