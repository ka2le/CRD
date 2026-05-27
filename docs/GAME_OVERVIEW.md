# GAME_OVERVIEW.md

## Critters Robots Dragons

Critters Robots Dragons is a 2-player card battler with two major phases:
- build your hand
- simulate the battle

The core idea is simple:
- players end up with a 5-card hand
- those cards generate stats and attacks
- battle then resolves automatically in simultaneous rounds
- first player to put the opponent over the threshold wins, with tie rules for simultaneous lethal

## Current implementation order

We will support two hand-building modes eventually:
- 5 hand discard mode
- draft mode

But we will implement them in this order:
1. **5 hand discard mode**
2. **draft mode**

## Class identity

The three main classes are:
- Critters
- Robots
- Dragons

They are balanced around different timing patterns:
- **Critters** attack every round
- **Robots** attack every other round
- **Dragons** attack every third round

That makes timing and counters important, not just raw totals.

## Why the game is interesting

Even in the base version, the game is not just about having big numbers.
The rhythm of when damage happens matters.

Examples:
- fast critter pressure can win races
- robot bursts can line up strongly on even rounds
- dragon spikes are slower but hit hard
- defensive timing can counter certain classes better than others

## Match outcome

A player loses when they have taken **21 or more total damage**, with one important caveat:
- if both players cross that threshold in the same round, compare total damage dealt
- if damage dealt is also tied, the game is a tie

## Design direction

The digital version should:
- preserve the timing-based identity of the game
- keep rules logic data-driven and modular
- start simple
- add special cards gradually
- support AI first, multiplayer later
