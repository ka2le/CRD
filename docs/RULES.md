# RULES.md

## Scope

This document describes the current **base rules** for Critters Robots Dragons.

This is the version we should implement first.

Special cards exist, but support for them should be added gradually.

## Core match structure

There are **two modes**.
We will support both later, but start by implementing:
- **5 hand discard mode** first
- **draft mode** later

In both modes, the end result is the same:
- each player ends up with a **5-card hand**
- then the **battle phase** begins

The battle rules are the same in both modes.

---

## Mode 1: 5 hand discard mode

This is the first mode to implement.

### Setup
- Each player starts with **5 cards**.

### Hand refinement
The player may:
1. discard **any number of cards** from their hand, including **0**
2. draw until they have **5 cards again**
3. repeat that discard-and-draw process **one more time**

So in total, each player gets:
- an initial 5-card hand
- **2 discard phases**
- after the second refill, that becomes their final battle hand

---

## Mode 2: Draft mode

This will be supported later.

### Draft flow
- **5 cards** are placed face up for both players to see
- one player takes **1 card**
- the other player takes **1 card**
- then **5 new cards** are flipped up
- the player who picked **second** in the previous set now picks **first**
- this alternates like that until both players have **5 cards** in hand

### Between games
- who goes first on the **first pick of the draft** should alternate between games

---

## Battle phase

Once both players have their final 5-card hand, the battle begins.

Players do not take turns one after another during battle.
Instead:
- **both players act at the same time each round**

So:
- round 1 = both players do their round 1 effects/damage
- round 2 = both players do their round 2 effects/damage
- and so on

---

## Classes

The 3 core classes are:
- **Critters**
- **Robots**
- **Dragons**

Stat cards provide stats for these classes.
Damage cards generally require matching stats to scale.

Examples of the base pattern:
- a critter damage card typically deals **1 damage per critter stat**
- a robot damage card typically deals **2 damage per robot stat**
- a dragon damage card typically deals **3 damage per dragon stat**

The timing/cadence is part of the balance:
- critters are fast and frequent
- robots are medium-speed and burst every other round
- dragons are slower and hit harder every third round

---

## Cooldown / trigger timing

Cards have a cooldown / timing value, referred to as **CD**.

### Base meaning
- **CD 1** = triggers every round
- **CD 2** = triggers every other round
- **CD 3** = triggers every third round

### Round examples
- on **round 1**, all **CD 1** cards trigger
- on **round 2**, all **CD 1** and **CD 2** cards trigger
- on **round 3**, all **CD 1** and **CD 3** cards trigger
- on **round 4**, all **CD 1** and **CD 2** cards trigger
- on **round 5**, all **CD 1** cards trigger
- on **round 6**, all **CD 1**, **CD 2**, and **CD 3** cards trigger

### Trigger rule
A card with CD `n` triggers on rounds where:
- `roundNumber % n === 0`

except that CD 1 naturally triggers every round.

---

## Damage and resolution

Each round:
- both players calculate all damage they deal that round
- both players take damage simultaneously
- damage totals are updated after simultaneous resolution

The game continues until a win condition is reached.

---

## Win condition

The game is played until at least one player has taken a total of **21 or more damage**.

### If only one player has reached 21+
- the **other player wins**

### If both players reach 21 or more in the same round
- the winner is the player who has dealt the **most total damage**

### If total damage dealt is also tied
- the game is simply a **tie**

---

## Special cards

Special cards exist, but they should be introduced gradually in implementation.

They should remain in data/docs as references even if the engine does not support all of them yet.

### Current pre-battle activation rule
Cards with **CD 0** may be activated in a dedicated **pre-battle phase** after the final hand is ready and before battle starts.

- highlighted pre-battle cards can be activated before pressing **Battle**
- the player may activate supported cards in any order
- not activating one counts as skipping it
- the opponent may also resolve supported pre-battle cards before battle

### Currently supported pre-battle specials

#### Copy card in hand
A copy-style special card means:
- before battle begins
- the player chooses one other card in their hand
- the copy card becomes a real transformed copy of that chosen card

#### Draw 2 extra
A draw special card may:
- draw **2 additional random cards**
- add them to the hand
- before battle begins

#### Recycle card
A recycle special card may:
- choose **1 card from that player's discard pile**
- return it to hand
- before battle begins

#### Draw all new +1
A redraw special card may:
- discard the player's **entire current hand**
- draw that many new cards **plus 1**
- place the old hand into discard
- resolve with discard animation before the new hand is revealed

---

## First implementation boundary

Implement first:
- 5 hand discard mode
- base 3-class stat/damage flow
- simultaneous rounds
- CD timing
- 21-damage win condition
- tie resolution

Defer for later:
- draft mode
- full special-card support
- extra cards
- monster cards
