# ASSETS.md

## Current status

Card image URLs are currently stored directly in `data/cards.json`.

The first import uses remote image URLs from the provided source.

Site identity assets:
- `public/favicon.svg` is the CRD browser/site icon.
- `public/crd-icon.svg` is the current social preview image.
- `public/site.webmanifest` defines the CRD install/display metadata.

## Current guidance

- Keep image references on cards even if UI work does not yet focus on images.
- Treat images as presentation assets, not rules data.
- The engine should work even if images are missing.

## Planned evolution

Later we may:
- download/store assets locally
- map card ids to local asset paths
- separate card art from card rules data
- support alternate artworks per copy

## Current source patterns

Image sources seen so far:
- `cdn.midjourney.com` card artworks
- `ka2le.github.io/chatgpt-apps3/images/mp/...` icon/effect assets

## Recommendation

When the card JSON and art pack are added properly later, prefer:
- stable card ids in rules data
- a separate asset manifest for images/icons
- optional per-copy image arrays only when gameplay or collector behavior actually needs them
