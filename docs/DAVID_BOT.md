# DavidBot (Very Hard)

**Current adoption (creator instruction, 2026-10-23):** Fast David is now the real game and new-data default: `david-discard-probability-cdf128-v2`,50opponents/two prep scenarios/128CDF points for3+card redraws, exact0/1/2card redraws, stream912371. The creator explicitly requested removing the thinking widget and restoring ordinary human-then-bot discard turns. No early computation/automatic independent passes; no dots or numeric counters. Original full-v1 evidence and frozen runtimes remain historical. Actual Sven preparation unchanged; Draft fallback/memory unchanged. A focused real-browser two-pass check, lint and build pass; no new strength games or public publication.

**David fast128 strength screen completed (2026-10-23):** On64head-to-head games/32fresh Regular Discard/Abilities-main deals, fast versus full David finished **33/1/30 W/D/L** (51.56%literal wins;52.34%draw-half score,95%whole-deal CI46.875–57.8125%). Mean decisions1.049s versus43.154s under seven workers (41.15x); matched105public positions1.076s versus41.370s (38.45x),93/105same actions. No detected strength loss in this small screen, not proof of noninferiority. Both keep50opponents/two prep scenarios; only3+redraw integration is approximated. Actual Sven preparation fixed96for reproducibility; sequential headless flow. All66main/smoke games replayed;142lockedPython tests passed. Eight future families unplayed. No default change, training, automatic continuation, balance restart or public publication. Training-project report: `../SimpleLLM/experiments/plans/crd-david-quadrature128-20261023-v1-results.md`. Earlier latency-only statements below predate this screen.

Adopted by the creator on 2026-10-23. DavidBot is the main game's strongest Discard opponent and the canonical policy for **all newly authorized Discard comparisons and data collection**. Draft uses SvenBot. The creator considers Discard solved for the project's purposes; further Discard neural/search research is closed unless explicitly reopened. This is a project decision, not a proof of optimal play. Historical SvenBot studies and replay protocols retain their original meanings.

## Game behavior

The Opponent menu offers DavidBot only in Discard. Selecting it then switching to Draft selects SvenBot; returning to Discard restores David, including after reload. Discard and Draft bot memories are separate; choosing another Discard bot updates that memory. Easier opponents remain available for players.

At the creator's explicit request, David supports Regular/Wild and Battle, Threshold and Abilities. Explicit historical Abilities Prototype is supported by the headless API but remains hidden from the menu. Card pools, printed mechanics and battle scoring follow the selected settings. Other configurations transfer the original empirical hand compositions through their own card definitions; their strength has not been separately established by the original pilot.

Actual pre-battle actions still use SvenBot's existing search (16–96 samples,250ms per action). David changes Discard selection. Its dedicated worker keeps the interface responsive and terminates on game/mode changes. There is no Sven timeout. A failure shows Retry. The adopted fast profile retains all50opponents and approximates only3+card redraw leaf values.

**Current local turn flow:** At the creator's request, the independent early-pass experiment is disabled. David starts its decision only after the human submits a Discard pass, applies the response, then waits for the next human pass. New games do not set `game.concurrentOpponent`; older independent-pass saves are not resumed in this flow. Human rooms keep their existing simultaneous flow. Reset/mode change cancels unfinished work.

**No thinking widget is shown.** The creator removed both the name dots and numerical progress. Internal research counters and friendly Retry errors remain.

## Policy and provenance

`src/game/davidBot.js` is the native entry point. Current policy version: `david-discard-probability-cdf128-v2`; implementation `david-exact-opponent-cdf-v2`. Defaults:50empirical opponents/two prep scenarios/`chanceLimit=128`/public SHA-256 stream912371. Zero/one/two-card redraws remain fully enumerated;3+card redraws use deterministic probability-CDF midpoint quadrature. Ties keep more cards, then the earlier physical mask. Explicit `chanceLimit=1000000` remains available for reproducing full integration; archived full-v1 runtimes remain unchanged.

