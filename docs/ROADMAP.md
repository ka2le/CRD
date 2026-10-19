# Roadmap

Source-reviewed baseline: 2026-10-18. Proposed work order; unresolved rules still require design decisions.

## Implemented

Both local human-versus-AI modes, four preparation effects, simultaneous combat, 27 playable definitions, Normal/Wild Deck, card art/tooltips, animations/masks, round playback/log/results, persisted settings, seeded/injected deck seams and Pages deployment configuration. Added 2026-10-19: full preparation decision API shared with browser, either-seat headless control, normal outcomes/rewards, private observations/history, persistent worker v2 and tested Python/Gymnasium variable-action wrapper. See `AI_ENVIRONMENT.md`.

## Latest AI planning - 2026-10-19

The creator requested search guided by mathematical evaluation plus a neural correction. `AI_TRAINING.md` replaces the earlier 12-round damage objective with actual win/draw/loss. The shared decision environment and Gymnasium first slice are implemented. Next: observation-consistent hidden-world sampler -> sampled-rollout teacher -> residual value network -> self-play/tournaments -> browser Web Worker. Host forks preserve actual hidden state and must not substitute for fair sampling. Tabletop chart work remains a separate unapproved proposal.

## Earlier scope clarification and completed fix

The creator confirmed current CD 1 shields are correct, recycle is intended as one card for one player per game, and preparation is private without inter-player turns. Only the AI preparation completion fix was requested; other findings remain unchanged.

Completed: pressing Battle resolves all AI preparation, including special chains, before combat. The AI does not reveal intermediate preparation; unusable specials are skipped once. A pending human redraw must finish first. Regression smoke/build pass; the same four existing lint errors remain.

## 1. Deferred rules and state work

- Recycle pool/copy handling remains unchanged by request; keep singleton design intent recorded.
- Preserve final draft leftovers and alternate starting picker consistently.
- Preserve private, unordered preparation and the requirement that both hands be ready when combat starts.
- Clarify exhaustion behavior for custom/small decks.

## 2. Shared engine and quality

- Complete: shared preparation transitions, headless actions, either-seat control and external action validation, with browser reducer parity coverage.
- Harden/extend the simulation protocol as future server/search requirements become concrete.
- Add interaction coverage for lethal, shields, doubling, copying and recycling.
- Preserve clean lint from the 2026-10-18 UI redesign; the earlier four-error review is historical.

## 3. Content and AI

- Confirm existing special formulas/balance with the creator.
- Formalize `extra_turn` and `no_stats_to_2` before enabling them.
- Improve whole-hand AI evaluation and opponent-aware timing/counters through the staged search/residual-value plan in `AI_TRAINING.md`.
- Gymnasium and outcome rewards now work. Add observation-consistent world sampling and batched rollout search before training; do not use privileged exact-world forks as fair AI.
- Keep extra/monster sets as separate future scope.

## 4. Presentation

Continue layout/pacing polish with visual verification. Preserve ownership/visibility/playback boundaries. Review tooltip estimates against special combinations.

## 5. Multiplayer

Design authoritative state, rooms, P1/P2/Viewer, reconnect behavior and second-browser input. Add backend/sync after shared rules are consistent.

See `CURRENT_STATE.md` for findings/evidence. `PROJECT.md` remains the brief.
