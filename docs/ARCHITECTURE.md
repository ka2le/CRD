# Architecture

**Current adoption (creator instruction, 2026-10-23):** Fast David is now the real game and new-data default: `david-discard-probability-cdf128-v2`,50opponents/two prep scenarios/128CDF points for3+card redraws, exact0/1/2card redraws, stream912371. The creator explicitly requested removing the thinking widget and restoring ordinary human-then-bot discard turns. No early computation/automatic independent passes; no dots or numeric counters. Original full-v1 evidence and frozen runtimes remain historical. Actual Sven preparation unchanged; Draft fallback/memory unchanged. A focused real-browser two-pass check, lint and build pass; no new strength games or public publication.

**David latency/UI follow-up (2026-10-23):** David starts on the deal and immediately starts pass2after its replacements, independently of the human; atomic shared draws and per-seat keys preserve work across human passes. Numeric pass/choice progress is removed by creator instruction; only coarse dots beside its name. Exact shield/faction/Critter-tie score lookup preserves the50opponent policy; defaults remain50/two/full-exact. Initial lookup had no overall timing win. A four-position3+redraw-quadrature probe gave~0.65s versus37.65s with four matching choices, but has no gameplay validation and is not promoted. User-requested old-v2/main faction-balance repeat held at21/128saved games after cost feedback, all21independently replayed; no automatic resume or balance conclusion from compute-biased partials. Historical comparisons use declared sequential flow; local concurrent scheduling and human rooms are separate. See [DavidBot](DAVID_BOT.md).


**DavidBot adopted (2026-10-23):** DavidBot (Very Hard) is integrated for Discard, supporting Regular/Wild and current battle rules. Switching to Draft uses SvenBot; returning restores the last Discard bot across reloads. Actual preparation stays Sven. David is the canonical opponent/policy for all new Discard data and comparisons; the creator considers Discard solved for project purposes and closed further Discard neural/search research unless explicitly reopened. Easier game opponents and historical protocols remain available. New data uses `researchAi.js` / headless `research-action`; Discard balance collection defaults to David. Original strength evidence is Regular/Abilities-main; rule extensions use current mechanics with the transferred prior. See [DavidBot guide](DAVID_BOT.md). Local integration; no public Pages publication in this task.


**Current naming:** UI **Abilities** = code **`abilities-main`** (formerly v2). The original is **Abilities Prototype** / `abilities-prototype`, retained but hidden. Generic abilities/tabletop tests use main; prototype testing needs an explicit request. See [ruleset naming policy](RULESET_NAMES.md).

**Adopted v2 balance (2026-10-22):** creator selected Dragon contribution7+ before shields → one extra Dragon stat; shield costs C/R/D1/2/0. Critter wins ties; Robot-main Perfect Balance+3 unchanged. Both reference-card layouts show7+ and−1/−2/0; help derives shield costs from shared constants. Headless v2 versionv8. Playable defaults exactly reproduce all1,000 saved trial games and4search roots. Normal Svenbot16 samples: Draft C/R/D44.8/54.3/52.0%, Discard52.7/51.3/44.9%, draws6.2/8.2%. Creator considers this best so far and explicitly requested commit/deployment. Supersedes earlier current-v2 statements; historical variants retained.73 checks,lint,Pages build,regression pass. Published as public6d6c2ba (private implementation43c2126); Pages39746799653 succeeded. Live index-BYbUNPj1.js and searchAi.worker-Bhvc-M8X.js byte-match the tested build. Fresh live browser verified both score cards and help, with no page errors. Deployment complete.

Historical main experiment (superseded; disabled in current main): `getRobotPipPlans` enumerates net Robot unit trades, preserving non-Robot pips; `tabletopAttackUnits` overrides printed coefficients only on scoring-plan derivatives so partial Ultimates retain exactly one unit. `getRobotPipProfile` filters converted plans by resulting Robot eligibility, retaining per-type profiles: Robot gets the optimized plan and other mains get the original hand. `scoreTabletopHand` resolves the selected profile before shields; converted power cannot leak to Critter tiebreak or Dragon main. Default `robotPipReconfigure=true`; historical variants explicitly freeze it false. Headless v2 rules versionv4. Score-card artwork unchanged.

Earlier implementation, retained for historical studies:

2026-10-21 adopted v2 revision: `getBaseFlexiblePlans` evaluates all reachable base Robot stat/attack counts in linear many plans, avoiding exponential subsets. Only `robot1`/`robot_attack` IDs qualify, including copies; fixed mixed/double stats and specials still contribute to scoring. Each plan applies Dragon6+ extra stat once before selecting maximum unshielded power. Legacy one-pip behavior is explicitly process-configured for historical studies. WeakMap profiles still require configuring trials before scoring. Headless abilitiesv2 rules versionv3. See `TABLETOP_MODE.md`.

