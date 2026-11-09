import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { resolve, relative } from 'node:path'
import vm from 'node:vm'

const directory = resolve(process.env.CRD_BUILD_DIR || 'dist')
const source = await readFile(resolve(directory, 'service-worker.js'), 'utf8')

function worker(scope = '/CRD/', failInstall = false, windowClients = []) {
  const handlers = new Map()
  const stores = new Map()
  const deleted = []
  let claimed = false
  let skipped = false
  const url = (request) => typeof request === 'string' ? request : request.url ?? request.href
  const origin = 'https://game.example'
  const clients = windowClients.map((client) => ({
    async navigate() {},
    postMessage(message, [port]) { port.postMessage('CRD_UPDATE_MANAGED') },
    ...client,
  }))
  class MessageChannel {
    constructor() {
      this.port1 = { close() {}, onmessage: null }
      this.port2 = { postMessage: (data) => queueMicrotask(() => this.port1.onmessage?.({ data })) }
    }
  }
  const cache = () => {
    const entries = new Map()
    return {
      async addAll(requests) {
        for (const request of requests) {
          if (failInstall) throw new Error('Connection lost during install')
          const file = decodeURIComponent(new URL(request.url).pathname.slice(scope.length))
          entries.set(request.url, new Response(await readFile(resolve(directory, file))))
        }
      },
      async match(request, options) {
        if (request.headers?.get?.('Origin') && !options?.ignoreVary) return undefined
        return entries.get(url(request))?.clone()
      },
      async put(request, response) { entries.set(url(request), response.clone()) },
    }
  }
  const context = {
    URL, Request, Response, MessageChannel, setTimeout, clearTimeout,
    caches: {
      async open(name) { if (!stores.has(name)) stores.set(name, cache()); return stores.get(name) },
      async keys() { return [...stores.keys()] },
      async delete(name) { deleted.push(name); return stores.delete(name) },
    },
    self: { registration: { scope: `${origin}${scope}` }, location: { origin },
      clients: { async claim() { claimed = true }, async matchAll() { return clients } },
      async skipWaiting() { skipped = true },
      addEventListener(type, handler) { handlers.set(type, handler) } },
    fetch() { throw new Error('Network is offline') },
  }
  vm.runInNewContext(`${source}\nglobalThis.buildAssets = PRECACHE_ASSETS; globalThis.cacheName = CACHE_NAME`, context)
  const run = (type) => { let promise; handlers.get(type)({ waitUntil(value) { promise = value } }); return promise }
  const fetch = (request, clientIds = {}) => {
    let promise
    const pending = []
    handlers.get('fetch')({ request, ...clientIds, respondWith(value) { promise = value }, waitUntil(value) { pending.push(value) } })
    return promise && Promise.all([promise, ...pending]).then(([response]) => response)
  }
  return { ...context, stores, deleted, run, fetch, claimed: () => claimed, skipped: () => skipped }
}

test('build precaches every emitted asset, including both workers and local fonts', async () => {
  async function filesIn(dir) {
    return (await Promise.all((await readdir(dir, { withFileTypes: true })).map((entry) => {
      const path = resolve(dir, entry.name)
      return entry.isDirectory() ? filesIn(path) : path
    }))).flat()
  }
  const expected = (await filesIn(directory)).filter((path) => !path.endsWith('service-worker.js'))
    .map((path) => relative(directory, path).replaceAll('\\', '/')).sort()
  const runtime = worker()
  assert.deepEqual(Array.from(runtime.buildAssets).sort(), expected)
  assert(expected.some((path) => /searchAi\.worker-/.test(path)))
  assert(expected.some((path) => /davidBot\.worker-/.test(path)))
  assert(expected.some((path) => path.endsWith('.woff2')))
  assert(!source.includes('__CRD_BUILD_VERSION__'))
})

