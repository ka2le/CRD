# Critters Robots Dragons - project brief

Last reconciled with local source: **2026-10-18**.

`PROJECT.md` is the main living brief. Keep supporting docs and implementation aligned when rules, scope, architecture or priorities change. The assistant identity in this workspace is **CRD_Dev**.

## Purpose and current stage

Build the creator's two-player board game as a modular digital card battler in React. The current implementation is a local, single-browser human-versus-heuristic-AI prototype with both hand-building modes, pre-battle specials and automatic simultaneous combat. Online multiplayer is future work.

For the complete implementation review, source pointers, known issues and verification, read `docs/CURRENT_STATE.md`. For a quick explanation, read `docs/GAME_OVERVIEW.md`.

## Game model

Players assemble combinations of class stats, matching attacks and special effects. Stats do not deal damage by themselves; each matching attack scales with the full matching stat total. Base Critter attacks deal 1 per stat every round, Robot attacks 2 every second round, and Dragon attacks 3 every third round. Their long-run rates match, but burst timing changes races and counterplay.

### Both modes are implemented

- **5 Hand Discard:** deal five to each side; submit two discard/refill passes, selecting any number including zero. The AI resolves one pass after each human submission, using the same remaining deck.
- **Draft:** reveal five shared cards; each side chooses one; discard the other three; reveal a new pack and reverse first picker. Five packs produce five cards each. The intended first-pack starter also alternates between games; current initialization has an exception.

Five cards is the hand-building target. Preparation can increase the eventual combat hand beyond five. Normal/Wild Deck is a copy-count option, not a third game mode.

### Preparation

Supported cards: `draw_2_extra`, `draw_all_new_1`, `copy_card_in_hand`, `recycle_card`. The human can activate eligible cards in a chosen order before Battle, or skip them. Copy transforms the source with a new identity, allowing copied preparation effects to activate independently. Preparation is private with no turn order between players. Pressing Battle resolves all remaining AI preparation atomically before combat, including newly acquired specials. Unused human specials are skipped. See `docs/RULES.md`.

### Combat

Combat resolves automatically with no player decisions. Positive-CD actions trigger on divisible rounds. Both sides generate shield/damage, whole-hand damage modifiers apply, opposing shield reduces damage, and both take damage simultaneously.

Taking 21 damage loses. Simultaneous lethal compares cumulative damage actually dealt after shields; equal totals tie. Without lethal by round 50, the result is a tie regardless of damage lead. Shield expires each round. Current hands/stats remain fixed in combat.

## Current implementation

- React 19 / Vite static frontend with modular components and JS game modules.
- 30 imported card definitions; 27 playable; 70-card Normal Deck or 102-card Wild Deck.
- Wild Deck changes one-copy playable definitions to three copies; other counts stay unchanged.
- Browser defaults: Draft, Wild Deck enabled, opponent cards visible. Menu settings persist; changing any setting starts a fresh game. Opponent hiding applies to pre-combat discard mode.
- Stat combinations, base/ultimate class attacks, Bite, Devour, shield, damage doubling, shield-based and hybrid damage, plus the four preparation effects.
- Shared heuristic evaluation for draft/discard/copy/recycle; no trained model.
- Art/icon card visuals, tooltips, draft flights/masks, battle playback, log and result popup.
- Playback accelerates for upcoming rounds above round 2, down to a minimum interval; old round-10 notes are obsolete.
- Seeded/injected deck support and a persistent Node JSON-lines worker with Python random-action smoke client.
- Headless currently skips preparation and evaluates 12 rounds at a 999 damage threshold by default; it is not full browser parity or a Gymnasium environment.
- Public repo / GitHub Pages publishing configuration exists. Live deployment was not checked in this review.

## Known differences and remaining work

These are documented findings, not newly approved rules:

1. The creator confirmed current shield behavior is correct: `shield2` blocks two every round at CD 1. This supersedes the historical cadence example below.
2. Recycle is intended to be a single card usable by only one player per game. The creator requested no recycle/pile/deck changes in this task; existing pool/copy handling remains as implemented.
3. Final draft completion drops the last three leftovers instead of recording them in discard.
4. Initial draft and first New Game both start human-first; later resets alternate, and settings/mode changes are inconsistent.
5. Fixed: Battle now completes AI preparation synchronously before combat. AI actions are not revealed during the human preparation window. Battle is disabled while an already-started human redraw is still resolving.
6. Full preparation remains partly in the React reducer and is missing from headless actions. Interaction coverage and external action validation need strengthening.
7. `extra_turn` and `no_stats_to_2` remain data-only/excluded. Extra and monster sets are not imported.
8. No backend, rooms, second-human input, spectators, Gymnasium wrapper or training loop exists yet.

