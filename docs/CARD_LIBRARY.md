# Current card library

Current Abilities (`abilities-main`) pool: **69 Regular / 97 Wild**, with seven ordinary Robot Attacks (creator-adopted 2026-10-26). Perfect Balance remains +3. Hidden Abilities Prototype: 70 Regular / 100 Wild; Chameleon remains there. Both exclude Shortcut, 2× and C+R+D; main also excludes Chameleon. Historical counts below predate exclusions.

Current Abilities Shields supply **2 shield points per card**, blocking one power per point from Critters or Robots; Dragons are immune. Shield is Damage adds power equal to your total shield points (2 per Shield card), and shields still block. This uses the card's actual shield value rather than counting Shield cards. The seventh Robot Attack and its artwork remain active pending separate nerf tests.

> Naming policy (2026-10-22): **Abilities = `abilities-main`** (formerly Abilities v2). The original is **Abilities Prototype** (`abilities-prototype`), hidden and excluded from balance testing unless explicitly requested. Generic tabletop requests mean main; Threshold must be named explicitly. Historical raw IDs/paths remain unchanged. See [ruleset naming policy](RULESET_NAMES.md).

These are the digital definitions. Tabletop mode derives separate per-game cards with zero cooldown and converted symbols/effects; `TABLETOP_MODE.md` lists all conversions. Imported definitions and digital deck counts stay intact.

Tabletop ultimates (Murder Rabbit, Robot Ultimate, Dragon Ultimate and Devour) all give **2 power per matching stat**, double an ordinary attack. In current Abilities, Devour is a second Dragon ultimate without a main-faction override; Dragon Ultimate is a separate, unchanged card. Bite adds **2 flat power** in Abilities. Threshold and hidden Prototype retain Bite at 1 and Devour's Dragon main-type option. Digital definitions below stay unchanged.

The tabletop 2× card is neutral: it doubles the earned main-faction bonus after shields, rather than any attack's power. Copies stack on the bonus.

Reviewed 2026-10-18. Definitions: `data/cards.json`. Playable inclusion: `CORE_CARD_IDS` in `src/game/cards.js`. Use these IDs rather than display-name capitalization in code.

There are 30 imported definitions, 27 playable in digital Battle. Normal deck: 71 cards. Wild Deck: 103, replacing each playable one-copy count with three and leaving other counts unchanged. Extra and monster sets are not imported.

Tabletop-only additions in `data/tabletop-cards.json`: **Shortcut** grants the single main-faction bonus below its threshold after shields (positive power required); **Chameleon** lets the player click the card and choose any main faction, controlling bonuses and shield vulnerability. Each has one Normal / three Wild copies. Threshold has 29 definitions and 73 / 109 cards; hidden Prototype has 26 definitions and 70 / 100 cards; current Abilities has 25 definitions and 69 / 97 cards. Both additions use the creator's archived artwork and icons from the local set. See `TABLETOP_MODE.md` for stacking and selection details.

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
| `robot_attack` | 7 | 2 | 2 damage per Robot stat |
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
