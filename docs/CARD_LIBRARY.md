# CARD_LIBRARY.md

## Current card library status

Source of truth for current import:
- `data/cards.json`

This first pass includes:
- base cards for Critters / Robots / Dragons
- a selection of default special cards from the provided source

This first pass excludes:
- EXTRA_CARDS
- MONSTER_CARDS

## Core base cards

### Critter
- `critter1` — +1 critter stat
- `Swarm` — critter damage card

### Robot
- `robot1` — +1 robot stat
- `robot_attack` — robot damage card

### Dragon
- `dragon1` — +1 dragon stat
- `Dragons Breath` — dragon damage card

## Multi-stat cards

- `joker`
- `robot_dragon`
- `robot_critter`
- `dragon_rabbit`
- `dragon2`
- `rabbit2`
- `robot2`

## Included special/action cards

- `recycle_card`
- `draw_all_new_1`
- `draw_2_extra`
- `copy_card_in_hand`
- `extra_turn`
- `no_stats_to_2`
- `double_dmg`
- `one_off_each`
- `shield_is_dmg`
- `Shield2`
- `any_off_each`
- `bite`
- `Dragon Ulti`
- `Devour`
- `Murder rabbit`
- `robot_ulti`

## Notes

Some included cards are only partially normalized in rules terms.

That is intentional for now.
We are preserving the source card data while formal rules documentation catches up.

### Current implemented special support

Currently wired into the playable prototype:
- `draw_2_extra` — pre-battle: draw 2 cards
- `draw_all_new_1` — pre-battle: discard entire hand, then draw that many + 1
- `copy_card_in_hand` — pre-battle: copy one chosen card in hand
- `recycle_card` — pre-battle: return 1 card from discard to hand
- `Shield2` — battle shield support
- `bite` — direct damage support
- `Devour` — CD4 dragon-scaled damage support, 7 damage per dragon stat

Other included special/action cards may still exist in data without full gameplay support yet.

## Recommended next classification pass

Next, each card should be classified into one of these buckets:
- base stat
- base class damage
- shield/defense
- draw/filtering
- copying/reuse
- stat conversion
- scaling finisher
- timing modifier
- special rule card
