# CRD

**CRD** is the working digital version of **Critters Robots Dragons**, a 2-player drafting and battle card game.

Current build:
- playable local React prototype
- 5 hand discard mode
- draft mode
- simultaneous battle playback
- first-pass special card and AI support
- complete headless decision episodes and Python/Gymnasium interface, including preparation order/targets

## How it plays

Build a five-card combination of stats, attacks and specials, prepare it, then watch simultaneous combat. Critters attack every round, Robots every second round, Dragons every third. Taking 21 damage loses; simultaneous lethal compares total damage dealt after shields.

- **5 Hand Discard:** start with five and take two optional discard/refill passes.
- **Draft:** each side picks one from a shared five-card row, then reveal a new row; alternate first picker per pack until both have five cards.

Preparation specials can expand the hand beyond five. The current app is human versus heuristic AI; online multiplayer is planned.

Read the [game overview](docs/GAME_OVERVIEW.md), [rules](docs/RULES.md), [card reference](docs/CARD_LIBRARY.md), and [current implementation review](docs/CURRENT_STATE.md). The review distinguishes design intent from known state/ordering issues.

## Run Locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Image assets

The game serves local WebP art and icons. Full-resolution originals are preserved in `assets/originals/`, outside the published site. Run `npm run assets:prepare` after adding source images, and `npm run assets:smoke` to check rendering paths. Builds verify the optimized pack without network access. See [asset workflow](docs/ASSETS.md) for archive locations and CDN download setup.

## Headless Smoke

Latest AI work: [larger draft W/D/L experiment](docs/AI_DRAFT_V2.md), with a completed4,000-deal corpus, ~99k/two-layer and ~150k/four-layer models and paired search-versus-search comparisons. Models remain offline; browser AI remains heuristic.

The first [draft-only training experiment](docs/AI_DRAFT_EXPERIMENT.md) now runs data collection, a small NumPy residual model and paired unseen-deal tournaments. Preparation uses the existing heuristic; browser AI remains unchanged. That guide supersedes older no-model milestone notes below.

```bash
npm run headless:smoke -- --mode draft --seed 7 --reveal-opponent
npm run headless:test
```

For Python/Gymnasium setup and variable actions, see [AI environment](docs/AI_ENVIRONMENT.md). A first [observation-sampled rollout teacher](docs/AI_SEARCH.md) now compares every choice and generates grouped action targets without reading the real deck. The [search/neural plan](docs/AI_TRAINING.md) describes remaining learning/deeper search; no trained model exists yet.

## Project Notes

The project keeps game rules and state transitions in reusable JS modules under `src/game/`, with React components focused on presentation. `PROJECT.md` is the living project brief.

## Verification baseline

On 2026-10-19, build/lint/regressions, 14 JS tests (including 144 replays and 802 sampled-root reconstructions), eight Python tests (including checkers and 48 replays), and 200 random episodes pass. Headless includes ordered preparation and actual 21/50 rewards. Rollout pilots also produced 230 decision states and 2,269 candidate targets; they are development data, not held-out strength proof. Earlier smoke/lint findings are historical. See `docs/AI_ENVIRONMENT.md`, `docs/AI_SEARCH.md` and `docs/CURRENT_STATE.md` for limits.