2026-10-21: three tabletop modes use the confirmed smaller damage scale; see `TABLETOP_MODE.md`. `scripts/tabletop-balance.mjs` collects actual browser-search self-play, including preparation, with real mode-specific decks, fixed budgets, durable decision records and independent decision probes. `TABLETOP_BALANCE_RESULTS.md` records the completed comparison. Earlier balance numbers below concern superseded rules/decks. Digital AI training remains separate and paused.

2026-10-19 addition: the persisted `tabletop` setting applies independently of Draft/Discard. `cards.js` derives marked cards through `tabletop.js`; `tabletopAi.js` supplies integer-mode heuristics. Session preparation validates main-type commitment. Playback calls the pure tabletop scorer immediately; `TabletopScore.jsx` renders both formulas. Browser Search AI re-scores completed sampled hands with tabletop rules; offline digital training remains unchanged. See `TABLETOP_MODE.md`.

Tabletop-only definitions live in `data/tabletop-cards.json` and are included only through explicit tabletop deck/collection options. `FactionPicker.jsx` presents the session's validated main-faction choices (including unrestricted Chameleon choices); the scorer handles Shortcut tiers and chosen-faction rules. Imported local artwork is archived separately and resolved through the existing manifest, keeping originals out of the public build.

Reviewed 2026-10-18. CRD is a static React 19/Vite frontend with reusable JavaScript game modules. Optional browser-hosted rooms and a Cloudflare relay were added and deployed on 2026-10-20; see `MULTIPLAYER.md` for the current transport/persistence/deployment contract.

## Code map

| Area | Responsibility |
| --- | --- |
| `src/App.jsx` | Compose menu, hands, boards, battle and overlays; connect session/playback |
| `src/game/cards.js` | Playable filter, physical copies, shuffle, seeded RNG, Wild Deck |
| `src/game/fiveHandDiscard.js` | Deal and two discard/refill transitions with AI passes |
| `src/game/draftMode.js` | Draft phases, picks, discard and reveal |
| `src/game/engine.js` | Stats, CD, simultaneous damage/shields, battle history/outcome |
| `src/game/cardEvaluator.js`, `draftAi.js` | Shared heuristic scoring and choices |
| `src/game/preBattleEffects.js`, `copyCard.js` | Preparation effect primitives and transformations |
| `src/game/preparationState.js`, `preBattle.js` | Shared preparation decisions/state; heuristic policy/completion and compatibility exports |
| `src/hooks/useGameSession.js` | Session reducer, settings, preparation tracking/selection, resets, orchestration |
| `src/hooks/useDraftFlowEffects.js`, `draftMotion.js` | Timed draft transitions and motion coordination |
| `src/hooks/useBattlePlayback.js` | Call simulator and play back history |
| `src/components/animation/CardMotionContext.jsx` | DOM anchors, flying cards, masks |
| `src/components/` | Menu, hands, pack, piles, card visuals/inspect, HUD rails, battle arena/results, sheets (see `UI.md`) |
| `src/hooks/useFitLayout.js`, `src/hooks/dealTiming.js` | Fit-to-box card sizing; shared shuffle/deal pacing |
| `data/cards.json` | Card definitions and source art URLs (provenance) |
| `data/image-manifest.json`, `src/components/card/imageAssets.js` | Source-to-local WebP mapping and Vite base-path resolution |
| `scripts/prepare-images.mjs`, `assets/originals/`, `public/images/` | Resumable download/archive and optimized image pipeline |
| `src/game/headlessGame.js` | No-delay mode adapter, actions and observations |
| `src/game/rolloutSearch.js` | Stateless observation-conditioned world sampling and paired all-action rollout values |
| `scripts/headless-worker.mjs` | Persistent JSON-lines sessions |
| `python/crd/worker.py`, `python/random_headless_smoke.py` | Bounded persistent transport and standard-library smoke |
| `python/crd/env.py`, `python/gym_smoke.py` | Gymnasium numeric observations, variable candidate actions/masks, replays and driver |

## Current boundaries

Core battle/mode transitions are independent of React. The simulator returns complete history; playback timing does not affect results. AI shares stat/damage functions.

Preparation decisions are shared in `preparationState.js`: create state, enumerate source/target/skip/finish choices and apply one validated immutable action. `preBattleEffects.js` contains effect primitives; `preBattle.js` preserves existing imports and the heuristic completion policy. The reducer uses shared transitions while retaining target-picker and delayed-redraw presentation. `START_BATTLE` still completes heuristic opponent preparation atomically and privately. Headless can instead control each decision for either seat. Existing separate recycle-pile semantics are preserved.

Draft transitions also emit optional `recentMoves` and visual markers. Boundaries are useful but the domain is not fully free of presentation metadata.

## State and rendering

Browser defaults are Draft, Wild Deck enabled and opponent cards visible unless localStorage overrides them. Settings key: `crd-dev-settings-v1`. Any settings update creates a fresh game; there is no persisted saved match.

