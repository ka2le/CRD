# Image assets

Updated 2026-10-19. All 90 unique referenced images are saved locally: 77 artworks (including every alternate, excluded-card variant, Shortcut and Chameleon) and 13 icons. Originals total 556.25 MiB; game derivatives total 4.28 MiB, a 99.2% reduction.

## Locations and rendering

- `assets/originals/`: byte-for-byte downloaded source files, outside Vite's public directory. Preserve this archive for future exports or conversions. It is excluded from the sanitized public snapshot and `dist`.
- `public/images/art/`: WebP artwork, quality 82, maximum 768 pixels on either axis, aspect ratio preserved and never upscaled.
- `public/images/icon/`: lossless WebP icons, maximum 128 pixels, transparency retained. Lossless describes the encoding after resizing; full-resolution sources remain in the archive.
- `data/image-manifest.json`: source URL to archive/game-file mapping, settings, dimensions, byte sizes and SHA-256 checksums.
- `src/components/card/imageAssets.js`: resolves source URLs to local derivatives using Vite's base URL, including `/CRD/` on GitHub Pages.

Shortcut and Chameleon originals supplied by the creator are saved byte-for-byte as `assets/originals/tabletop/shortcut.png` (2,889,262 bytes) and `chameleon.png` (2,633,209 bytes). Their 576×768 WebP copies total 227,670 bytes. `assets/originals/tabletop/README.md` records the supplied filenames. Definitions in `data/tabletop-cards.json` use these relative archive paths as manifest source keys; no personal filesystem path is shipped. Shortcut's arrow and star and Chameleon's three faction symbols reuse existing optimized icons.

Source URLs remain in `data/cards.json` and `cardData.js` for provenance. Art, blur layers, copy overlays, custom-effect icons, battle icons, tooltips and preloads use local files. Unmapped remote references do not silently request the CDN. Rules remain independent of image loading.

Output filenames include a source/settings digest so changed conversions get new browser cache URLs. Normal browser HTTP caching applies; this does not install an offline service worker or guarantee permanent browser storage.

## Import and rebuild

```powershell
npm install
npm run assets:prepare
npm run assets:check
npm run assets:smoke
```

`assets:prepare` discovers and deduplicates card art/custom-effect references from both card definition files and display/stat icon definitions. References may be HTTPS URLs or relative `assets/originals/` paths for creator-supplied local art. Missing local originals fail explicitly rather than attempting a download. Existing originals are reused; changed archived bytes fail checksum validation rather than being silently replaced. Unchanged derivatives are reused. Downloads use four workers, bounded retries, validation and temporary files renamed only after completion. A partial run can resume from already saved originals. A verified second run downloaded and converted zero files.

The artwork CDN rejects plain Node requests. For new downloads, its HTTP 403 response triggers the optional browser-compatible Python transport:

```powershell
python -m pip install --target .image-tools -r scripts/image-requirements.txt
npm run assets:prepare
```

`.image-tools/` is local and ignored by Git. Python/network access are unnecessary when all originals are present, and unnecessary for building or playing. Adjust settings in `scripts/prepare-images.mjs` and rerun to regenerate from originals without downloading again. Old outputs are retained; no automatic archive deletion occurs.

`npm run build` first runs an offline integrity/coverage check of all required game derivatives. It does not download images or require the original archive, so sanitized public snapshots build with only the manifest and optimized files. `assets:smoke` renders every card/art variant plus copy overlays and checks local paths at both `/` and `/CRD/`.

## Site identity assets

- `public/favicon.svg`: browser icon.
- `public/crd-icon.svg`: social preview.
- `public/site.webmanifest`: install/display metadata.

The service worker fetches installation metadata from the network without caching it. Cache version v2 removes the earlier cache that could retain an obsolete manifest and app identity indefinitely. Keep manifest requests out of the general asset cache.

These SVGs remain vector files. Google Fonts in `src/index.css` remains a separate remote font dependency.
