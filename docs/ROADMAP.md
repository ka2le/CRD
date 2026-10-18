# Roadmap

Source-reviewed baseline: 2026-10-18. Proposed work order; unresolved rules still require design decisions.

## Implemented

Both local human-versus-AI modes, four preparation effects, simultaneous combat, 27 playable definitions, Normal/Wild Deck, card art/tooltips, animations/masks, round playback/log/results, persisted settings, seeded/injected deck seams, Node/Python smoke bridge and Pages deployment configuration.

## Latest scope clarification and completed fix

The creator confirmed current CD 1 shields are correct, recycle is intended as one card for one player per game, and preparation is private without inter-player turns. Only the AI preparation completion fix was requested; other findings remain unchanged.

Completed: pressing Battle resolves all AI preparation, including special chains, before combat. The AI does not reveal intermediate preparation; unusable specials are skipped once. A pending human redraw must finish first. Regression smoke/build pass; the same four existing lint errors remain.

## 1. Deferred rules and state work

- Recycle pool/copy handling remains unchanged by request; keep singleton design intent recorded.
- Preserve final draft leftovers and alternate starting picker consistently.
- Preserve private, unordered preparation and the requirement that both hands be ready when combat starts.
- Clarify exhaustion behavior for custom/small decks.

## 2. Shared engine and quality

- Extract full preparation transitions/activation tracking from React.
- Add preparation to headless actions for browser parity.
- Validate external actions before future server use.
- Add interaction coverage for lethal, shields, doubling, copying and recycling.
- Resolve four current lint errors.

## 3. Content and AI

- Confirm existing special formulas/balance with the creator.
- Formalize `extra_turn` and `no_stats_to_2` before enabling them.
- Improve whole-hand AI evaluation and opponent-aware timing/counters.
- Add Gymnasium, observation/action encoding and reward after parity.
- Keep extra/monster sets as separate future scope.

## 4. Presentation

Continue layout/pacing polish with visual verification. Preserve ownership/visibility/playback boundaries. Review tooltip estimates against special combinations.

## 5. Multiplayer

Design authoritative state, rooms, P1/P2/Viewer, reconnect behavior and second-browser input. Add backend/sync after shared rules are consistent.

See `CURRENT_STATE.md` for findings/evidence. `PROJECT.md` remains the brief.
