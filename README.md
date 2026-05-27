# CRD

**CRD** is the working digital version of **Critters Robots Dragons**, a 2-player drafting and battle card game.

Current build:
- playable local React prototype
- 5 hand discard mode
- draft mode
- simultaneous battle playback
- first-pass special card and AI support
- early Python-to-Node headless smoke path for future training and server work

## Run Locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Headless Smoke

```bash
npm run headless:smoke -- --mode draft --seed 7 --reveal-opponent
```

## Project Notes

The project keeps game rules and state transitions in reusable JS modules under `src/game/`, with React components focused on presentation. `PROJECT.md` is the living project brief.
