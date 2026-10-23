# DavidBot (Very Hard)

Adopted by the creator on 2026-10-23. DavidBot is the main game's strongest Discard opponent and the canonical policy for **all newly authorized Discard comparisons and data collection**. Draft uses SvenBot. The creator considers Discard solved for the project's purposes; further Discard neural/search research is closed unless explicitly reopened. This is a project decision, not a proof of optimal play. Historical SvenBot studies and replay protocols retain their original meanings.

## Game behavior

The Opponent menu offers DavidBot only in Discard. Selecting it then switching to Draft selects SvenBot; returning to Discard restores David, including after reload. Discard and Draft bot memories are separate; choosing another Discard bot updates that memory. Easier opponents remain available for players.

At the creator's explicit request, David supports Regular/Wild and Battle, Threshold and Abilities. Explicit historical Abilities Prototype is supported by the headless API but remains hidden from the menu. Card pools, printed mechanics and battle scoring follow the selected settings. Other configurations transfer the original empirical hand compositions through their own card definitions; their strength has not been separately established by the original pilot.

Actual pre-battle actions still use SvenBot's existing search (16–96 samples, 250 ms per action). David changes Discard selection. Its dedicated worker keeps the interface responsive, reports completed discard choices and terminates on game/mode changes. There is no five-second Sven timeout. A failure shows a Retry control instead of silently changing the policy. Exact integration can take tens of seconds per pass; progress counts choices, not equal-duration work units.

## Policy and provenance

`src/game/davidBot.js` is the native entry point; `davidBotCore.js` retains the frozen probability planner. Version: `david-discard-probability-v1`. Defaults: 50 prepared empirical opponents, two preparation draw scenarios, all replacement-count outcomes (`chanceLimit=1,000,000`), public-view SHA-256 stream 912371. Discard ties keep more cards, then the earlier physical mask.

All 32 physical masks remain represented; mechanically identical selected multisets share values while keeping zero/one/two copies remains distinct. Replacement counts are weighted by exact multivariate hypergeometric probabilities under a uniform-unseen marginal deck model. Real preparation effects, targets, skip and finish value specials, without fixed special-card bonuses. One-action preparation lookahead borrows Rules completion. Opponent strength uses an independent empirical prior; preparation draws use two sampled scenarios; the second pass replans. These estimates are not an exact joint solution of the full game.

`data/david-opponents.json` contains 256 prepared hands from 128 training-only pure-Sven shadow games, with source families consistently pseudonymized. No local paths, personal records, held-out validation, confirmation or reserved games are included. Metadata and SHA-256 fingerprints are in `data/david-opponents.meta.json`. Keep the prior immutable under this version.

Battle uses compiled cooldown cycles from the official digital resolver, preserving the 21 damage / 50 round result including simultaneous lethal damage and max-round ties. Tabletop modes call their shared scorer, including shield costs and Critter ties. The original Regular/Abilities-main values, actions and work counters match the frozen research implementation exactly.

## Research and data callers

Use `src/game/researchAi.js:chooseResearchAiDecision(state)` for new authorized collection: David in Discard, Sven in Draft and actual preparation. `getResearchAiProfile(mode)` records exact profiles. The JSON-lines headless worker exposes `research-action` (does not apply the action; use `step` next), returning profile, action and diagnostics. Old `baseline` remains the historical Rules policy so replays do not silently change.

`scripts/tabletop-balance.mjs` now uses David plus timed Sven preparation for new Discard runs; its fixed `samples` argument still applies to Draft, and the Discard manifest records that it is unused. Both source/prior hashes are retained. No new study is launched by adoption. `scripts/bot-ladder.mjs` accepts explicit `david`; in Draft this uses Sven. Explicit old bots remain available as labeled comparisons.

The AI-training project's defaults are `experiments/crd-discard-defaults.json` and its top-level AGENTS/research notes. For Discard, these supersede its older general Sven/Battle research default. Preserve historical games and family splits; do not relabel old Sven data as David data.

## Historical pilot

`crd-discard-probability-empirical50-20261023-v1`, Regular/Abilities-main, 16 fresh physical families/both seats: David 21W/0D/11L (65.625% wins), regular timed Sven control 15W/2D/15L (46.875%). Paired win difference +18.75 percentage points, 95% family bootstrap [0, +37.5]. Mean Discard time under seven-worker load: 40.687 s versus 0.567 s. The creator adopted this package; no new strength claim is inferred for rule extensions.

## Verification

`npm run david:test` checks every resolver and deck setting, both seats/passes, hidden-hand/deck invariance, physical legality, probability mass, memory/reducer behavior, worker progress/errors/cancellation, and 1,024 digital battle pairs. `npm run opponent:test`, existing headless/tabletop/room tests, lint and production build cover integration. The training project's `crd_david_integration_check.mjs` records exact full-profile parity against frozen research evidence, without launching a new strength study.
