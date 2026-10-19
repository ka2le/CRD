# DECISIONS.md

## Core decisions

- Build with React
- Work iteratively and modularly
- Start with AI opponent before multiplayer
- Keep project knowledge centralized in `PROJECT.md`
- Separate game logic from UI
- Prepare for room-based multiplayer with P1 / P2 / Viewer seats later

## Working implementation decisions

- `src/` lives at workspace root
- cards are rendered through reusable card components rather than one-off UI markup
- battle playback is handled through a dedicated playback-only hook (`src/hooks/useBattlePlayback.js`)
- draft flow is handled through an explicit game module/state flow (`src/game/draftMode.js`)
- session/game flow and pre-battle activation flow live under reducer-backed ownership in `src/hooks/useGameSession.js`
- timed draft sequencing is handled separately from pure draft transitions (`src/hooks/useDraftFlowEffects.js` + `src/hooks/draftMotion.js`)
- fresh-game and battle replay reset behavior is handled through app-level reset keys/session boundaries instead of patching individual display states ad hoc
- game state truth and visual visibility state are allowed to differ temporarily during card flights; explicit hand-card suppression is preferred over timing-race hacks
- row/hand visibility masking should be used when cards must remain hidden across intentional pacing pauses after animation, rather than letting render state snap back early
- draft and discard AI should share one evaluator/scoring layer where practical, instead of growing separate unrelated heuristics
- in 5 hand discard mode, opponent discard should resolve in sync with each player discard submission rather than being pre-resolved at game setup
- in 5 hand discard mode, discarded cards should feed the shared discard pile used by recycle behavior rather than splitting into a separate invisible pile for the opponent

## Current status decision

As of 2026-05-24, the prototype should be treated as **working** for restart/status documentation purposes.
Older notes describing draft/reset behavior as broadly broken were accurate during development, but are now historical and should not remain the default state description.

## Source reconciliation - 2026-10-18

Both modes, heuristic AI, shields and initial specials are implemented. `CURRENT_STATE.md` records the reviewed baseline and verification. The original shield cadence, complete shared recycle semantics and preparation ordering remain unresolved; documenting current code does not approve those behaviors as final rules.

The earlier shared-discard decision remains intent: current human/AI preparation lists do not yet implement one authoritative shared pool. Draft final leftovers and starter initialization also need fixes. No gameplay code was changed in this review.

## Creator clarification and preparation fix - 2026-10-18

- Current shields work as intended: retain CD 1, two prevention each round.
- Recycle is intended as one card usable by one player per game. No pile/copy/deck changes are requested now.
- Preparation is private and has no inter-player turn order. On Battle, all remaining AI preparation must be complete before combat.
- Implemented `completeOpponentPreBattle` at the Battle transition, resolving acquired-special chains and skipping unusable effects once. Removed delayed/revealed AI preparation. Block Battle while a human redraw is already resolving.
- Leave draft leftovers/starter behavior and headless preparation coverage unchanged in this task. These clarifications supersede earlier unresolved shield/order recommendations above.

## Creator AI direction and proposed implementation - 2026-10-19

- Creator requested a search-heavy AI with calculated card/hand contributions and a neural correction for contextual value, inspired by Stockfish's search/evaluation split.
- Proposed path is documented in `AI_TRAINING.md`: JS rules stay authoritative, Python/Gymnasium exposes the full decision game, sampled search generates value targets, and a small PyTorch residual evaluator learns unfinished-hand potential. Exact final combat needs no approximation.
- Proposed objective is actual win/draw/loss under current digital rules, replacing the earlier future-training suggestion to maximize 12-round damage. Existing diagnostic adapter behavior is unchanged.
- Hidden information requires observation-safe sampling and policies; do not search the actual shuffled deck or expose private preparation. Initial rollout search precedes any advanced information-set tree implementation.
- Extract full preparation and legal/either-seat transitions before collecting training data. Keep previously deferred rule/pile changes separate and version rules/data.
- This records the requested direction and a proposed implementation sequence, not approval of every model/search hyperparameter or a completed implementation. Tabletop rules remain a separate proposal.

## Environment implementation authorized - 2026-10-19

- Creator clarified that preparation order and copy/recycle targets require estimated-value decisions just like picks/discards, and asked to finish the environment and attach further pieces where easy.
- Implemented shared preparation actions: source/target activation, per-source skip, finish, and dynamically recomputed choices for acquired specials. Browser retains UI selection/animation state over those pure transitions.
- Headless can control either or both physical seats, preserving existing refill/private-preparation scheduling and deferred pile rules. Default objective now uses actual 21/50 outcomes; old 12/999 evaluation requires an explicit diagnostic override.
- Added protocol v2, per-seat safe observations/history, mechanical combat cycles, bounded Python transport, Gymnasium variable candidate/mask interface and versioned replays. Gymnasium/NumPy are isolated in `.ai-venv`; no neural model is added.
- Verified shared browser reducer preparation parity, order/identity/target behavior, privacy, validation, exact rewards, both modes/seats/pools and deterministic replay. Host forks are privileged exact-world regression tools; fair hidden-world resampling and rollout teacher remain next. See `AI_ENVIRONMENT.md`.
