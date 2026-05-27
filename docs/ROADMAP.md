# ROADMAP.md

## Current Phase

Working prototype stabilization and incremental expansion.

## Current Baseline

The project now has a working local prototype with:
- modular React UI structure
- 5 hand discard mode
- draft mode
- battle playback
- first special-card support
- cleaned fresh-game/battle reset flow

The next work should build from this stable baseline rather than from old "broken prototype" assumptions.

## Phased Plan

### 1. Documentation + structure
- Keep project brief current
- Keep rules/architecture docs aligned with implementation
- Continue reducing drift in restart/status docs

### 2. Core engine
- Maintain 5 hand discard flow
- Maintain working draft flow
- Continue refining round simulation
- Expand damage/timing/effect support carefully
- Add more special timing details incrementally

### 3. Content integration
- Card JSON ingestion
- Refine and normalize `data/cards.json`
- Card image integration
- Validation of card behaviors

### 4. AI opponent
- Continue tuning the shared card-evaluator heuristics used by both draft and discard mode
- Improve draft heuristics
- Add simple battle heuristics where needed
- Reach a more competent baseline play pattern

### 5. UX polish
- Better flow
- Better combat readability
- Better replay loop
- Better animation/presentation without destabilizing logic
- Continue tuning draft pacing and battle playback feel from the current working polished baseline

### 6. Multiplayer evolution
- Room abstraction
- Seat selection
- P1 / P2 / Viewer support
- Backend integration later
