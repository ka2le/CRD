# COMBAT.md

## Purpose

This document defines the base combat flow for Critters Robots Dragons.

## Combat overview

After hand-building is complete, both players enter battle with a final **5-card hand**.

Combat happens in rounds.

### Important rule
Both players act **simultaneously** each round.

This means:
- both calculate their round output for the same round number
- both deal damage at the same time
- both receive damage at the same time

## Round sequence

For round `r`:

1. Determine which cards are active on round `r`
2. Calculate each player's total round effects/damage
3. Apply both players' damage simultaneously
4. Update cumulative damage taken / dealt
5. Check win condition
6. If nobody has won, continue to round `r + 1`

## Trigger timing

A card with cooldown `cd` triggers on rounds divisible by `cd`.

Examples:
- `cd = 1` → rounds 1,2,3,4,5...
- `cd = 2` → rounds 2,4,6,8...
- `cd = 3` → rounds 3,6,9,12...

## Base class damage model

### Critter
- scales with critter stats
- base attack cadence: every round
- typical damage card: **1 damage per critter stat**
- base attack timing: `cd = 1`

### Robot
- scales with robot stats
- base attack cadence: every other round
- typical damage card: **2 damage per robot stat**
- base attack timing: `cd = 2`

### Dragon
- scales with dragon stats
- base attack cadence: every third round
- typical damage card: **3 damage per dragon stat**
- base attack timing: `cd = 3`

## Base engine rule for class damage cards

For a class-scaled damage card:

`roundDamage = matchingStatCount * baseDamage`

if the card triggers that round.

Otherwise it contributes 0 that round.

## Simultaneous damage implications

Because damage is simultaneous:
- a player can still deal damage in a round even if that same round also pushes them to 21+ damage taken
- double knockouts are possible
- end-of-round checks matter more than mid-round checks

## End-of-round win check

After both players take their round damage:

### Case 1: only one player has taken 21+
- the other player wins

### Case 2: both players have taken 21+ in the same round
- compare total damage dealt by each player
- the player who dealt more total damage wins

### Case 3: both players have taken 21+ and total damage dealt is also equal
- the game is a tie

## Deferred topics

These are not yet fully formalized here and should be layered in later:
- shields and exact prevention timing
- duplicate/copy effects
- draw-before-battle effects
- replacement effects
- transformed/copied cards
- action ordering inside pre-battle windows
- interactions between multiple special cards
