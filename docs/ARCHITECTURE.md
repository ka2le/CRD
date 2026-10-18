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
| `src/game/preBattle.js`, `copyCard.js` | Preparation helpers and transformations |
| `src/hooks/useGameSession.js` | Session reducer, settings, preparation tracking/selection, resets, orchestration |
| `src/hooks/useDraftFlowEffects.js`, `draftMotion.js` | Timed draft transitions and motion coordination |
| `src/hooks/useBattlePlayback.js` | Call simulator and play back history |
| `src/components/animation/CardMotionContext.jsx` | DOM anchors, flying cards, masks |
| `src/components/` | Menu, hands, boards, card visuals/tooltips, battle HUD/log/results |
| `data/cards.json` | Card definitions and source art URLs (provenance) |
| `data/image-manifest.json`, `src/components/card/imageAssets.js` | Source-to-local WebP mapping and Vite base-path resolution |
| `scripts/prepare-images.mjs`, `assets/originals/`, `public/images/` | Resumable download/archive and optimized image pipeline |
| `src/game/headlessGame.js` | No-delay mode adapter, actions and observations |
| `scripts/headless-worker.mjs` | Persistent JSON-lines sessions |
| `python/random_headless_smoke.py` | Random legal-action client |

## Current boundaries

Core battle/mode transitions are independent of React. The simulator returns complete history; playback timing does not affect results. AI shares stat/damage functions.

Preparation is partly extracted: `preBattle.js` resolves draw/redraw/copy helpers and complete AI preparation. The session reducer owns human activation/recycle choices and commits `completeOpponentPreBattle` atomically in `START_BATTLE`. AI preparation is not exposed during the human preparation window. Pile state still lives in the session. Consequently headless play lacks browser preparation parity. Extracting complete preparation state/actions is a useful next step.

Draft transitions also emit optional `recentMoves` and visual markers. Boundaries are useful but the domain is not fully free of presentation metadata.

## State and rendering

Browser defaults are Draft, Wild Deck enabled and opponent cards visible unless localStorage overrides them. Settings key: `crd-dev-settings-v1`. Any settings update creates a fresh game; there is no persisted saved match.

Hands stay above/below the central board and remain during combat with triggered card values. Opponent hiding applies only before combat in discard mode.

Logical ownership can advance before a card finishes flying. Preserve explicit hand suppression and row masks; animation timing must not determine ownership. Session/battle keys distinguish resets and playback instances.

## Headless and deployment

Factories support seeds, custom RNGs and injected decks. Modes support strategies and move suppression. Worker commands: `ping`, `reset`, `step`, `close`.

Headless episodes stop at `battle-ready`, skip preparation, and evaluate 12 rounds with a 999 threshold by default. Browser combat uses 21 damage and 50 maximum rounds. Gymnasium/training are not implemented.

The GitHub Pages workflow builds on `master` using Node 22 and deploys `dist`; `GITHUB_PAGES=true` selects `/CRD/`. This review verified local build, not live deployment. Follow `PUBLISHING.md` for sanitized publishing that excludes private workspace/memory files.

## Quality and next boundaries

Build/smokes pass; lint has four existing errors. `CURRENT_STATE.md` records verification, the completed preparation fix, and deferred draft/starter/recycle findings.

Keep rules out of components and visibility separate from ownership. Extract complete preparation before training parity/network sync. Future P1/P2/Viewer rooms are plans, not implemented seats or abstractions.
