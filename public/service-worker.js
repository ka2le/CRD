const APP_BASE_URL = new URL('./', self.registration.scope)
const APP_SCOPE = APP_BASE_URL.pathname
const CACHE_PREFIX = 'crd-pwa:/CRD/:'
const CACHE_NAME = `${CACHE_PREFIX}v2`
const APP_SHELL = APP_BASE_URL.href
const STATIC_ASSETS = [
  'favicon.svg',
  'favicon.ico',
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    const response = await fetch(APP_SHELL, { cache: 'reload' })
    if (!response.ok) throw new Error(`Unable to cache CRD app shell: ${response.status}`)

    await cache.put(APP_SHELL, response.clone())
    const html = await response.text()
    const buildAssets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)]
      .map((match) => new URL(match[1], self.registration.scope).href)
    const staticUrls = STATIC_ASSETS.map((asset) => new URL(asset, APP_BASE_URL).href)
    await cache.addAll([...staticUrls, ...buildAssets])
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys()
    await Promise.all(cacheNames
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map((name) => caches.delete(name)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(APP_SCOPE)) return

  // Installation metadata must refresh when the server changes app identity or scope.
  if (url.pathname === new URL('site.webmanifest', APP_BASE_URL).pathname) {
    event.respondWith(fetch(request, { cache: 'no-store' }))
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME)
      try {
        const response = await fetch(request)
        if (response.ok) await cache.put(request, response.clone())
        return response
      } catch {
        return await cache.match(request) ?? await cache.match(APP_SHELL)
      }
    })())
    return
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME)
    const cached = await cache.match(request)
    if (cached) return cached

    const response = await fetch(request)
    if (response.ok) {
      await cache.put(request, response.clone())
    }
    return response
  })())
})