The AI preparation fix is complete. Follow-up asset work archives all 88 source images in `assets/originals/` and serves optimized local WebP files through `data/image-manifest.json`. Originals total 550.98 MiB; game images total 4.06 MiB (99.3% smaller). Preparation reruns reuse saved originals and unchanged derivatives; production builds check assets offline. See `docs/ASSETS.md`. Draft bookkeeping, starter alternation, recycle/pool behavior and headless parity remain unchanged. `docs/ROADMAP.md` gives the proposed sequence.

## Architecture and future direction

Keep combat and mode rules in reusable `src/game/` modules. React components present state; the reducer/session layer coordinates flow, and dedicated hooks coordinate timing. Logical ownership and temporary visual visibility may differ during card flights; preserve explicit masks/suppression.

Keep cards data-driven and JavaScript as the source of truth for future Python/Gymnasium training. Extract remaining preparation orchestration from UI/session ownership before adding network play.

Continue using Git and publishing sanitized app snapshots to the public `CRD` repo. Follow `docs/PUBLISHING.md`; private workspace identity and memory files must stay excluded. Deployment targets GitHub Pages today; a future backend should support two browser users and P1/P2/Viewer rooms, initially with P2 defaulting to AI. This room/seat model is planned, not implemented.

## Verification on 2026-10-18

- Production build passed.
- Devour simultaneous-round regression smoke passed.
- Python/Node smoke completed Draft and 5 Hand Discard at seed 7.
- Lint failed with four existing errors; details in `docs/CURRENT_STATE.md`.
- Browser visuals, full card interaction coverage and live hosting were not verified.

The initial review updated documentation only. Follow-up: AI preparation now resolves at Battle in `completeOpponentPreBattle`; regression coverage includes draw/copy/redraw/recycle chains and unusable specials.

## Knowledge map

- `docs/CURRENT_STATE.md`: comprehensive source review and implementation limits.
- `docs/GAME_OVERVIEW.md`, `RULES.md`, `COMBAT.md`, `DRAFTING.md`: gameplay.
- `docs/CARD_SCHEMA.md`, `CARD_LIBRARY.md`, `ASSETS.md`: data, exact implemented cards, assets.
- `docs/ARCHITECTURE.md`, `AI_OPPONENT.md`, `AI_TRAINING.md`: code boundaries and AI.
- `docs/ROADMAP.md`, `DECISIONS.md`: next work and decisions.
- `docs/SESSION_HANDOFF.md`, `CODING_START.md`: restart maps.
- `docs/PUBLISHING.md`: publishing/deployment procedure.

## Working Rules For This Repository

- Keep `PROJECT.md` current
- Prefer updating docs as decisions become clear
- Keep implementation modular
- Keep rules logic separate from presentational React components
- Prefer data-driven card logic where practical
- Build for expansion, but do not overengineer too early
- Validate assumptions against this file when uncertain
- Keep the player-facing UI in-world and product-like rather than dev-demo-like
- Avoid developer subtitles or overly explicit implementation labels in the main UI
- Avoid instructional microcopy that sounds mechanical when cleaner game-language would do
- Remove unnecessary subtitles and state-explaining text when the interface already makes the state obvious
- Keep the whole game fitted to the screen in both portrait and landscape when possible
- Prefer internal scrolling only in contained areas like hands or battle logs, not page-level overflow
- Size cards so 5 cards fit side by side in both orientations and individual cards do not dominate the viewport height

## Game Description (user-provided, keep this in full)

So what we are doing here is developing a code based version of a board game i made called Critters Robots Dragons. The game will be described more later and we will have several files specifying how it works, what cards exist, rules, why its fun etc. For now lets just know that its a 2p game played by drafting cards and then simulating rounds of combat to find out who has the best hand. Quick rounds and then play again. The 3 Classes in the game are Critters, Robots and Dragons. The base is that there are stat cards that most often give 1 stat to one of these 3 classes, some cards give to more than one and some cards give 2 stats to a single class, very strong. And then for each class there are unique dmg cards, these only do dmg if you have stats. So a critter card typically does 1dmg per critter stat you have each round. Robot dmg card do 2 dmg evry other round and dragons do 3 dmg per dragon stat card every 3rd round. So basically balanced but with some strategy in regards to timing, there are for example shield cards that only exist as triggering every other round, so they line up perfectly with robots and counter them hard, and are not as effective vs dragons.
