# Current implementation review

Full review against local source on **2026-10-18**, with AI preparation/headless follow-ups through **2026-10-19**. `PROJECT.md` remains the project brief; `RULES.md` describes the shared rules and identifies unresolved differences. The implemented AI environment contract and latest verification are in `AI_ENVIRONMENT.md`; original dated verification below remains historical.

## What the game is

Critters Robots Dragons is a two-player hand-building card battler. Players combine class stats, matching attacks, and special effects into a small combat engine. They make decisions while building and preparing their hands; combat then runs automatically in simultaneous rounds. The current browser app pairs one human with a heuristic AI.

The three classes have different base attack rhythms: Critters deal 1 per matching stat every round, Robots deal 2 every second round, and Dragons deal 3 every third round. Those base attacks have equal long-run output per stat, but different first-hit times and lethal breakpoints. Multiple matching attack cards each use the whole matching stat total. Stats without an attack do not deal damage by themselves.

## The two modes

| Mode | Hand building | Main decisions | Shared next phase |
| --- | --- | --- | --- |
| 5 Hand Discard | Start with five cards; submit two discard/refill passes, choosing zero through five cards each time | Keep a coherent combination; trade weak cards for uncertain replacements | Optional pre-battle specials, then automatic combat |
| Draft | Reveal five cards; each side picks one; clear the remaining three; repeat for five packs | Build synergy from a shared row; the first pick changes what remains for the other side | Optional pre-battle specials, then automatic combat |

Both modes draw from one shuffled deck shared by the two sides. In discard mode the human refills first, then the AI resolves one discard/refill pass on that same submission. A zero-card submission still spends one of the two passes. The AI normally aims to discard two cards, with exceptions for attacks its heuristic strongly values.

Draft alternates the pack's first picker. The intended rule also alternates the first picker between games; see the initialization issue below. Drafted hands are visible. In discard mode, opponent visibility is a menu setting. Five cards is the hand-building target; draw/recycle specials can increase the actual combat hand beyond five.

## Pre-battle preparation

`src/game/preBattle.js` recognizes four card IDs. Eligibility is explicitly by ID, rather than a universal interpretation of all CD 0 cards.

- `draw_2_extra`: add up to two cards from the remaining deck; the source card stays in hand.
- `draw_all_new_1`: discard the entire current hand, including the source, then draw that many plus one.
- `copy_card_in_hand`: transform the source into another non-copy card in the same hand. Its new UID lets a copied pre-battle special activate independently, even if the original was already used.
- `recycle_card`: select a card from the available discard list and append it to hand; the source stays in hand.

The creator clarified that preparation is private and has no turn order between players. The human chooses their activation order and may skip unused specials by pressing Battle. At that boundary, `completeOpponentPreBattle` resolves every remaining AI special, including newly drawn/copied/recycled specials, with heuristic copy/recycle targets. The updated hand/deck and combat-start flag commit atomically. Unusable specials are skipped once. AI preparation is not committed/revealed during the human preparation window. Battle waits for any human redraw already in progress.

## Combat implemented today

`src/game/engine.js` computes a complete battle history before the UI plays it back. Hands and stats stay fixed throughout combat; there are no combat-time choices or draws.

Each round: find positive-CD action cards whose CD divides the round; sum each side's active shield; calculate attacks and special damage; multiply the whole outgoing total for each active `double_dmg`; subtract the defender's shield, floored at zero; apply both sides' damage simultaneously; check the outcome.

The loss threshold is 21 damage taken. If both reach it in the same round, higher cumulative **damage actually dealt after shields** wins; equal totals tie. If neither loses by the end of round 50, the result is a tie regardless of who leads. Shield expires each round and unused prevention does not accumulate.

## Cards and deck

- `data/cards.json` contains 30 definitions, including preserved unsupported cards and a card-back utility.
- `CORE_CARD_IDS` in `src/game/cards.js` selects 27 playable definitions.
- Normal deck: **70 cards**. Wild Deck: **102 cards**.
- Wild Deck increases definitions with `copies: 1` to three copies; it leaves all other copy counts unchanged.
- Browser defaults: Draft, Show Opponent Cards enabled, Wild Deck enabled. Settings persist in localStorage; changing any setting creates a fresh game.
- All 88 unique images are archived locally and rendered from optimized WebP derivatives via `data/image-manifest.json`; source URLs remain as provenance. Original/game totals: 550.98/4.06 MiB. Builds verify assets offline; see `ASSETS.md`. Rules have no image dependency.

Implemented effects include base/multi/double stats, class attacks and ultimates, flat Bite damage, Devour, shield, round damage doubling, shield-based damage, product-of-three-class damage, sum-of-class damage, and the four preparation cards. Exact values are listed in `CARD_LIBRARY.md`.

`extra_turn` and `no_stats_to_2` are preserved in the JSON but excluded from the playable pool. `backside` is a utility definition, also excluded. Extra/monster sets are outside the current import.

## Architecture and AI

