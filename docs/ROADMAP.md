# Roadmap

**2026-10-21 completed:** three-mode implementation and3,400-game tabletop search study. V2draws3.0%Draft/2.8%Discard. `TABLETOP_BALANCE_RESULTS.md` records conditional faction/strategy outcomes and limitations; next is human playtesting and NormalDeck/policy robustness, not automatic equalization of faction win counts.

2026-10-21: three tabletop modes use the confirmed smaller damage scale; see `TABLETOP_MODE.md`. `scripts/tabletop-balance.mjs` collects actual browser-search self-play, including preparation, with real mode-specific decks, fixed budgets, durable decision records and independent decision probes. `TABLETOP_BALANCE_RESULTS.md` records the completed comparison. Earlier balance numbers below concern superseded rules/decks. Digital AI training remains separate and paused.

Source-reviewed baseline: 2026-10-18. Proposed work order; unresolved rules still require design decisions.

## Implemented

2026-10-19: optional tabletop scoring for both Draft and Discard, converted card symbols, main-type commitment, integer specials, tabletop-aware browser AI and immediate result formulas. See `TABLETOP_MODE.md`. Balance playtesting remains future work; offline AI training continues using digital combat.

Both local human-versus-AI modes, four preparation effects, simultaneous combat, 27 playable definitions, Normal/Wild Deck, card art/tooltips, animations/masks, round playback/log/results, persisted settings, seeded/injected deck seams and Pages deployment configuration. Added 2026-10-19: full preparation decision API shared with browser, either-seat headless control, normal outcomes/rewards, private observations/history, persistent worker v2 and tested Python/Gymnasium variable-action wrapper. See `AI_ENVIRONMENT.md`.

## Latest AI planning - 2026-10-19

**2026-10-20 paused v6:** the18,000-family/30,000-game/83.15m-outcome corpus is complete. The creator requested stopping after data; training had auto-started and was halted at epoch14 (best10). Checkpoint preserved. No strength comparisons. Resume only when asked. Browser integration remains separate.

Newest completed step: large draft-only corpus, ~100k and four-hidden-layer/~150k W/D/L nets, two600-second training runs and neural-assisted search versus frozen base search (`AI_DRAFT_V2.md`). Both improve the tested base search; extra depth's strength advantage is inconclusive. All candidate evaluations contribute, with public unseen composition/relative-hand inputs and actual search-game returns. Next improve searched-opponent calibration/independent coverage, test learned cutoffs and browser integration. No arbitrary risk reward or actual future-pack access.

Current priority supersedes the broader sequence below: Draft picks only; heuristic preparation. First mixed self-play corpus, trained NumPy residual network and paired unseen-deal tournaments are complete (`AI_DRAFT_EXPERIMENT.md`). Search beats heuristic in the initial tournament; neural improvement over linear/search is not established. Next improve independent deal coverage, label quality and fresh held-out comparisons before browser promotion or broader decision learning.

The creator requested search with a mathematical baseline and neural correction. The full-decision/Gymnasium slice and first observation-conditioned sampler/rollout teacher are implemented; `AI_SEARCH.md` gives commands/assumptions. Next: broader grouped corpus and held-out evaluation -> residual value network -> refined beliefs/deeper search/self-play -> browser worker. Host forks preserve real hidden state and are not unseen-world samples. The tabletop browser mode is implemented separately; historical chart studies do not define its rules.

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
- Gymnasium and the observation-conditioned root-rollout teacher now work. Expand grouped data/evaluation, then fit the residual model; refine priors and batch/deepen search as evidence warrants. Do not use privileged exact-world forks as unseen samples.
- Keep extra/monster sets as separate future scope.

## 4. Presentation

Continue layout/pacing polish with visual verification. Preserve ownership/visibility/playback boundaries. Review tooltip estimates against special combinations.

## 5. Multiplayer

2026-10-20: optional trusted-player rooms, host-authoritative browser state, second-human input, local persistence/reconnect and simple Cloudflare relay implemented locally. Cloudflare deployment/Turnstile setup and sanitized GitHub Pages publishing are complete; production room creation and refresh recovery verified. The subsequent flow update adds open/private rooms, automatic joining/start, viewers, kicking, names/wins and offline guest takeover. Host migration and accounts remain outside scope. See `MULTIPLAYER.md`.

See `CURRENT_STATE.md` for findings/evidence. `PROJECT.md` remains the brief.
