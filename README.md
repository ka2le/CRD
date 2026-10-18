# CRD

**CRD** is the working digital version of **Critters Robots Dragons**, a 2-player drafting and battle card game.

Current build:
- playable local React prototype
- 5 hand discard mode
- draft mode
- simultaneous battle playback
- first-pass special card and AI support
- early Python-to-Node headless smoke path for future training and server work

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

```bash
npm run headless:smoke -- --mode draft --seed 7 --reveal-opponent
```

## Project Notes

The project keeps game rules and state transitions in reusable JS modules under `src/game/`, with React components focused on presentation. `PROJECT.md` is the living project brief.

## Verification baseline

On 2026-10-18, production build, combat regression smoke and both Python headless modes passed. Lint reports four existing errors. Headless currently skips preparation and uses 12-round damage evaluation, so it does not cover the complete browser match. See `docs/CURRENT_STATE.md` for details.
