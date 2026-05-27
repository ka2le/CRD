# DRAFTING.md

## Status

Draft mode is a planned mode, but not the first one implemented in code.

The first playable implementation should focus on:
- 5 hand discard mode
- base stat cards
- base class damage cards

## Draft mode rules

- 5 cards are revealed face up for both players
- one player picks 1 card
- the other player picks 1 card
- then 5 new cards are revealed
- the player who picked second in the previous set now picks first
- continue until both players have 5 cards

## Between games

- the starting player for the first pick should alternate between games

## Implementation notes for later

Suggested future state model:
- visible draft row
- current picker
- round / pack index
- player hands
- remaining deck
- starting-player toggle between matches

## Current stance

Do not block the first playable version on draft mode.
