# Critters Robots Dragons - project brief

Last full implementation review: **2026-10-18**. AI environment implemented **2026-10-19**.

`PROJECT.md` is the main living brief. Keep supporting docs and implementation aligned when rules, scope, architecture or priorities change. The assistant identity in this workspace is **CRD_Dev**.

## Purpose and current stage

Build the creator's two-player board game as a modular digital card battler in React. The current implementation is a local, single-browser human-versus-heuristic-AI prototype with both hand-building modes, pre-battle specials and automatic simultaneous combat. Optional trusted-player online rooms are implemented locally (2026-10-20), with a host browser and simple Cloudflare relay; the Cloudflare relay is deployed with Turnstile configured; sanitized frontend publishing is the remaining rollout step. Normal visits still start AI play immediately. See `docs/MULTIPLAYER.md`.

For the complete implementation review, source pointers, known issues and verification, read `docs/CURRENT_STATE.md`. For a quick explanation, read `docs/GAME_OVERVIEW.md`.

## Game model

Players assemble combinations of class stats, matching attacks and special effects. Stats do not deal damage by themselves; each matching attack scales with the full matching stat total. Base Critter attacks deal 1 per stat every round, Robot attacks 2 every second round, and Dragon attacks 3 every third round. Their long-run rates match, but burst timing changes races and counterplay.

### Both modes are implemented

- **5 Hand Discard:** deal five to each side; submit two discard/refill passes, selecting any number including zero. The AI resolves one pass after each human submission, using the same remaining deck.
- **Draft:** reveal five shared cards; each side chooses one; discard the other three; reveal a new pack and reverse first picker. Five packs produce five cards each. The intended first-pack starter also alternates between games; current initialization has an exception.

Five cards is the hand-building target. Preparation can increase the eventual combat hand beyond five. Normal/Wild Deck is a copy-count option, not a third game mode.

**Battle rules (2026-10-20):** Menu → Battle chooses **Battle** (round-by-round), **Threshold** or **Abilities** (`settings.tabletop`: false / 'threshold' / 'abilities'; the old `true` maps to Threshold). Threshold now gives the main faction one bonus after shields: Critter 2+ → +1, Robot 8+ → +3, Dragon 14+ → +6 (Shortcut grants it below the threshold; 2× doubles it). Abilities replaces the bonus with class abilities — Adapt (one pure Critter stat card becomes a Critter attack, applied automatically when it scores more), Perfect Balance (Robot stats = Robot attacks ≥1 → +3 after shields), Overwhelming (Dragon base power 14+ → +1 Dragon stat before shields) — and drops Shortcut and 2× from the deck; Chameleon stays. Shields (−2/−1/0) apply in both. The paragraph below describes the original toggle and its superseded bonus values.

**Optional tabletop battle (2026-10-19):** Menu → Tabletop battle applies to either hand-building mode. Ordinary attacks give 2 power per matching stat, with no cooldowns or rounds. Commit the largest contributing class (click a card when tied), subtract enemy shields at Critter 2 / Robot 1 / Dragon 0, then add cumulative bonuses on remaining power: Critter +1, Robot +2 at 7 / +3 total at 11 (confirmed update), Dragon +4 at 11 / +6 total at 14. Higher final score wins; equal scores tie. Card icons, inspect/help, AI evaluation and result formulas follow the selected rules; formulas hide zero terms and use broken hearts for bonuses. The creator approved integer special conversions; balance remains experimental. See `docs/TABLETOP_MODE.md`.

### Preparation

Supported cards: `draw_2_extra`, `draw_all_new_1`, `copy_card_in_hand`, `recycle_card`. The human can activate eligible cards in a chosen order before Battle, or skip them. Copy transforms the source with a new identity, allowing copied preparation effects to activate independently. Preparation is private with no turn order between players. Pressing Battle resolves all remaining AI preparation atomically before combat, including newly acquired specials. Unused human specials are skipped. See `docs/RULES.md`.

### Combat

Combat resolves automatically with no player decisions. Positive-CD actions trigger on divisible rounds. Both sides generate shield/damage, whole-hand damage modifiers apply, opposing shield reduces damage, and both take damage simultaneously.

Taking 21 damage loses. Simultaneous lethal compares cumulative damage actually dealt after shields; equal totals tie. Without lethal by round 50, the result is a tie regardless of damage lead. Shield expires each round. Current hands/stats remain fixed in combat.

## Current implementation