Hands stay above/below the central board and remain during combat with triggered card values. Opponent hiding applies only before combat in discard mode.

Logical ownership can advance before a card finishes flying. Preserve explicit hand suppression and row masks; animation timing must not determine ownership. Session/battle keys distinguish resets and playback instances.

## Headless and deployment

Factories support seeds, custom RNGs and injected decks. Discard can defer the opponent pass without changing browser order. Worker v2 commands: `ping`, `describe`, `reset`, `step`, `observe`, `fork`, `sample`, `evaluate`, `close`. Sample/evaluate take observations/public pool metadata and independent planning options, never a live source session.

Headless enters explicit preparation and resolves 21/50 combat after both seats finish. `control` selects either/both seats; baseline policies use the same decisions. Views hide enemy private preparation, debug state, seeds and deck order. Gymnasium supplies numeric sequences/masks/reward. Privileged forks preserve the actual hidden world; separate stateless sampling/evaluation reconstructs feasible worlds from observations only. Hidden prior preparation uses a conditioned random proposal, not exact strategic inference. Deep tree search/model training remain future work. See `AI_ENVIRONMENT.md` and `AI_SEARCH.md`.

The GitHub Pages workflow builds on `master` using Node 22 and deploys `dist`; `GITHUB_PAGES=true` selects `/CRD/`. This review verified local build, not live deployment. Follow `PUBLISHING.md` for sanitized publishing that excludes private workspace/memory files.

## Quality and next boundaries

Build/smokes pass; lint is clean since the 2026-10-18 UI redesign. `CURRENT_STATE.md` records verification, the completed preparation fix, and deferred draft/starter/recycle findings.

Keep rules out of components and visibility separate from ownership. Shared preparation and either-seat headless decisions are implemented; P1/P2/Viewer browser rooms use the optional relay described below.

## AI boundary - 2026-10-19

**2026-10-20 v6 data milestone:**18k families/30k games/83.15m outcomes collected. At creator request, training stopped at epoch14 (best10) after auto-starting; checkpoint preserved. No evaluation or strength claim. Do not relaunch unless asked. Browser search stays non-neural.

V2 experiment adds `python/crd/value_net.py` (220 public features, two-hidden-layer W/D/L residual MLP), `collect_draft.py` (parallel resumable numeric shards), `train_value.py` (longer training/checkpoints/family splits), `evaluate_search.py` and `compare_search.py` (frozen-search paired evaluation). `AI_DRAFT_V2.md` describes this active layer. JS remains the rules/rollout authority; no future deck/order/seed reaches the model or root search. All Python parallelism is ordinary local simulation processes, not delegated AI agents.

Latest layer: `python/draft_experiment.py` orchestrates both-seat draft-only data/tournaments and calls worker `baseline` for existing heuristic preparation. `python/crd/draft_model.py` owns permitted-input features, grouped dataset loading, linear prior and NumPy residual MLP; `python/train_draft.py` fits/exports a local `.npz` checkpoint. `AI_DRAFT_EXPERIMENT.md` records commands and evidence. Browser inference and deeper learned cutoffs remain future work; the next paragraph describes the preceding teacher milestone.

`AI_TRAINING.md` specifies the search-plus-residual-value direction. Shared decisions/Gymnasium and an initial root-rollout teacher now exist. The teacher pairs sampled futures across actions, reports uncertainty and baseline deltas, and can generate grouped targets/replays through Python. Next: broader corpus/held-out evaluation, residual evaluator, stronger beliefs and deeper/batched search. Real-state seeds/deck order stay outside decisions. Final combat remains exact; no neural evaluator yet.

## Rooms (2026-10-20)

Normal launches remain immediate AI play. One-click room membership, remembered profiles and automatically started host-controlled human matches use `src/network/RoomClient.js`, `roomGame.js`, `useRoom.js` and `RoomSheet.jsx`. The host persists complete state/deck order before confirmation; the guest persists its token, snapshots and pending action. The existing session hook presents a seat-relative room view and suspends AI automation during human matches. The Cloudflare Worker/Durable Object relay stores only bounded membership/token hashes, validates message envelopes and expires rooms after 24 hours. Setup/deployment and tests: `MULTIPLAYER.md`.

Room protocol v2 adds open/private admission, bounded viewers, stable player identities and replaceable offline guest credentials/seat epochs. Host state and scores stay browser-owned; relay migration preserves v1 membership tokens. Heartbeats detect silent drops without polling game state. Game compatibility hashes normalize line endings and exclude UI/network code; the prior published fingerprint is migrated without redealing.

Online Discard stores per-seat selections and `discardReady` in the host snapshot; guest views expose the same active pass. Both locked choices resolve atomically with shared discard functions. Concurrent actions can use an earlier selection revision only when their deal/pass match; prior passes/rematches remain rejected. AI discard flow and relay protocol are unchanged.
