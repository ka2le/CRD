# Critters Robots Dragons

Menu → Battle offers three optional tabletop resolvers for both Draft and Discard: **Threshold, Abilities, Abilities v2 (Flexible Robots)**. All use ordinary attacks1/stat and ultimates2/stat. Threshold bonuses are1/4/7→+1/+2/+4. Abilities uses Adapt, Robot Perfect Balance+3 and Dragon7+→an extra stat. V2 uses Critter tie wins, bidirectional Robot Reconfigure and Dragon7+→+4. See `TABLETOP_MODE.md` for shields, special cards and exact rules, and `TABLETOP_BALANCE_RESULTS.md` for the search self-play study. The round-combat explanations below apply to Battle.

Reviewed against source on 2026-10-18. See `CURRENT_STATE.md` for implementation limits and verification, and `RULES.md` for detailed rules.

CRD is a two-player card battler about building a small engine of stats, attacks, and special effects. The current app is one human versus a heuristic AI. Choices happen during hand building and pre-battle preparation; combat then resolves automatically.

## Classes and combinations

Stat cards supply Critter, Robot, and Dragon stats. Each matching attack scales with the whole matching stat total; stats do not attack by themselves.

| Class | Base attack per matching stat | Active rounds |
| --- | --- | --- |
| Critter | 1 | Every round |
| Robot | 2 | 2, 4, 6, ... |
| Dragon | 3 | 3, 6, 9, ... |

Base attacks have equal long-run damage per stat, but timing changes the race to lethal. Multiple attacks multiply the value of matching stats. Multi-class stats, stronger attacks, shields, and specials create additional combinations.

## Two hand-building modes, one battle system

**5 Hand Discard:** each side starts with five cards. Submit two discard/refill passes, choosing any number including zero each time. The AI performs one pass per submission.

**Draft:** reveal a shared row of five cards. One side picks one, then the other picks one. Discard the remaining three and reveal a new row. Alternate the first picker each pack. After five packs, both sides have five cards. The intended rule also alternates the first picker between games; initialization currently has an exception documented in `CURRENT_STATE.md`.

Discard mode emphasizes keeping a promising combination while taking replacement risks. Draft adds shared availability: each pick changes the other side's options. Both modes are implemented and selectable in the menu.

## Prepare, battle, replay

Before pressing Battle, supported specials can draw extra cards, redraw the hand with one extra card, transform a copy card, or recover a discarded card. These can make the combat hand larger than five. Preparation is private with no inter-player turn order. The player chooses activation order and may skip specials; Battle completes all AI preparation before combat.

Both sides act simultaneously each round. Positive CD values trigger on divisible round numbers. Active shields prevent damage that round, then both sides take damage and the outcome is checked. Taking 21 damage loses; simultaneous lethal compares cumulative damage actually dealt, then ties if equal. Without lethal by round 50, the result is a tie.

The UI plays back resolved rounds with health, shields, triggered cards, damage values, a battle log, and a result popup. New Game starts a fresh hand-building game. No tournament or progression system is implemented.

## Current scope

The static React/Vite app includes both modes, 27 playable definitions, shared heuristic AI, animations and persisted settings. A full-decision Python/Node/Gymnasium environment now includes preparation order/targets, either-seat control and normal match outcomes; see `AI_ENVIRONMENT.md`. Online multiplayer, rooms, spectators, trained AI, and full source-card support remain future work. The creator confirmed current shields and single-card recycle intent. Browser AI preparation finishes at Battle; deferred bookkeeping/pool findings are in `CURRENT_STATE.md`.
