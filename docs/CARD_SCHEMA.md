# CARD_SCHEMA.md

## Purpose

This file defines the first working JSON shape for cards in Critters Robots Dragons.

Current canonical data file:
- `data/cards.json`
- `data/tabletop-cards.json` contains the tabletop-only additions; `getCoreCards({ tabletop: true })` includes them, while the default digital pool does not. `tabletopOnly: true` marks these definitions. Copy counts follow the same Normal / Wild convention.

## Current scope

The first extraction is based on the provided card-editor source.

Included now:
- base cards
- the initial default/non-extra cards

Excluded for now:
- extra cards
- monster cards

This matches the current goal of getting the core 3-class version playable first.

## Card object shape

```json
{
  "id": "robot_attack",
  "name": "robot_attack",
  "copies": 6,
  "type": "action",
  "images": ["https://..."],
  "stats": [],
  "effect": {
    "dmg": 2,
    "dmgType": "robot"
  },
  "customEffect": [],
  "cd": 2,
  "tags": ["class-damage", "base-attack"]
}
```

## Fields

### `id`
Stable machine-friendly identifier.

### `name`
Display/source name from the original data.

### `copies`
How many copies of this card exist in the current card pool.

### `type`
Current values:
- `stat`
- `action`
- `utility`

### `images`
Array of source references retained for provenance and variant selection: HTTPS URLs or relative `assets/originals/` paths for creator-supplied artwork. The renderer resolves these through `data/image-manifest.json` to local WebP derivatives; the engine does not depend on images. After adding sources, run `npm run assets:prepare`. See `ASSETS.md`.

### `stats`
For stat cards, this is an array of class names contributed by the card.

Examples:
- `["critter"]` = +1 critter stat
- `["robot", "robot"]` = +2 robot stats
- `["robot", "dragon"]` = +1 robot and +1 dragon

Normalized class names:
- `robot`
- `critter`
- `dragon`
- `monster` (reserved for later content)

### `effect`
Structured effect data when the meaning is already clear.

Current supported fields:
- `dmg`
- `dmgType`
- `shield`

`dmgType` is normalized to a class name when class-scaling is intended.

### `customEffect`
Raw icon/text tokens preserved from source data when an effect is not yet fully normalized into engine-ready structure.

This is temporary but useful.
It preserves original design intent while rules are still being formalized.

### `cd`
Timing / cooldown value from the source data.

Current combat interpretation:
- `1` = every round from round 1
- `2` = every other round
- `3` = every third round
- `0` = no combat trigger; four explicitly supported IDs can activate during preparation
- negative values = no current combat trigger; any intended semantics remain unimplemented
- `-100` = draw-phase/special timing marker from the source system

### `tags`
Loose classification for implementation and filtering.

## Important note

Not every card is fully rules-normalized yet.

That is expected.
The first goal is to:
1. preserve the card pool
2. preserve images
3. preserve obvious structured effects
4. keep unusual effects in `customEffect` until we formalize them in rules docs

## Runtime identity and implementation boundary

The JSON root contains `meta`, `classes`, and `cards`. There are 30 definitions; the explicit playable filter currently selects 27. See `CARD_LIBRARY.md` for counts and effects.

`expandCardPool` adds `uid` (`id__copyNumber`) and `imageIndex` to each physical card. Copies retain the definition's `id`. Transformed copies get a fresh composite UID and provenance fields such as `copiedFromUid`, `sourceCopyUid`, `copySourceCardId`, and `isCopiedCard`.

The engine reads numeric damage/shield fields generically, but several effects are implemented by explicit ID in `engine.js` and preparation helpers. `customEffect` is preserved source data, not an executable rules language. Merely adding a token or CD 0 card does not implement a behavior.

Runtime timing, targeting, activation tracking and discard ownership are not fully normalized into JSON. Preparation still partly lives in the session reducer; see `ARCHITECTURE.md` and `CURRENT_STATE.md` before expanding the schema.
