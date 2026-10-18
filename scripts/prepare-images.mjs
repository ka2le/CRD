import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import sharp from 'sharp'

const root = fileURLToPath(new URL('../', import.meta.url))
const manifestPath = path.join(root, 'data/image-manifest.json')
const checkOnly = process.argv.includes('--check')
const settings = {
  art: { maxSize: 768, quality: 82, effort: 6 },
  icon: { maxSize: 128, lossless: true, effort: 6 },
}
const hash = (value) => createHash('sha256').update(value).digest('hex')
const runFile = promisify(execFile)
const readJson = async (filename) => JSON.parse(await readFile(filename, 'utf8'))

async function optionalRead(filename) {
  try { return await readFile(filename) } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

async function atomicWrite(filename, contents) {
  await mkdir(path.dirname(filename), { recursive: true })
  await writeFile(`${filename}.tmp`, contents)
  await rename(`${filename}.tmp`, filename)
}

const sources = new Map()
function collect(value, role = 'icon') {
  if (typeof value === 'string' && /^https:\/\//.test(value)) {
    if (!sources.has(value) || role === 'art') sources.set(value, role)
  } else if (Array.isArray(value)) {
    value.forEach((item) => collect(item, role))
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => collect(item, key === 'images' ? 'art' : role))
  }
}
collect(await readJson(path.join(root, 'data/cards.json')))
const iconDefinitions = await readFile(path.join(root, 'src/components/card/cardData.js'), 'utf8')
for (const [url] of iconDefinitions.matchAll(/https:\/\/[^'"\s]+/g)) collect(url)

const previous = JSON.parse((await optionalRead(manifestPath))?.toString() ?? '{"images":{}}')
const images = {}
let downloaded = 0
let converted = 0

async function download(url) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(60000) })
      if (response.status === 403 && new URL(url).hostname === 'cdn.midjourney.com') {
        const { stdout } = await runFile('python', [path.join(root, 'scripts/download-image.py'), url], {
          encoding: 'buffer', maxBuffer: 64 * 1024 * 1024, timeout: 90000,
          windowsHide: true,
        })
        await sharp(stdout).metadata()
        return stdout
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const buffer = Buffer.from(await response.arrayBuffer())
      await sharp(buffer).metadata()
      return buffer
    } catch (error) {
      if (attempt === 3) throw new Error(`Download failed: ${url}: ${error.message}`)
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000))
    }
  }
}

async function prepare(url, role) {
  const old = previous.images[url]
  if (checkOnly) {
    if (!old || old.role !== role || JSON.stringify(old.settings) !== JSON.stringify(settings[role])) {
      throw new Error(`Missing/stale image entry: ${url}; run npm run assets:prepare`)
    }
    const output = await readFile(path.join(root, 'public', old.path))
    if (hash(output) !== old.outputSha256) throw new Error(`Invalid game image: ${old.path}`)
    const info = await sharp(output).metadata()
    if (info.format !== 'webp' || Math.max(info.width, info.height) > settings[role].maxSize) {
      throw new Error(`Unexpected image format or dimensions: ${old.path}`)
    }
    images[url] = old
    return
  }

  const sourceId = hash(url).slice(0, 20)
  const extension = path.extname(new URL(url).pathname) || '.img'
  const original = `assets/originals/${sourceId}${extension}`
  const originalPath = path.join(root, original)
  let buffer = await optionalRead(originalPath)
  if (!buffer) {
    buffer = await download(url)
    await atomicWrite(originalPath, buffer)
    downloaded += 1
  }
  const sourceSha256 = hash(buffer)
  if (old && old.sourceSha256 !== sourceSha256) {
    throw new Error(`Archived original changed: ${original}; restore it before continuing`)
  }
  const outputId = hash(sourceSha256 + JSON.stringify(settings[role])).slice(0, 20)
  const outputPath = `images/${role}/${sourceId}-${outputId}.webp`
  let output = await optionalRead(path.join(root, 'public', outputPath))
  if (!old || old.path !== outputPath || !output || hash(output) !== old.outputSha256) {
    const { maxSize, ...webp } = settings[role]
    output = await sharp(buffer).rotate()
      .resize({ width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true })
      .webp(webp).toBuffer()
    await atomicWrite(path.join(root, 'public', outputPath), output)
    converted += 1
  }
  const info = await sharp(output).metadata()
  images[url] = {
    role, original, path: outputPath, settings: settings[role],
    sourceSha256, outputSha256: hash(output),
    originalBytes: buffer.length, bytes: output.length,
    width: info.width, height: info.height,
  }
  if (!old || old.path !== outputPath) console.log(`Saved ${role}: ${sourceId} (${output.length} bytes)`)
}

// Bound simultaneous network requests and image conversions. Keep partial successes
// on failure so a rerun can resume without downloading those originals again.
const pending = [...sources]
const failures = []
await Promise.all(Array.from({ length: 4 }, async () => {
  while (pending.length) {
    const [url, role] = pending.shift()
    try { await prepare(url, role) } catch (error) { failures.push(error.message) }
  }
}))
if (failures.length) throw new Error(failures.join('\n'))
if (!checkOnly) {
  const sorted = Object.fromEntries(Object.entries(images).sort(([a], [b]) => a.localeCompare(b)))
  await atomicWrite(manifestPath, `${JSON.stringify({ version: 1, images: sorted }, null, 2)}\n`)
}
const originalBytes = Object.values(images).reduce((total, image) => total + image.originalBytes, 0)
const gameBytes = Object.values(images).reduce((total, image) => total + image.bytes, 0)
console.log(`${checkOnly ? 'Verified' : 'Prepared'} ${sources.size} unique images; ${downloaded} downloaded, ${converted} converted.`)
console.log(`Originals: ${(originalBytes / 1048576).toFixed(2)} MiB; game: ${(gameBytes / 1048576).toFixed(2)} MiB; reduction: ${(100 * (1 - gameBytes / originalBytes)).toFixed(1)}%.`)
