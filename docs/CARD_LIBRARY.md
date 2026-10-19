# Current card library

These are the digital definitions. Tabletop mode derives separate per-game cards with zero cooldown and converted symbols/effects; `TABLETOP_MODE.md` lists all conversions. Imported definitions and digital deck counts stay intact.

Tabletop ultimates (Murder Rabbit, Robot Ultimate, Dragon Ultimate and Devour) all give **4 power per matching stat**, double an ordinary attack. Devour retains the Dragon main-type option.

Reviewed 2026-10-18. Definitions: `data/cards.json`. Playable inclusion: `CORE_CARD_IDS` in `src/game/cards.js`. Use these IDs rather than display-name capitalization in code.

There are 30 imported definitions, 27 playable. Normal deck: 70 cards. Wild Deck: 102, replacing each playable one-copy count with three and leaving other counts unchanged. Extra and monster sets are not imported.

## Stats

| ID | Normal copies | Stats |
| --- | --- | --- |
| `critter1` | 7 | +1 Critter |
| `robot1` | 8 | +1 Robot |
| `dragon1` | 6 | +1 Dragon |
| `rabbit2` | 2 | +2 Critter |
| `robot2` | 1 | +2 Robot |
| `dragon2` | 1 | +2 Dragon |
| `robot_critter` | 2 | +1 Robot, +1 Critter |
| `robot_dragon` | 1 | +1 Robot, +1 Dragon |
| `dragon_rabbit` | 2 | +1 Critter, +1 Dragon |
| `joker` | 1 | +1 of all three classes |

## Combat actions

Damage applies when triggered. Each class attack uses the full matching stat total independently.

| ID | Normal copies | CD | Implemented effect |
| --- | --- | --- | --- |
| `swarm` | 8 | 1 | 1 damage per Critter stat |
| `robot_attack` | 6 | 2 | 2 damage per Robot stat |
| `dragons_breath` | 8 | 3 | 3 damage per Dragon stat |
| `murder_rabbit` | 1 | 1 | 2 damage per Critter stat |
| `robot_ulti` | 1 | 2 | 4 damage per Robot stat |
| `dragon_ulti` | 1 | 3 | 6 damage per Dragon stat |
| `devour` | 1 | 4 | 7 damage per Dragon stat |
| `bite` | 2 | 2 | 3 flat damage |
| `shield2` | 3 | 1 | 2 shield this round |
| `double_dmg` | 1 | 2 | Double whole outgoing damage this round; copies multiply |
| `shield_is_dmg` | 1 | 1 | Damage equal to own active shield; shield still blocks |
| `one_off_each` | 1 | 1 | Critter stats * Robot stats * Dragon stats damage |
| `any_off_each` | 1 | 2 | Sum of all three class stats as damage |

`shield2` is CD 1 in data; the creator confirmed this current shield behavior is correct. These formulas describe code, not a claim that every special's design/balance is final.

## Preparation actions

Each has one normal-deck copy and CD 0.

| ID | Implemented effect |
| --- | --- |
| `draw_2_extra` | Add two available deck cards; retain source |
| `draw_all_new_1` | Discard entire current hand including source; draw that count +1 |
| `copy_card_in_hand` | Transform source into another non-copy card in hand with fresh UID |
| `recycle_card` | Add one chosen available discard; retain source |

Preparation can exceed five cards. Fresh copied preparation cards activate independently. Shared activation/target transitions now live in `preparationState.js`; React owns picker/animation orchestration. `completeOpponentPreBattle` completes the heuristic AI privately at Battle. Headless exposes source/target/order/skip/finish as agent decisions, including newly acquired specials; see `AI_ENVIRONMENT.md`. The creator intends recycle as a single card usable by only one player per game; existing deck/pool/copy handling remains unchanged.

## Preserved but excluded

| ID | Reason |
| --- | --- |
| `extra_turn` | Special timing not implemented |
| `no_stats_to_2` | Stat setup/conversion not implemented |
| `backside` | Card-back utility, not playable |

Raw `customEffect` tokens preserve source artwork/text references; they are not executable definitions. See `CARD_SCHEMA.md` and `CURRENT_STATE.md` for technical limits.