- React 19 / Vite static frontend with modular components and JS game modules.
- 30 imported card definitions; 27 playable; 70-card Normal Deck or 102-card Wild Deck.
- Tabletop mode additionally includes Shortcut and Chameleon from `data/tabletop-cards.json`: 29 playable definitions, 72 Normal / 108 Wild cards. Each new card has one normal copy (three in Wild). Shortcut counts the earned faction bonus two tiers higher after shields (changed 2026-10-20 from one tier); Chameleon opens a three-faction picker and applies the selected faction's bonus/shield rule to the whole hand. See `docs/TABLETOP_MODE.md` for tier caps, zero-power behavior and assets.
- Wild Deck changes one-copy playable definitions to three copies; other counts stay unchanged.
- Browser defaults: Draft, Wild Deck enabled, opponent cards visible. Menu settings persist; changing any setting starts a fresh game. Opponent hiding applies to pre-combat discard mode.
- Stat combinations, base/ultimate class attacks, Bite, Devour, shield, damage doubling, shield-based and hybrid damage, plus the four preparation effects.
- Browser uses shared heuristic evaluation for draft/discard/copy/recycle. Offline draft-only search and a first trained NumPy residual model now work; see `docs/AI_DRAFT_EXPERIMENT.md`.
- Art/icon card visuals (borderless, near-square cards; brass-on-navy style matching the app icon), fit-to-screen table layout (pack/hand hero zones), HUD rails with stats, health and turn indicator, shuffle/deal/flip/FLIP/flight animations, battle charge pips, damage orbs, speed/skip, result banner, card inspect (long-press) and a visual help sheet. See `docs/UI.md`.
- Playback accelerates for upcoming rounds above round 2, down to a minimum interval; old round-10 notes are obsolete.
- Seeded/injected deck support and a persistent Node JSON-lines worker with Python random-action smoke client.
- Headless exposes both modes and every preparation decision, either-seat control, private observations/history and normal 21/50 outcomes. Python/Gymnasium supplies numeric features, dynamic candidates/masks and replays. Observation-conditioned rollout search compares all root actions without querying the real deck; see `docs/AI_ENVIRONMENT.md` and `docs/AI_SEARCH.md`. The first trained draft-only model and tournament workflow are documented in `docs/AI_DRAFT_EXPERIMENT.md`.
- Public repo / GitHub Pages publishing configuration exists. Live deployment was not checked in this review.

## Known differences and remaining work

These are documented findings, not newly approved rules:

1. The creator confirmed current shield behavior is correct: `shield2` blocks two every round at CD 1. This supersedes the historical cadence example below.
2. Recycle is intended to be a single card usable by only one player per game. The creator requested no recycle/pile/deck changes in this task; existing pool/copy handling remains as implemented.
3. Final draft completion drops the last three leftovers instead of recording them in discard.
4. Initial draft and first New Game both start human-first; later resets alternate, and settings/mode changes are inconsistent.
5. Fixed: Battle now completes AI preparation synchronously before combat. AI actions are not revealed during the human preparation window. Battle is disabled while an already-started human redraw is still resolving.
6. Shared preparation/headless transitions are tested against the browser reducer. React retains presentation/animation orchestration. Observation-conditioned sampling and shallow rollout evaluation are implemented; belief refinement, broader datasets, neural learning and deeper search remain next.
7. `extra_turn` and `no_stats_to_2` remain data-only/excluded. Extra and monster sets are not imported.
8. Optional two-player rooms and a minimal relay are implemented locally; Cloudflare/GitHub publishing remains pending. Spectators and browser neural inference remain future work. See `docs/MULTIPLAYER.md`.

The AI preparation fix is complete. Follow-up asset work archives all 88 source images in `assets/originals/` and serves optimized local WebP files through `data/image-manifest.json`. Originals total 550.98 MiB; game images total 4.06 MiB (99.3% smaller). Preparation reruns reuse saved originals and unchanged derivatives; production builds check assets offline. See `docs/ASSETS.md`. Headless now supports full preparation decisions and the Gymnasium interface; deferred draft bookkeeping, starter alternation and recycle/pool behavior remain unchanged. `docs/ROADMAP.md` gives the proposed sequence.

## Architecture and future direction

### Tabletop battle mode (2026-10-19)

**Current implementation:** the creator requested the simpler power-minus-shields-plus-bonus candidate as an optional browser mode for Draft and Discard, with approved integer special conversions. `docs/TABLETOP_MODE.md` is the active rules and source reference. Digital round combat remains the default and offline training scope. The earlier ordinal chart and finish-time proposals below are historical alternatives, not the implemented scoring or balance evidence.

Updated tabletop ultimate rule: Devour, Murder Rabbit, Robot Ultimate and Dragon Ultimate all deal **4 power per matching stat**, double an ordinary attack. Devour retains its optional Dragon main-type override.

