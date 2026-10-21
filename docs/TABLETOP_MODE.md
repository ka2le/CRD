# Tabletop resolve modes

Current rules confirmed **2026-10-21**. Menu → Battle offers Battle (digital rounds), Threshold, Abilities, and **Abilities v2** (Flexible Robots). `settings.tabletop` is false / `threshold` / `abilities` / `abilitiesv2`; legacy true maps to Threshold. These settings work with Draft and Discard, and Normal or Wild Deck. Changing rules starts a new game.

## Shared scoring

Ordinary attacks give **1 power per matching stat**. Ultimates (Murder Rabbit, Robot Ultimate, Dragon Ultimate and Devour) give **2 per matching stat**. Bite gives **1** flat power. Add every attack's contribution.

The largest class contribution determines main faction. Ties allow a player choice before reveal. Neutral-only hands use Robot; a powerless hand has no main type unless Chameleon provides one. Devour offers a Dragon override. Chameleon offers any main faction, including Critter's v2 tiebreak, without changing underlying stats or attack contributions.

Each opposing shield removes Critter **2**, Robot **1**, Dragon **0** power from the whole hand, floored at zero. These shield costs retain their existing values. Shield cards count as one shield. Shield Is Damage remains 1 power per shield; One Of Each remains Critter × Robot × Dragon stats (Robot damage and one Robot attack); Any Of Each remains the sum of all stats (neutral). These unit-valued special formulas stay whole-number effects rather than introducing fractions.

## Threshold

Latest tuning is reported in `THRESHOLD_DISTINCT_RESULTS.md`: +2/+3/+4 with Dragon cutoff8 or9 and Robot cutoff4 or5. The creator adopted **+2/+3/+4 at1/4/8** for now and closed this tuning pass; this is a design choice, not a claim of proven balance. Equal Critter/Robot bonuses were rejected because they flatten faction identity. The playable rules below reflect that adoption. Shields apply before eligibility; Dragons have zero shield reduction.

After shields, the main faction earns one bonus:

| Main faction | Required power | Bonus |
| --- | ---: | ---: |
| Critter | 1 | +2 |
| Robot | 4 | +3 |
| Dragon | 8 | +4 |

The creator selected +2/+3/+4 at1/4/8 after the Normal Deck comparison, retaining distinct faction rewards. Shortcut grants the faction's bonus below its cutoff, but only with positive remaining power. There is one tier per faction; additional Shortcuts do not increase it. Each 2× card doubles the earned bonus; copies stack. Score = remaining power + bonus. Equal scores draw.

## Abilities (v1)

No Shortcut or 2× cards; Chameleon remains.

- **Critter — Adapt:** automatically turn the Critter stat(s) on one stat card into one ordinary Critter attack when it improves the unshielded score; skip on equal value. Other faction stats on mixed cards remain. A double Critter stat card becomes one attack, as before.
- **Robot — Perfect Balance:** with Robot as chosen main faction, equal positive Robot stats and attack counts earn **+3 after shields**. The creator explicitly increased this from the rescaled +2 because Robots previously felt weak. Robot Ultimate counts as two attacks; One Of Each counts as one. The bonus can survive fully blocked base power, preserving the prior rule.
- **Dragon — Overwhelming:** **7+ Dragon contribution before shields** adds one Dragon stat; recompute all attack formulas once, then apply shields. The bonus stat can also affect hybrid attacks. No recursive retrigger.

Score = recomputed power − shields + Perfect Balance. Equal scores draw. Adapt's automatic choice uses the hand before reveal and does not inspect enemy shields.

## Abilities v2 — Flexible Robots

**Adopted update (2026-10-21):** Dragon 6+ → one extra Dragon stat, plus unlimited exchanges of base single Robot stat / ordinary Robot attack cards. These supersede the earlier study defaults. Robot reference-card artwork stays unchanged; the Dragon card keeps its large cutoff and now shows the v1 extra-stat card.

Earlier Dragon-only experiments are historical: `V2_DRAGON_STAT_RESULTS.md` compares +4 with the extra-stat effect at7. The later extra-stat-at6 study, still using the old one-pip Robot convention, gave C/R/D52.3/44.8/52.0%Draft and51.3/44.8/54.1%Discard. Evidence `.ai-runs/v2-dragon-stat6-2026-10-21/`. Their frozen variants remain available for replay; they are not the current Robot rule.

Same deck exclusions as v1. The older Adapt and Perfect Balance effects do not apply.

