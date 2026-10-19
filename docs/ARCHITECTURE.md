# Architecture

Reviewed 2026-10-18. CRD is a static React 19/Vite frontend with reusable JavaScript game modules. No backend or multiplayer transport is implemented.

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

Factories support seeds, custom RNGs and injected decks. Modes support strategies and move suppression. Discard can defer its opponent pass for external control without changing the browser's combined pass. Worker protocol v2 commands: `ping`, `describe`, `reset`, `step`, `observe`, `fork`, `close`.

Headless now enters explicit preparation after hand building and resolves the exact 21/50 combat only when both seats finish. `control` selects player, opponent or both; automatic baseline actions use the same legal decisions. Per-seat observations hide enemy private preparation, debug state, seeds and deck order. Gymnasium wraps a single controlled seat and supplies numeric sequences, masks and terminal outcome rewards. Privileged forks isolate immutable states but preserve the actual hidden world; fair resampling/search/training remain unimplemented. Details and commands: `AI_ENVIRONMENT.md`.

The GitHub Pages workflow builds on `master` using Node 22 and deploys `dist`; `GITHUB_PAGES=true` selects `/CRD/`. This review verified local build, not live deployment. Follow `PUBLISHING.md` for sanitized publishing that excludes private workspace/memory files.

## Quality and next boundaries

Build/smokes pass; lint is clean since the 2026-10-18 UI redesign. `CURRENT_STATE.md` records verification, the completed preparation fix, and deferred draft/starter/recycle findings.

Keep rules out of components and visibility separate from ownership. Shared preparation and either-seat headless decisions are implemented; future P1/P2/Viewer browser rooms/network sync remain plans.

## AI boundary - 2026-10-19

`AI_TRAINING.md` specifies the search-plus-residual-value direction. Shared actions, observations, full preparation and exact combat now exist; Python/Gymnasium wraps the persistent worker with engine-derived damage/shield cycles. Next are observation-consistent world sampling, batched rollouts, a search teacher and PyTorch residual evaluator. Privileged snapshots/real deck order stay outside policy inputs. Final prepared-hand combat remains exact; no neural evaluator has been added yet.
