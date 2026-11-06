import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { resolve, relative } from 'node:path'
import vm from 'node:vm'

const directory = resolve(process.env.CRD_BUILD_DIR || 'dist')
const source = await readFile(resolve(directory, 'service-worker.js'), 'utf8')

function worker(scope = '/CRD/', failInstall = false) {
  const handlers = new Map()
  const stores = new Map()
  const deleted = []
  let claimed = false
  const url = (request) => typeof request === 'string' ? request : request.url ?? request.href
  const origin = 'https://game.example'
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
    URL, Request, Response,
    caches: {
      async open(name) { if (!stores.has(name)) stores.set(name, cache()); return stores.get(name) },
      async keys() { return [...stores.keys()] },
      async delete(name) { deleted.push(name); return stores.delete(name) },
    },
    self: { registration: { scope: `${origin}${scope}` }, location: { origin },
      clients: { async claim() { claimed = true } },
      skipWaiting() { throw new Error('Must not replace an active build midway through a game') },
      addEventListener(type, handler) { handlers.set(type, handler) } },
    fetch() { throw new Error('Network is offline') },
  }
  vm.runInNewContext(`${source}\nglobalThis.buildAssets = PRECACHE_ASSETS; globalThis.cacheName = CACHE_NAME`, context)
  const run = (type) => { let promise; handlers.get(type)({ waitUntil(value) { promise = value } }); return promise }
  const fetch = (request) => { let promise; handlers.get('fetch')({ request, respondWith(value) { promise = value } }); return promise }
  return { ...context, stores, deleted, run, fetch, claimed: () => claimed }
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
  const success = worker()
  await success.caches.open('crd-pwa:/CRD/:old-build')
  await success.caches.open('crd-pwa:/:unrelated-app')
  await success.run('install')
  assert.deepEqual(success.deleted, [])
  await success.run('activate')
  assert.deepEqual(success.deleted, ['crd-pwa:/CRD/:old-build'])
  assert(success.stores.has('crd-pwa:/:unrelated-app'))
  assert(success.stores.has(success.cacheName))
  assert(success.claimed())
})