- **Critter:** a Critter main faction wins equal final scores against another faction. Two Critter hands still draw. A Chameleon choosing Critter receives this rule; a wholly untyped zero-power hand does not.
- **Robot — Reconfigure:** freely exchange **any number of base single Robot stat cards (`robot1`) and base ordinary Robot attack cards (`robot_attack`)**, in either direction, to maximize unshielded power after abilities. Copies of those cards qualify. Double stats, mixed stats, ultimates and hybrid/special attacks never qualify. All possible base stat/attack counts are evaluated, including the unchanged hand. Five base Robot stats can become three stats/two attacks for6 power. On equal power, keep the unchanged hand; otherwise prefer fewer conversions. Conversion is a scoring plan, not a physical replacement or a new preparation activation. Fixed double/mixed stats and special attack formulas still contribute normally to the optimized engine.
- **Dragon — Overwhelming:** **6+ Dragon contribution before shields** adds **one Dragon stat**, once. Recompute every attack formula, including hybrids, before main-faction choice and shields. The trigger uses actual Dragon contribution, not total hand power or Chameleon's faction; the bonus cannot recursively trigger itself.

Score = power after abilities − shields, then the Critter tiebreak. Reconfigure and Overwhelming can both operate in a mixed hand; each Robot plan is evaluated with the real Dragon rule. Main faction is determined after both abilities. AI chooses its type before reveal by highest score, then (v2) Critter tie advantage, then shield resistance. Conversion maximizes power before reveal without consulting enemy shields.

**Optimizer follow-up audit:** checked all4,000 saved final hands from the prior Dragon6 experiment and adopted run: the adopted conversion never reduces unshielded power compared with leaving those same cards unchanged. Both Any of Each (C+R+D) and One of Each (C×R×D) recompute from converted stats. This revision also removed the historical ability to convert a pip on double/mixed stat cards; unlimited exchanges alone are not the whole comparison. On the prior2,000 final hands,18 improve,176 lose power versus that historical ability,1,806 tie. Example: two double Robot stat cards plus an ordinary Robot attack scored6 under the former pip conversion and now score4 because neither double stat is eligible. Diagnostic: `.ai-runs/v2-adopted-2026-10-21/inspect-robots.mjs`. Conditional faction scores also change when search picks different hands/main factions.

## Decks and preparation

Digital: 70 Normal / 102 Wild, 27 definitions. Threshold: 72 / 108, 29 definitions, including Shortcut and Chameleon. Abilities and v2: 70 / 102, 27 definitions, excluding Shortcut and 2× but including Chameleon. All draws/copies/recycles preserve the selected rules. Imported digital card definitions remain intact.

Preparation remains optional and private. Existing draw/redraw/copy/recycle decisions are shared by browser and search. Human main-type ties require an explicit choice before Battle. A changed hand invalidates the choice. Abilities use the existing automatic-before-reveal scoring convention.

## Implementation and verification

Balance studies use **Normal Deck only**, per creator correction 2026-10-21. Wild is deliberately an unbalanced fun variant. Earlier Wild results are archival, not normal-game balance evidence. Current study compares Battle, Threshold, Threshold trial (same cutoffs, +2/+3/+4), v2, and v2 trial (Dragon8+ → +3), in both hand-building modes. V1 is not part of this iteration. Study-only process configuration leaves the playable defaults above unchanged until a variant is adopted. Reports should include faction bars, draw rates and card presence, with explicit sample sizes/metric definitions.

- `src/game/tabletop.js`: mode normalization, derived cards, immutable scoring profiles, automatic conversion plans, scoring and symmetric tiebreak.
- `src/game/tabletopAi.js`: heuristic completion policy. `src/game/searchAi.js`: the in-game sampled-world search, now also reporting candidate W/D/L counts and paired baseline Monte Carlo uncertainty.
- `src/game/headlessGame.js`: deals real mode-specific decks and resolves tabletop hands through the same scorer. Existing digital simulation remains unchanged.
- Menu, help, card inspection, reference score cards and result formulas display the selected rules. Result formulas mark Reconfigure and Critter tie eligibility.
- `scripts/tabletop-balance.mjs`: fixed-budget search self-play, actual decisions/final hands, faction/matchup/ability statistics and independent 256-world decision probes. `scripts/summarize-tabletop-balance.mjs` produces the report. See `TABLETOP_BALANCE_RESULTS.md` when collection is complete.

Useful development preview: `/?scenario=reconfigure&rules=abilitiesv2&at=result`. Helpers also accept `crdDev.result('reconfigure', { rules: 'abilitiesv2' })`. All fixtures are development-only. `npm run tabletop:test` covers all three modes, thresholds, shields, mixed-card conversion, ultimate exclusions, ties, deck exclusions, browser session flow and hidden-deck-independent search.

Balance remains experimental. Digital Battle is a reference, not an exact parity target. The objective is distinct faction strategies, worthwhile Dragon engines, useful fallback Critters and fewer draws. Conditional faction win rates alone cannot establish equal strength or fun. Previous 2/4-damage studies and older tier charts are historical and do not evaluate these rules.
