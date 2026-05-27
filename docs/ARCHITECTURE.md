# ARCHITECTURE.md

## Intent

Build Critters Robots Dragons as a modular React application with a clean separation between UI and game logic.

## Current implementation shape

### Root app
- Vite + React app at workspace root
- `src/` lives directly in workspace root as requested

### Current code areas
- `src/game/cards.js` — card-pool selection and deck building
- `src/game/fiveHandDiscard.js` — 5 hand discard mode flow, including synced opponent discard passes
- `src/game/draftMode.js` — draft state transitions
- `src/game/cardEvaluator.js` — shared AI card scoring and selection helpers
- `src/game/engine.js` — stat calculation, trigger timing, combat simulation
- training-facing compatibility flags now exist across `src/game/cards.js`, `src/game/draftMode.js`, and `src/game/fiveHandDiscard.js` for seeded decks, injected decks, strategy hooks, and animation-move suppression
- `src/hooks/useGameSession.js` — reducer-backed session state, pre-battle activation phase ownership, and action ownership
- `src/hooks/useDraftFlowEffects.js` — timed draft sequencing/effects layer
- `src/hooks/draftMotion.js` — draft motion helpers for pick/discard animations
- `src/hooks/useBattlePlayback.js` — playback-only battle animation/timing over already-resolved battle hands
- `src/App.jsx` — composition/root wiring and screen layout
- `src/components/card/CardButton.jsx` — reusable clickable card component
- `src/components/card/CardVisual.jsx` — art + icon overlay rendering for cards
- `src/components/card/cardData.js` — icon URLs and rendering helpers

### Data
- `data/cards.json` — current working card data source

## Current UI flow

### Hand-building layout
- top menu for high-level controls and testing options
- shared board in the center
- player hand anchored at the bottom of the screen
- opponent hand visible on the board for testing, with a toggle to show fronts or card backs
- hand action buttons live with the player hand area where appropriate
- start battle lives on the board center
- layout should fit within the viewport; scrolling belongs inside hands/logs rather than the whole page

### Battle layout
- player hand area at bottom is hidden
- both players' hands are shown around the battle area
- battle area moves to center stage
- battle plays out round by round with health reduction and damage popups
- battle HUD shows side stat counts and a large ghosted round number in the center
- triggered cards can show per-card battle values directly on the cards during playback
- battle ends with a winner/tie popup that also reports the finishing round

## Card rendering direction

Cards should:
- use the actual art as the visual base
- support icon-driven overlays for stats, damage, cooldown, and later special effects
- stay modular so visual polish does not clutter the game layout code
- respect max-size constraints and center in their tracks instead of stretching awkwardly

## Target Shape

### UI layer
Responsible for:
- rendering screens and components
- handling player interactions
- showing combat and draft state
- animating battle playback
- applying visual suppression when game state and visual visibility must differ temporarily

### Game/domain layer
Responsible for:
- card definitions
- drafting rules
- battle timing
- damage/shield resolution
- win/loss outcomes
- AI-facing simulation hooks

### Session / transition layer
Responsible for:
- reducer-backed session state
- action-driven game-flow transitions
- dedicated pre-battle activation phase ownership for no-cooldown special cards
- preserving copied activatable cards as genuinely new identities so activation eligibility is derived from current state instead of leaking source-card spent state
- bridging pure game transitions to timed UI effects
- keeping animation sequencing out of the core rules engine

### Data layer
Responsible for:
- card JSON ingestion
- asset references
- future persistence/network payload compatibility

## Key Rules

- Game rules should not be trapped inside React components.
- Animation timing should not become the source of truth for game state.
- When a card must exist in state before it should be visible, use explicit visual suppression instead of relying on timing races.

## Current prototype scope

Implemented now:
- shuffled deck from selected core cards
- player starting hand
- opponent starting hand
- 2 discard phases for the player
- synced opponent discard passes in 5 hand discard mode
- working draft mode with alternating first picker between packs/games
- final battle simulation
- base stat scaling for robot/critter/dragon damage cards
- simultaneous round resolution
- 21-damage win logic with tie handling
- 50-round hard cap that resolves as a tie
- round-by-round battle playback in UI with late-battle speed-up after round 10
- first special-card support: `shield2`, `draw_2_extra`, `copy_card_in_hand`, `bite`, ulti cards, and several first-pass special damage cards
- session-level pre-battle activation phase for supported `cd: 0` cards
- copied pre-battle activation cards now produce fresh copied identities so copied activatable cards can still be activated afterward
- localStorage-backed test settings for mode, opponent-hand visibility, and wild-deck deck building
- seeded/injected deck support for future headless training runs without changing normal app behavior
- optional strategy hooks and move-suppression flags for future Gymnasium/Node-worker integration
- timed draft deal/pick/discard flow polish
- explicit visual suppression for in-state cards that should stay hidden until animation completion
- testing toggle for opponent card fronts / backs
- modular card rendering components

Not yet implemented:
- real AI decision making
- broader special-card engine coverage
- multiplayer sync

## Future-friendly needs

- local single-browser play first
- AI plug-in second
- Python/Gymnasium training should use JS as the source of truth through a headless adapter/worker rather than porting rules to Python
- multiplayer/network sync later
- room/seat abstraction early enough to avoid repainting the whole app later