React 19 and Vite provide a static frontend. Pure JS modules under `src/game/` own decks, mode transitions, combat, and evaluation. `useGameSession.js` owns reducer-backed session state and much of preparation orchestration. `useDraftFlowEffects.js`, `draftMotion.js`, and the card motion context coordinate animation; explicit visibility masks allow logical state to advance ahead of a card's flight. `useBattlePlayback.js` calls the simulator and displays its round history.

The AI is hand-written, not trained. It scores average damage improvements, matching class stats/attacks, and selected utility bonuses/penalties. Draft, discard, copy, and recycle reuse this evaluator. It does not simulate the opposing hand to choose counters or accurately value all effect combinations: its average-damage estimate omits whole-hand doubling and approximates shield timing.

`headlessGame.js` and `scripts/headless-worker.mjs` now expose validated decisions for either or both seats through both modes and full preparation. Source/target choices, activation order, skips, copied/acquired specials and finishing are explicit actions. Shared preparation transitions also drive the browser reducer. Default terminal evaluation is the actual 21-damage/50-round game with +1/0/-1 outcomes; 12/999 remains an explicit diagnostic override. Python has a persistent bounded client, Gymnasium numeric observations/history, variable candidates/masks and deterministic replay. Fair hidden-world sampling, rollout search, a model and a training loop remain future work. `AI_ENVIRONMENT.md` gives commands, API, privacy boundaries and verification.

GitHub Pages build/deployment configuration exists. This review did not inspect a live deployment. No backend, rooms, second-human input, seat selection, networking, or spectator implementation exists yet.

## Open issues and decisions to resolve

The initial review findings below are retained with their follow-up disposition. The creator requested only the preparation fix; other behavior remains unchanged:

1. **Shield timing differs from the original brief.** The creator's description explains an every-other-round defense that counters Robots. Current `shield2` data has `cd: 1`, preventing two damage every round. The creator subsequently confirmed current CD 1 shield behavior is correct; no shield change is needed.
2. **Recycle pools are asymmetric snapshots.** In discard mode, the human's `playerDiscards` includes both sides' discards, while `opponentDiscards` contains only AI discards. In draft, both preparation lists begin as separate copies of the shared draft discard. Taking a card removes it only from that side's list, so the same physical UID can potentially be claimed by both sides. A single authoritative shared pile is not implemented end to end. The creator clarified recycle is intended as one card usable by only one player per game, and requested recycle/pool handling remain unchanged for this task.
3. **Final draft leftovers disappear.** `finalizeIfDraftComplete()` clears the final row immediately, skipping `commitDraftDiscard()`. A standard five-pack draft records only 12 of the 15 unpicked cards in `draftDiscard`, affecting recycle eligibility.
4. **Opening draft starter repeats.** Initialization creates a human-first draft and leaves `nextDraftStartingPicker` at `player`; the first New Game is therefore also human-first. Later draft resets toggle it. Mode/settings changes also do not consume that toggle consistently.
5. **Preparation fixed.** There is no inter-player turn order; preparation is private. Battle completes all AI specials synchronously before combat, including acquired specials; empty recycle/no-target copy is marked skipped. Unused human specials remain skipped. The delayed AI activation timer was removed.
6. **Headless follow-up implemented.** Preparation choices, browser reducer parity, either-seat control, action validation, normal outcomes and Gymnasium are covered. Privileged host forks preserve real hidden state; they must not be used as fair search until observation-consistent resampling exists.
7. **Coverage expanded, not exhaustive.** Original Devour/AI-chain regressions remain. New suites cover preparation order/targets/chains, browser pending redraw behavior, invalid actions, privacy, combat timing features, exact rewards, Gymnasium and deterministic replays. Full card-interaction balance and browser animation visuals are not exhaustively verified by these tests.

## Verification on 2026-10-18

| Check | Result |
| --- | --- |
| `npm run build` | Passed |
| `npm run regression:smoke` | Passed |
| Python headless smoke, draft, seed 7 | Completed five player picks; evaluated 12 rounds |
| Python headless smoke, five-hand-discard, seed 7 | Completed two passes; evaluated 12 rounds |
| `npm run lint` | Failed with four existing errors |

Lint locations: `CardMotionContext.jsx` (mixed component/helper exports), `useBattlePlayback.js` (state reset in effect), `usePrevious.js` (ref access during render), and `vite.config.js` (`process` missing from lint globals).

The initial review changed documentation only; the follow-up changed AI preparation at the Battle boundary and added regressions. Build and expanded regression smoke pass; lint retains the same four pre-existing errors. Draft, starter, shields, recycle pool/copy counts and headless behavior were left unchanged. Browser layout, animation timing, and live deployment were not visually verified.

Later verification (2026-10-19): lint is clean after the UI redesign; build/original regressions pass. The preparation/headless/Gymnasium work passes 11 JS tests (144 seeded replay cases), six Python integration tests (48 replays plus both-mode/seat checkers), and two further 100-episode smokes. Deferred recycle/pile, draft leftover/starter and custom exhaustion findings remain. No trained model, rollout teacher or publishing is included.
