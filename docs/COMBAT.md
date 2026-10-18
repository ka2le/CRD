# Combat implementation

Reviewed 2026-10-18 against `src/game/engine.js` and `src/hooks/useBattlePlayback.js`. Shared match rules are in `RULES.md`.

## Inputs and timing

`simulateBattle(playerHand, opponentHand, options)` takes prepared hands and returns complete round history and result. Defaults: `damageToWin: 21`, `maxRounds: 50`. It copies the deck option into its output but does not draw. Hands and class stats remain fixed. Preparation is the caller's responsibility.

Only action cards with numeric positive CD trigger, on divisible rounds. Stat cards contribute without triggering. CD 0 and negative CDs are inactive here.

Each class attack independently uses all matching stats: Critter 1 at CD 1, Robot 2 at CD 2, Dragon 3 at CD 3. Flat damage such as Bite does not need stats.

## Exact round sequence

For both sides:

1. Select triggered actions.
2. Sum their shield values.
3. Calculate each card's damage using fixed hand stats and own active shield total.
4. Sum damage, then multiply by two for each triggered `double_dmg`.
5. Subtract the opposing shield, floored at zero.
6. Apply both sides' damage simultaneously and accumulate damage taken/dealt.
7. Check lethal; continue if neither reached the threshold.

`shield_is_dmg` uses full own active shield, not the amount blocked. Shield still prevents damage; unused shield does not persist. `one_off_each` multiplies all three class totals; `any_off_each` adds them. See `CARD_LIBRARY.md` for coefficients/CDs.

Current `shield2` gives two shield at CD 1. The creator confirmed this current shield behavior is correct; the original every-other-round example is superseded.

## Result and history

One side taking 21 damage loses. Simultaneous lethal compares cumulative post-shield damage dealt, then ties if equal. The 50-round limit without lethal always ties. Headless evaluation overrides are not browser match rules.

Results include winner/reason, hands, stats, damage totals, deck, and rounds. Rounds include outgoing/post-shield damage, shield/blocked totals, triggered identities, per-card bursts, cumulative totals, and unchanged hands/stats. Draw arrays remain empty.

Per-card burst values are before whole-hand doubling and enemy shield reduction; they are not final post-modifier damage attributed to each card.

## Playback

`useBattlePlayback` calls the simulator and displays history. Health starts at 21 and displays a floor of zero; cumulative damage preserves overkill for results.

Defaults: 1,400 ms base interval, decreasing for upcoming rounds above round 2 by 40 ms per round, to a 350 ms minimum. Older notes saying acceleration begins after round 10 are stale. Timing affects presentation only.

## Coverage

Preparation is private without inter-player turns. The session completes remaining AI preparation atomically at Battle before calling combat. Regression smoke verifies AI draw/copy/redraw/recycle chains, skips for unusable specials, and prepared first-round damage, alongside Devour simultaneous lethal. Recycle pool handling remains unchanged by request. Headless smoke does not cover preparation or browser animation; the interaction matrix remains largely untested.