test('installed app navigates and serves manifest, module and CSS offline at either scope', async () => {
  for (const scope of ['/', '/CRD/']) {
    const runtime = worker(scope)
    await runtime.run('install')
    const request = (path, mode) => ({ url: `https://game.example${scope}${path}`, method: 'GET', mode })
    const shell = await runtime.fetch(request('?resume=1', 'navigate'))
    assert((await shell.text()).includes('<div id="root"></div>'))
    const manifest = await runtime.fetch(request('site.webmanifest', 'cors'))
    assert.equal((await manifest.json()).short_name, 'CRD')
    for (const asset of runtime.buildAssets.filter((path) => /assets\/index-.*\.(js|css)$/.test(path))) {
      const resource = await runtime.fetch({ ...request(asset, 'cors'), headers: new Headers({ Origin: 'https://game.example' }) })
      assert(resource.ok)
    }
    assert.equal(runtime.fetch({ ...request('', 'navigate'), method: 'POST' }), undefined)
    assert.equal(runtime.fetch({ url: 'https://other.example/image.webp', method: 'GET' }), undefined)
  }
})

test('failed update preserves the active cache; successful activation clears only its own scope', async () => {
  const runtime = worker('/CRD/', true)
  await runtime.caches.open('crd-pwa:/CRD/:old-build')
  await runtime.caches.open('crd-pwa:/:unrelated-app')
  await assert.rejects(runtime.run('install'), /Connection lost/)
  assert(runtime.stores.has('crd-pwa:/CRD/:old-build'))
  assert.deepEqual(runtime.deleted, [])
  assert.equal(runtime.claimed(), false)
  assert.equal(runtime.skipped(), false)
  const success = worker()
  await success.caches.open('crd-pwa:/CRD/:old-build')
  await success.caches.open('crd-pwa:/:unrelated-app')
  await success.run('install')
  assert(success.skipped())
  assert.deepEqual(success.deleted, [])
  await success.run('activate')
  assert.deepEqual(success.deleted, ['crd-pwa:/CRD/:old-build'])
  assert(success.stores.has('crd-pwa:/:unrelated-app'))
  assert(success.stores.has(success.cacheName))
  assert(success.claimed())
})

test('reload gets the new shell while other open games retain their offline AI workers', async () => {
  const clients = [{ id: 'old-game', url: 'https://game.example/CRD/' }]
  const runtime = worker('/CRD/', false, clients)
  const previous = await runtime.caches.open('crd-pwa:/CRD/:old-build')
  await previous.put('https://game.example/CRD/assets/old-worker.js', new Response('old AI worker'))
  await runtime.caches.open('crd-pwa:/:unrelated-app')
  await runtime.run('install')
  await runtime.run('activate')
  assert(runtime.skipped())
  assert.deepEqual(runtime.deleted, [])
  const resource = await runtime.fetch({ url: 'https://game.example/CRD/assets/old-worker.js', method: 'GET',
    headers: new Headers({ Origin: 'https://game.example' }) })
  assert.equal(await resource.text(), 'old AI worker')
  const navigation = { url: 'https://game.example/CRD/', method: 'GET', mode: 'navigate' }
  assert((await (await runtime.fetch(navigation, { resultingClientId: 'new-game' })).text()).includes('<div id="root"></div>'))
  assert.deepEqual(runtime.deleted, [])
  await runtime.fetch(navigation, { replacesClientId: 'old-game', resultingClientId: 'new-game' })
  assert.deepEqual(runtime.deleted, ['crd-pwa:/CRD/:old-build'])
  assert(runtime.stores.has('crd-pwa:/:unrelated-app'))
})

test('ordinary URLs migrate old pages while managed games control their own reloads', async () => {
  const navigated = []
  const runtime = worker('/CRD/', false, [
    { id: 'playing', url: 'https://game.example/CRD/', async navigate() { throw new Error('Active game reloaded') } },
    { id: 'updating', url: 'https://game.example/CRD/?resume=1#room', postMessage: undefined,
      async navigate(url) { navigated.push(url) } },
  ])
  await runtime.run('install')
  await runtime.run('activate')
  assert.deepEqual(navigated, ['https://game.example/CRD/?resume=1#room'])
})
