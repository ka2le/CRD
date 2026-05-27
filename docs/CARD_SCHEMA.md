# CARD_SCHEMA.md

## Purpose

This file defines the first working JSON shape for cards in Critters Robots Dragons.

Current canonical data file:
- `data/cards.json`

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
Array of image URLs. Keep these even if UI does not yet fully use them.

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

Current interpretation draft:
- `1` = every round from round 1
- `2` = every other round
- `3` = every third round
- `0` = pre-battle / immediate / special timing
- negative values = special timing semantics still to be formalized
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

## Next steps

Create these follow-up docs:
- `docs/CARD_LIBRARY.md`
- `docs/RULES.md`
- `docs/COMBAT.md`

And later evolve the schema to support:
- explicit timing windows
- targeting
- conditional requirements
- transforms/conversions
- draw/discard effects
- shield interactions
- multiplayer-safe serialization
