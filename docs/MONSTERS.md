# Monsters

Added 2026-11-06; included in the 2026-11-08 release. Select **Testing → Battle → Monsters**. This is a separate experimental ruleset (`monsters` / `monsters-v1`) built on the current Abilities+NewCards pool. Normal play keeps the NC ruleset; Monsters is available with Testing enabled.

## Starting rules

- All four factions play together. Monsters have no faction ability yet. A Monster main faction loses one power per enemy shield point.
- Existing Critter tiebreak, Robot Perfect Balance and Dragon Overwhelming/immunity remain in effect.
- Discard starts with six cards per seat. Each of the two redraws replaces the selected cards, preserving a six-card hand.
- Draft reveals six cards per pack. Each player takes one; the remaining four go to the discard pile. Six packs give each player six picks and a six-card hand before preparation. First picker alternates as usual.
- Specials may change the hand size during preparation, just as in NC.
- `MONSTER_HAND_SIZE` and `MONSTER_PACK_SIZE` in `src/game/monsters.js` are the shared defaults for browser play, deck recipes and headless play. Other rulesets retain five-card hands/packs.

## Added cards

| Card | Copies | Effect |
| --- | ---: | --- |
| Monster | 7 | One Monster stat |
| Monster Attack | 7 | Monster stats × 1 power |
| Double Monster | 1 | Two Monster stats |
| Triple Monster | 1 | Three Monster stats |
| Monster Ultimate | 2 | Monster stats × 2 power |
| Monster Draw / Discard | 1 | Draw N, then discard N; N is your Monster stat count when activated |
| Monster Transformation | 1 | Choose Critter, Robot or Dragon; every Monster stat currently in your hand becomes that faction |
| Monster × Critter | 1 | Neutral power = Monster stats × Critter stats |
| Monster × Robot | 1 | Neutral power = Monster stats × Robot stats |
| Monster × Dragon | 1 | Neutral power = Monster stats × Dragon stats |

The 23 new physical cards produce a **96-card Regular deck** (NC73 + 23) and a **146-card Wild deck**. Every single-stat and ordinary attack copy has distinct artwork; the two Ultimates also have different art.

Draw/discard locks N before drawing; drawing or discarding Monster stats cannot change the pending debt. You may discard the source itself. Resolve all required discards before another special. An empty deck draws nothing, and the discard requirement is capped by the available hand, matching the existing Draw 2 / Discard 2 exhaustion convention. N=0 completes without drawing or discarding.

Transformation changes card stats in the hand, preserving their identities and artwork. It is optional, can be cancelled before choosing, and each source activates once. Later Monster draws are unchanged. Copy copies the transformed stats; a transformed card keeps its stats if discarded and recycled. Monster attacks lose their power when no Monster stats remain.

Mixed products are neutral, do not count as Robot attacks, and are recomputed if Overwhelming grants a Dragon stat. Specialist counts Monster as a fourth possible sole faction. Re-enabled From Nothing retains its original two Critter/Robot/Dragon stats and gives no Monster stats.

## Collection editor and recipes

With Monsters and Testing selected, open **Collection → Edit deck counts**. Every NC/Monster definition has an inclusion toggle and an exact count from 0 to 30. From Nothing and Shield Ultimate are available here at zero by default; their normal NC visibility is unchanged. Cards excluded by the inherited Abilities rules (such as Shortcut and Chameleon) remain excluded.

**Apply & deal** saves the counts in local settings and deals a new game. Changes are staged until applied. At least 36 cards are required so both six-pack Draft and two complete six-card redraws per seat can finish. Disabling Testing returns to normal NC while remembering the Monster counts.

**Deck recipe** exposes a full JSON configuration, a compact `M1-…` identifier and total. Download/import the JSON to share an exact setup for later tests. The identifier covers the rule version, hand size, pack size and canonical counts; it is a convenience checksum, not a cryptographic artifact hash. Every card is listed, including zeroes. Explicit counts are physical counts and override Wild expansion. Reset counts restores the selected Regular/Wild defaults; apply to save.

The recipe's `tabletop`, `wildDeck` and `monsterDeck` can be passed directly to `getExpandedCoreDeck`, `createHeadlessGame` and `getHeadlessSpec`. Add a game `mode`, `seed` and `control` as usual. The headless spec exposes the real pool counts, unique physical UIDs, six-card sizes and `monsters-v1` domain. Keep future Monster data separate from existing three-faction training data.

RolfBot, SvenBot and same-screen human play are available. Sven supports both six-card Draft and Discard; its rollouts preserve Monster sizes and restore hidden transformed cards before sampling. Existing three-faction trained opponents remain excluded.

## Assets and verification

`data/monster-cards.json` defines the new cards. The creator's complete source JSON is archived in `assets/monster-source-cards.json`. Twenty-five selected full-resolution art PNGs and `monster2.png` were downloaded unchanged into `assets/originals/`. The existing pipeline produced maximum-768px quality-82 WebP art and a maximum-128px lossless WebP icon in `public/images/`. Source/output hashes and dimensions are in `data/image-manifest.json`. Full originals and unused source designs are not served by the game.

Icon meanings follow the source JSON: `monster2` is the Monster stat, broken heart is damage, `card_add` is draw, `card_subtract` is discard, and the arrow indicates transformation. The source's heart/life icons on the three hybrid designs were replaced with the requested broken-heart damage symbol. New formulas use × and the active specials use aligned rows.

Run `npm run monsters:test`, existing tabletop/NC/headless/room/local multiplayer tests, `npm run lint`, `npm run build`, and `npm run assets:smoke`. `scripts/monsters-browser-smoke.mjs` uses Playwright against a Vite dev server; `CRD_PLAYWRIGHT_MODULE` and `CRD_URL` can select local tooling and the server. It checks six-pack drafting, six-card Discard, recipe import/export/persistence, transformation, mandatory discards, the fourth faction ledger and mobile layout. Screenshots and the browser receipt are under `artifacts/ui/monsters/`.
