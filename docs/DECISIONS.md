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
