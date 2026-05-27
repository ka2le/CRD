# PROJECT.md - Critters Robots Dragons

This is the main living project brief for **Critters Robots Dragons (CRD)**.

Keep this file up to date.

When project direction, architecture, game rules, scope, assets, or priorities change, update this file first and make other docs reference it rather than drifting out of sync.

---

## Project Purpose

We are developing a **code-based digital version** of a board game called **Critters Robots Dragons**.

The assistant working on this project is **CRD_Dev**.

The goal is to turn the board game into a digital game, first focusing on getting the game rules, game flow, combat simulation, drafting, and cards working correctly in a modular React application.

Later, this should expand into a hosted multiplayer experience where **2 users can play via their own browser**.

---

## Current Direction

### Tech direction

- Use **React**
- Use **Git**
- Publish the code as the public GitHub repo **CRD**
- Host the current frontend through **GitHub Pages**
- Work **iteratively**
- Work **modularly**
- Build in a way that supports later expansion to multiplayer and server-backed play

### Near-term goal

Start with a **simple AI opponent** so the game can be played, tested, and validated before online multiplayer is built.

The first priority is to make sure:

- the game flow works
- drafting works
- combat simulation works
- cards work correctly
- the rules are represented cleanly in code

### Longer-term goal

Later, build some kind of server/backend so **2 human players** can join from their own browsers.

The room model should support:

- **P1**
- **P2**
- **Viewer**

Initial room behavior should be:

- the first player to load a new room becomes **P1**
- **P2** defaults to **AI** at first

But the system should be designed so this can later be swapped or expanded cleanly.

---

## Game Description (user-provided, keep this in full)

So what we are doing here is developing a code based version of a board game i made called Critters Robots Dragons. The game will be described more later and we will have several files specifying how it works, what cards exist, rules, why its fun etc. For now lets just know that its a 2p game played by drafting cards and then simulating rounds of combat to find out who has the best hand. Quick rounds and then play again. The 3 Classes in the game are Critters, Robots and Dragons. The base is that there are stat cards that most often give 1 stat to one of these 3 classes, some cards give to more than one and some cards give 2 stats to a single class, very strong. And then for each class there are unique dmg cards, these only do dmg if you have stats. So a critter card typically does 1dmg per critter stat you have each round. Robot dmg card do 2 dmg evry other round and dragons do 3 dmg per dragon stat card every 3rd round. So basically balanced but with some strategy in regards to timing, there are for example shield cards that only exist as triggering every other round, so they line up perfectly with robots and counter them hard, and are not as effective vs dragons.

---

## Known Assets / Inputs

- There are existing **card images**
- There is a **JSON** for the cards that can be used later
- These assets will be added later
- A first extracted working card data file now exists at `data/cards.json`

The implementation should be prepared to consume structured card data instead of hardcoding everything into UI components.

---

## Planned Main UI / Domain Components

These are the main components currently expected:

- **Hand**
- **Draft Board** (board where drafting is done)
- **Deck**
- **Battle Arena**
- **Menu**

The menu should later support options such as:

- play vs AI
- play vs another player
- room-based entry / selection
- seat selection for P1 / P2 / Viewer

---

## Architectural Intent

Design the project so that:

1. **Core game rules are separated from UI**
   - battle logic, card effects, turn flow, drafting logic, and simulation should live in reusable game/domain modules
2. **Cards are data-driven**
   - card definitions should come from structured data where possible
3. **AI can use the same game engine as players**
   - avoid special-case logic tied directly to the UI
4. **Multiplayer can be layered on later**
   - local state now, network sync later
5. **The codebase stays modular and iterative**
   - small steps, clean boundaries, easy refactors

---

## Suggested Knowledge Files

These files should be created and maintained as the project grows:

- `PROJECT.md` — master project brief and current direction
- `docs/GAME_OVERVIEW.md` — concise explanation of how the game works
- `docs/RULES.md` — canonical gameplay rules
- `docs/CARD_SCHEMA.md` — structure for card JSON/data model
- `docs/CARD_LIBRARY.md` — actual card list and notes
- `docs/COMBAT.md` — combat timing, sequencing, and resolution details
- `docs/DRAFTING.md` — drafting flow and rules
- `docs/BALANCE_NOTES.md` — why things are balanced/fun, counterplay, design goals
- `docs/ARCHITECTURE.md` — app structure and technical architecture
- `docs/PUBLISHING.md` — local commit, sanitized public push, and GitHub Pages deployment workflow
- `docs/ROADMAP.md` — iterative implementation plan
- `docs/AI_OPPONENT.md` — AI phases, heuristics, and later improvements
- `docs/MULTIPLAYER.md` — room/seat model and future networking plan
- `docs/ASSETS.md` — image assets, naming, import conventions
- `docs/DECISIONS.md` — important project decisions and tradeoffs

---

## Initial Implementation Plan

### Phase 1 — Foundation

- Set up React project structure
- Define project folders and module boundaries
- Define game state model
- Define card data shape
- Implement a minimal local playable loop

### Phase 2 — Core Gameplay

- Implement drafting flow
- Implement hand/state transitions
- Implement combat rounds
- Implement class timing logic for Critters / Robots / Dragons
- Implement shield timing and similar reactive effects

### Phase 3 — Content Integration

- Load card JSON
- Connect card images
- Validate card behavior against rules
- Add test cases for card interactions

### Phase 4 — AI Opponent

- Create simple drafting and play heuristics
- Make AI use the same rules engine
- Tune for competent baseline play

### Phase 5 — UX / Polish

- Improve clarity of board state and combat resolution
- Add feedback, animations, and round summaries
- Improve menu / flow for replayability

