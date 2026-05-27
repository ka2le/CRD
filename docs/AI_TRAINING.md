# AI_TRAINING.md

## Direction

The first neural-net training path should keep the game rules in JavaScript and expose them to Python through a Gymnasium wrapper.

Planned shape:
- JavaScript stays the source of truth for cards, drafting, discard flow, pre-battle actions, and battle simulation.
- Python owns the Gymnasium `Env`, training loop, model code, and reward calculation.
- A persistent Node worker should eventually bridge Python to the JS game functions over JSON lines or a similar small protocol.

## First training target

Start simple:
- run the normal hand-building game logic headlessly
- once final hands are ready, evaluate total damage after 12 rounds
- calculate reward in Python, where higher player damage is better

The current battle simulator can support that by running with training-specific options such as:
- `maxRounds: 12`
- a high `damageToWin` value if the reward should ignore the normal 21-damage end condition

## Compatibility flags added

The app should continue to behave exactly as normal when these options are not provided.

### Deck and RNG

`src/game/cards.js`
- `createSeededRng(seed)` creates a deterministic RNG.
- `shuffle(array, { rng })` accepts an optional RNG and defaults to `Math.random`.
- `buildShuffledDeck({ seed, rng, wildDeck })` accepts deterministic shuffle inputs and defaults to the current random shuffle.
- Pure game-module imports now use Node-compatible `.js` specifiers, and card JSON uses an import attribute so a future worker can import these modules directly.

### Draft flow

`src/game/draftMode.js`
- `createDraftGame` accepts `seed`, `rng`, `deck`, `opponentStrategy`, `includeRecentMoves`, and `openingDraftAnimation`.
- `applyDraftPick` accepts `opponentStrategy` and `includeRecentMoves`.
- `resolveOpponentDraftPick` accepts `opponentStrategy` and `includeRecentMoves`.
- `commitDraftDiscard` accepts `includeRecentMoves`.
- `revealNextDraftPack` accepts `opponentStrategy`, `includeRecentMoves`, and `draftAnimation`.

For headless use, pass `includeRecentMoves: false` and avoid animation-specific draft states where possible.

### Five-hand discard flow

`src/game/fiveHandDiscard.js`
- `createFiveHandDiscardGame` accepts an injected `deck`, plus the same shuffle options as `buildShuffledDeck`.
- `applyDiscardPhase` accepts `includeRecentMoves`, `opponentDiscardStrategy`, and `opponentDiscardCount`.

### UI timing controls

The React app defaults are unchanged, but hooks now accept optional timing overrides:
- `useDraftFlowEffects({ timing })`
- `useBattlePlayback({ timing })`
- `useGameSession({ timing })`, including draft-flow timing passed through as `timing.draftFlow`

These are mostly for future test/headless/dev acceleration. The actual training worker should prefer the pure game functions instead of training through React hooks.

## Next implementation step

Add a Gymnasium wrapper around the minimal headless bridge.

Current bridge pieces:
- `src/game/headlessGame.js` exposes `createHeadlessGame`, `getLegalActions`, `stepHeadlessGame`, `encodeObservation`, and `createStepResponse`.
- `scripts/headless-worker.mjs` is a persistent JSON-lines Node worker with `ping`, `reset`, `step`, and `close` commands.
- `python/random_headless_smoke.py` starts the worker and plays one random legal-action episode.

Useful smoke commands:
```bash
python python/random_headless_smoke.py --mode five-hand-discard --seed 7 --reveal-opponent
python python/random_headless_smoke.py --mode draft --seed 7 --reveal-opponent
```

The eventual Gymnasium wrapper should build on the same worker protocol:
- `reset(config)`
- `legalActions(state)`
- `step(state, action)`
- `encodeObservation(state)`