Updated tabletop 2× card: **double the earned main-faction bonus after shields**, printed as **2 × star** using the supplied local star icon. Base power and faction contributions stay unchanged. Copies stack ×2/×4/×8 on the bonus; no earned bonus means no effect. This replaces the prior Robot-attack doubling/+1-per-other-attack conversion.

Development checks can jump straight to prepared hands/results with `crdDev.prepare()` / `crdDev.result()` or `?scenario=…&at=result`; these shortcuts are development-only. Prefer these to manually playing matches for UI verification.

The creator accepts balance shifts and integer special-card redesigns to keep hand arithmetic simple. `docs/TABLETOP_COMBAT_DESIGN.md` preserves the superseded ordinal chart and finish-time explorations; earlier diagnostic percentages do not evaluate the implemented mode. Menu → Score card shows two reference designs using the confirmed thresholds (Critter +1, Robot +2 at 7 / +3 at 11, Dragon +4 at 11 / +6 at 14). See `docs/UI.md`.

Keep combat and mode rules in reusable `src/game/` modules. React components present state; the reducer/session layer coordinates flow, and dedicated hooks coordinate timing. Logical ownership and temporary visual visibility may differ during card flights; preserve explicit masks/suppression.

Keep cards data-driven and JavaScript authoritative for Python/Gymnasium simulation. Pure preparation decisions now live in `src/game/preparationState.js`; the browser owns target-picker/animation orchestration. Build future search/network interfaces on these shared rules.

### Search and neural AI plan (2026-10-19)

**Paused v6 data run (2026-10-20):** collection completed before the creator asked to stop at the data boundary. The corpus has18,000 families,30,000 games,346,267 search roots,2,598,465 choice rows and83,150,880 outcomes. Training auto-started before the stop request arrived; it was halted at epoch14 (best validation epoch10). Checkpoint: `v6-best-at-user-stop.npz`. No tournaments or v6 strength results. Status=`stopped_after_collection`. Do not restart unless requested. See `docs/AI_FULL_GAME_V6.md`. Browser unchanged.

**Current active continuation:** creator asked to create more data and continue the four-hidden-layer model. `docs/AI_DRAFT_V3.md` records8,000 new families /720,000 new candidate rows /23.04m new simulated outcomes, mixed base/frozen-v2-neural search self-play, and a1,200-second warm-start run over old plus new training data. Architecture remains149,650 parameters; normalization/prior/weights continue from v2 best, optimizer restarts. Stable family splits preserve old validation/test; source roots are namespaced. Frozen v2 neural search is the new tournament opponent. Work is active in `.ai-runs/draft-v3/`; do not claim improvement before fresh results.

**Latest completed AI experiment:** creator requested much more data, every candidate evaluation used, ~100k parameters, longer training and base-search opponents, then a four-hidden-layer/~150k comparison. `docs/AI_DRAFT_V2.md` records the completed 4,000-family /360,000-row /11.52m-continuation corpus and two600-second training runs: 98,842 parameters (two hidden layers) and149,650 (four). Fresh confirmation across500 deals /2,000 games per arm, equal16-sample budgets: base reference50.65%, shallow-assisted53.05%, deep-assisted53.50%. Paired gains versus base: +2.40pp (approx95% +1.30..+3.50) and+2.85pp (+1.87..+3.83). Depth advantage+0.45pp is inconclusive. Draw 2 test value error falls29%/42% versus the fitted linear prior. Checkpoints/reports are in `.ai-runs/draft-v2/`; browser AI is still heuristic. Search samples hypothetical future packs independently of the actual deck/seed; regression-tested. W/D/L utility learns relative-hand risk and future potential without a risk bonus. Heuristic-completion counterfactual labels and actual search-play returns remain explicitly distinct. Prior v1 notes below are historical.

**Latest scope and implementation:** the creator narrowed the first milestone to Draft picks, with existing heuristic card activation/preparation. `python/draft_experiment.py` collects mixed heuristic/random/rollout self-play labels and runs paired seat/first-picker tournaments. `python/train_draft.py` fits a 64-unit NumPy residual MLP over a calibrated linear prior, using existing dependencies. First corpus: 80 deal families, 3,200 draft states, 115,200 simulated continuations. On 100 separate deals / 400 games against heuristic: 16-sample rollout scores 79.25%, neural alone 55%, linear 55.75%; neural-assisted root ranking 80.125%, without established improvement over rollout. Models/reports are local in `.ai-runs/draft-v1/`. See `docs/AI_DRAFT_EXPERIMENT.md` for commands and limitations. Browser AI stays heuristic. General preparation/discard search exists but is outside the immediate learning milestone. The paragraphs below document the previous stages; their "no model yet" statements are historical.