All 32 physical masks remain represented; mechanically identical selected multisets share values while keeping zero/one/two copies remains distinct. Replacement counts are weighted by exact multivariate hypergeometric probabilities under a uniform-unseen marginal deck model. Real preparation effects, targets, skip and finish value specials, without fixed special-card bonuses. One-action preparation lookahead borrows Rules completion. Opponent strength uses an independent empirical prior; preparation draws use two sampled scenarios; the second pass replans. These estimates are not an exact joint solution of the full game.

`data/david-opponents.json` contains 256 prepared hands from 128 training-only pure-Sven shadow games, with source families consistently pseudonymized. No local paths, personal records, held-out validation, confirmation or reserved games are included. Metadata and SHA-256 fingerprints are in `data/david-opponents.meta.json`. Keep the prior immutable under this version.

Battle uses compiled cooldown cycles from the official digital resolver, preserving21damage/50round results including simultaneous lethal damage and max-round ties. Tabletop uses its shared scorer, including shields and Critter ties. The former full-v1 profile has archived exact-value parity; the adopted128point profile deliberately approximates3+redraw values.

The exact tabletop opponent lookup is implemented in `davidOpponentScores.js`, implementation ID `david-exact-opponent-cdf-v2`, policy version unchanged. Group by enemy shields (which affect our score); for each own-shield value, score every opponent with its committed faction and shield cost, separating Critter-tie scores. Cache the resulting W−L lookup by our score/tie rule. This retains Dragon shield immunity and Robot/Critter penalties, rather than treating opponents as an unconditional power distribution. Digital Battle does not use this scalar lookup. `metrics.battleComparisons` remains the historical **logical** pairwise result count; `work.opponentGroupQueries` records actual grouped queries.

Historical cost probe: the first exact lookup alone did not speed up full decisions. The later64game fast128-vs-full screen gave33/1/30fast W/D/L,52.34%draw-half [46.875,57.8125%],1.049s versus43.154s under7workers. This small screen detected no strength loss, without proving noninferiority. The creator subsequently explicitly adopted fast128. Original full-v1 experiments and diagnostics remain frozen.

## Research and data callers

Use `src/game/researchAi.js:chooseResearchAiDecision(state)` for new authorized collection: David in Discard, Sven in Draft and actual preparation. `getResearchAiProfile(mode)` records exact profiles. The JSON-lines headless worker exposes `research-action` (does not apply the action; use `step` next), returning profile, action and diagnostics. Old `baseline` remains the historical Rules policy so replays do not silently change.

`scripts/tabletop-balance.mjs` now uses David plus timed Sven preparation for new Discard runs; its fixed `samples` argument still applies to Draft, and the Discard manifest records that it is unused. Both source/prior hashes are retained. No new study is launched by adoption. `scripts/bot-ladder.mjs` accepts explicit `david`; in Draft this uses Sven. Explicit old bots remain available as labeled comparisons.

The AI-training project's defaults are `experiments/crd-discard-defaults.json` and its top-level AGENTS/research notes. For Discard, these supersede its older general Sven/Battle research default. Preserve historical games and family splits; do not relabel old Sven data as David data.

## Historical pilot

`crd-discard-probability-empirical50-20261023-v1`, Regular/Abilities-main, 16 fresh physical families/both seats: David 21W/0D/11L (65.625% wins), regular timed Sven control 15W/2D/15L (46.875%). Paired win difference +18.75 percentage points, 95% family bootstrap [0, +37.5]. Mean Discard time under seven-worker load: 40.687 s versus 0.567 s. The creator adopted this package; no new strength claim is inferred for rule extensions.

## Verification

`npm run david:test` checks every resolver and deck setting, both seats/passes, hidden-hand/deck invariance, physical legality, probability mass, memory/reducer behavior, worker progress/errors/cancellation, and 1,024 digital battle pairs. `npm run opponent:test`, existing headless/tabletop/room tests, lint and production build cover integration. The training project's `crd_david_integration_check.mjs` records exact full-profile parity against frozen research evidence, without launching a new strength study.
