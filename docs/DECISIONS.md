# DECISIONS.md

## Larger net, search opponents and unknown future packs — 2026-10-19

Creator requested much more training data, about 100k parameters and each evaluation contributing a training example. Implemented 220→256→160→3 W/D/L residual evaluator (98,842 fitted parameters); store one numeric row per candidate, with all individual rollout outcomes represented exactly by W/D/L counts in cross-entropy. Add actual search-play returns for chosen actions; keep their correlated/weighted nature explicit. Actual collection/opponents use frozen base search, with limited exploration on one side. Main strength criterion is neural-assisted search against base search at equal budgets, not beating heuristic or reducing prediction error alone. Preparation remains heuristic. Search samples possible unknown packs independently of the real deck; added explicit draft future-deck/seed isolation regression. `AI_DRAFT_V2.md` records the current large run and commands. No arbitrary reward for safe/risky play; maximize expected actual match score given relative hands and chance.

## Draft-only learning milestone — 2026-10-19

Creator narrowed initial AI learning to Draft picks, retaining existing heuristic preparation/card activation. Implemented mixed heuristic/random/search self-play labels, family-disjoint supervised fitting and paired unseen-deal tournaments. Use a small NumPy residual MLP with a calibrated linear outcome prior for the first working model, avoiding an additional framework dependency. General preparation/discard interfaces remain available but are outside this learning milestone. Search demonstrates gains over heuristic; neural gains are not established, so no browser promotion. `AI_DRAFT_EXPERIMENT.md` records commands/evidence and next experiments.

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

## Continued sampler/teacher implementation - 2026-10-19

- Creator asked to continue. Added stateless `sample`/`evaluate` paths receiving permitted observation/public sorted pool plus an independent planning RNG, without looking up the live session.
- Sample unseen cards without replacement; reconstruct/condition known preparation outcomes. Unknown earlier private preparation uses random feasible proposals, not a claimed exact strategic posterior. Fail explicitly on contradictions/guards rather than generating fake outcome labels.
- Compare every root action with paired complete continuations and exact battles. Report WDL mean/uncertainty, heuristic baseline value and paired residual targets. This is a shallow rollout teacher; deeper information-set search and model remain future work.
- Added Python evaluator method, rollout-controlled episode driver and optional grouped dataset/replay output. Group the same physical deal across modes/seats before splitting labels.
- Verified 802 sampled decision roots; full suites now 14 JS/eight Python tests. Pilot: 40 games / 20 deal families, 230 states / 2,269 action targets / 36,304 continuations. See `AI_SEARCH.md`; no held-out strength claim or neural training.

## Tabletop battle mode adopted - 2026-10-19

- Creator requested a persisted menu toggle for both Draft and Discard, leaving digital round combat available. Ordinary attacks give 2 per matching stat with no CD or rounds; compare one final score.
- Commit the largest class contribution before reveal; equal contributions require tapping a stat/attack card. Multi-class cards expose their eligible types. Devour additionally allows Dragon commitment.
- Each enemy shield card removes Critter 2 / Robot 1 / Dragon 0 power, floored at zero. Apply cumulative bonuses after shields: Critter +1 if positive; Robot +2 at 7 and +1 more at 11; Dragon +4 at 11 and +2 more at 14. Creator explicitly confirmed Robot 11 to match the concurrently updated score card, replacing the initial prompt's 10.
- Creator approved integer specials: ultimates 4/stat, Bite 2, Punch doubles Robot attacks and gives +1 to each other positive attack per Punch, Devour 2/Dragon stat with type option, one shield per shield card. Shield damage uses own shield count; hybrids retain integer product/sum. Neutral-only power defaults to Robot.
- Formula cleanup requested: hide zero shield/bonus terms, use broken hearts for bonus, show only final damage when unmodified. Implemented in both result overlay and table strip. See TABLETOP_MODE.md.

## Tabletop Devour ultimate correction - 2026-10-19

Creator confirmed Devour and similar class ultimates should be double ordinary attacks:4 power per matching stat. Devour now joins Murder Rabbit, Robot Ultimate and Dragon Ultimate at4/stat; this supersedes the earlier2/stat Devour conversion. Its optional Dragon main-type override remains. Card symbols, scorer, inspect/help and tests agree.