The creator requested a Stockfish-inspired search-plus-neural-evaluation approach. Proposed design: exact shared JS rules and terminal combat, search over drafting/discard/preparation choices with sampled unseen draws, and a small Python/PyTorch value network correcting a mathematical/completion baseline at unfinished cutoffs. Learn contextual future potential and opponent responses rather than relearning damage arithmetic. Optimize actual win/draw/loss, not the existing headless 12-round damage diagnostic.

`docs/AI_TRAINING.md` gives the staged plan. Preparation decisions, either-seat simulation and Gymnasium are implemented; `docs/AI_ENVIRONMENT.md` gives commands. After the creator asked to continue, added stateless observation-conditioned world sampling and all-action rollout evaluation with exact battles, paired samples, baseline/residual targets and grouped dataset output. `docs/AI_SEARCH.md` describes this first teacher and its approximate belief assumptions. Host forks preserve actual hidden state and are not used as unseen samples. Next: broader grouped data/held-out evaluation, residual model fitting, better beliefs/deeper search and browser inference. Keep seeds/private state outside policy inputs. Tabletop rules remain separate.

Verification: build/lint/original regressions, 14 JS tests (144 replay cases and 802 sampled roots), eight Python tests (checker coverage, 48 replays and teacher isolation/grouping) and 200 extra random episodes pass. Rollout pilots: 40 games, 230 decision states, 2,269 action targets and 36,304 completed continuations, sharing 20 deal families; not held-out strength proof. Gymnasium/NumPy and pilot files are ignored local outputs; no PyTorch/model training added.

Continue using Git and publishing sanitized app snapshots to the public `CRD` repo. Follow `docs/PUBLISHING.md`; private workspace identity and memory files must stay excluded. Deployment targets GitHub Pages today; a future backend should support two browser users and P1/P2/Viewer rooms, initially with P2 defaulting to AI. This room/seat model is planned, not implemented.

## Verification on 2026-10-18

- Production build passed.
- Devour simultaneous-round regression smoke passed.
- Python/Node smoke completed Draft and 5 Hand Discard at seed 7.
- Lint failed with four existing errors; details in `docs/CURRENT_STATE.md`. Fixed by the 2026-10-18 UI redesign: lint is now clean.
- Browser visuals, full card interaction coverage and live hosting were not verified.

The initial review updated documentation only. Follow-up: AI preparation now resolves at Battle in `completeOpponentPreBattle`; regression coverage includes draw/copy/redraw/recycle chains and unusable specials.

## Knowledge map

- `docs/CURRENT_STATE.md`: comprehensive source review and implementation limits.
- `docs/GAME_OVERVIEW.md`, `RULES.md`, `COMBAT.md`, `DRAFTING.md`: gameplay.
- `docs/CARD_SCHEMA.md`, `CARD_LIBRARY.md`, `ASSETS.md`: data, exact implemented cards, assets.
- `docs/ARCHITECTURE.md`, `AI_OPPONENT.md`, `AI_TRAINING.md`: code boundaries and AI plan; `AI_ENVIRONMENT.md`: worker/Gymnasium; `AI_SEARCH.md`: sampler/rollout teacher and dataset commands.
- `docs/UI.md`: table layout, HUD, visual language and animation system.
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
- Keep the whole game fitted to the screen in both portrait and landscape; mobile portrait is the primary target
- Prefer internal scrolling only in contained sheets (discard pile, help), not page-level overflow
- Cards should take most of the screen: size them with the fit helpers in `src/hooks/useFitLayout.js` (the hero zone gets the space, rows overlap beyond 5 cards) rather than fixed breakpoints
- Explain with symbols, colour, position and motion before text; keep extra info behind long-press inspect or the help sheet (see `docs/UI.md`)

## Game Description (user-provided, keep this in full)

So what we are doing here is developing a code based version of a board game i made called Critters Robots Dragons. The game will be described more later and we will have several files specifying how it works, what cards exist, rules, why its fun etc. For now lets just know that its a 2p game played by drafting cards and then simulating rounds of combat to find out who has the best hand. Quick rounds and then play again. The 3 Classes in the game are Critters, Robots and Dragons. The base is that there are stat cards that most often give 1 stat to one of these 3 classes, some cards give to more than one and some cards give 2 stats to a single class, very strong. And then for each class there are unique dmg cards, these only do dmg if you have stats. So a critter card typically does 1dmg per critter stat you have each round. Robot dmg card do 2 dmg evry other round and dragons do 3 dmg per dragon stat card every 3rd round. So basically balanced but with some strategy in regards to timing, there are for example shield cards that only exist as triggering every other round, so they line up perfectly with robots and counter them hard, and are not as effective vs dragons.