### Phase 6 — Multiplayer Evolution

- Add room model
- Add seat selection
- Replace AI-only assumptions with player-slot abstraction
- Add backend/network sync later

---

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

---

## Rules Clarified So Far

### Supported modes
There are two modes overall:
- **5 hand discard mode**
- **draft mode**

Implementation order:
- start with **5 hand discard mode**
- support **draft mode** later

### 5 hand discard mode
- each player starts with **5 cards**
- each player may discard **any number of cards**, including 0
- they draw back up to **5 cards**
- they do this discard-and-refill process **twice total**
- after that, the resulting 5 cards are the battle hand

### Draft mode
- 5 cards are placed face up for both players to see
- one player picks 1 card
- the other player picks 1 card
- then 5 new cards are revealed
- the player who picked second in the previous set now picks first
- repeat until both players have **5 cards**
- between games, who starts the first draft pick should alternate

### Battle structure
- both players act **simultaneously** each round
- round 1 means both players perform all round-1 effects/damage
- round 2 means both players perform all round-2 effects/damage
- and so on

### Cooldown timing
- **CD 1** triggers every round
- **CD 2** triggers every other round
- **CD 3** triggers every third round
- on round 1, CD 1 triggers
- on round 2, CD 1 and CD 2 trigger
- on round 3, CD 1 and CD 3 trigger
- in general, CD `n` triggers on rounds divisible by `n`

### Win condition
- the game continues until at least one player has taken **21 or more total damage**
- if only one player has reached 21+, the other player wins
- if both reach 21+ in the same round, the player who dealt the most total damage wins
- if total damage dealt is also tied, the game is a tie

### Special cards
- special cards exist and should stay represented in data/docs
- engine support for them should be added gradually
- cards with no cooldown (`cd: 0`) can participate in a dedicated pre-battle activation phase
- this pre-battle activation phase begins when the hand becomes battle-ready and the Battle button appears
- players may activate highlighted pre-battle cards in any order before pressing Battle
- not activating a highlighted pre-battle card before Battle counts as skipping it
- current supported pre-battle special flow includes drawing 2 cards and copying a card in hand
- copy-card behavior should preserve the copied card as a real transformed card in the hand, including allowing copied pre-battle cards like draw-2 to be activated afterward if still eligible

## Open Questions

These still need to be filled in later:

- Deckbuilding constraints, if any
- Full card list
- Full effect taxonomy
- Exact shield timing/resolution details
- Exact pre-battle action ordering when multiple special cards exist
- AI difficulty expectations
- Exact multiplayer/server architecture

---

## Status

Current stage: **working expanded local prototype**.

Implemented now:
- React app scaffold in workspace root
- public GitHub Pages deployment setup for the `CRD` repository
- `src/` in workspace root
- modular UI/component structure
- local playable **5 hand discard** flow
- working draft mode flow
- combat simulator for base stat cards and base class damage cards
- initial support for `shield2`, `draw_2_extra`, `copy_card_in_hand`, `recycle_card`, `bite`, ulti cards, and several first-pass special damage cards
- mobile-friendly game-shaped board layout
- round-by-round battle playback with health reduction, damage popups, and result popup
- draft center deck/discard stacks
- reset/session-boundary handling for clean new games and battle playback restarts
- alternating draft first picker between games and between packs
- first competent shared AI evaluation layer for draft/discard/pre-battle card choices
- first training-facing compatibility flags for seeded decks, injected decks, optional strategy hooks, movement suppression, and timing overrides
- minimal Python-to-Node headless smoke path that plays random legal draft/discard actions and evaluates 12-round damage
- synced opponent discard timing in 5 hand discard mode, where opponent discard now resolves once per player discard submission instead of being pre-resolved at game creation
- shared discard pile behavior in 5 hand discard mode, so opponent-discarded cards also enter the same discard pile used by player recycle effects

Still in progress / worth improving:
- broader special-card coverage
- stronger AI behavior
- additional polish for layout, pacing, and animation
- multiplayer/server play

Recent UX polish now in baseline:
- draft pack cards can present one-by-one from the deck with motion
- opponent draft picks and pack-clearing include intentional readability pauses
- battle playback speeds up after round 10
- battles hard-stop at 50 rounds and resolve as a tie

Recent architecture progress:
- session/game flow has been moved out of `src/App.jsx` into focused hooks
- reducer-backed session state now owns game-flow transitions more explicitly
- draft timing/animation concerns have dedicated hooks/helpers instead of living directly in the app shell
- hand rendering now supports visual suppression of cards that are already present in game state but should not yet be visible during flight animations
- draft row visibility can also be explicitly masked across animation/pacing gaps when cards should remain logically present but not visually reappear

## Fast Resume References

If context is missing after a restart, re-anchor with these files first:
- `PROJECT.md`
- `docs/ARCHITECTURE.md`
- `docs/RULES.md`
- `docs/COMBAT.md`
- `docs/DRAFTING.md`
- `docs/CARD_SCHEMA.md`

Current important code/data entry points:
- `src/App.jsx`
- `src/game/cards.js`
- `src/game/fiveHandDiscard.js`
- `src/game/draftMode.js`
- `src/game/engine.js`
- `src/game/headlessGame.js`
- `scripts/headless-worker.mjs`
- `python/random_headless_smoke.py`
- `src/hooks/useBattlePlayback.js`
- `data/cards.json`
- `docs/PUBLISHING.md`
- `.github/workflows/pages.yml`

AI/training planning:
- keep JS as the source of truth for game rules
- expose a future headless JS adapter to Python/Gymnasium through a persistent Node worker
- start training simply by reaching final hands and rewarding higher total damage after 12 simulated rounds
