# Tabletop resolve modes

Current rules confirmed **2026-10-21**. Menu → Battle offers Battle (digital rounds), Threshold, Abilities, and **Abilities v2** (Win Ties / Perfect Balance / Overwhelming). `settings.tabletop` is false / `threshold` / `abilities` / `abilitiesv2`; legacy true maps to Threshold. These settings work with Draft and Discard, and Normal or Wild Deck. Changing rules starts a new game.

## Shared scoring

Ordinary attacks give **1 power per matching stat**. Ultimates (Murder Rabbit, Robot Ultimate, Dragon Ultimate and Devour) give **2 per matching stat**. Bite gives **1** flat power. Add every attack's contribution.

The largest class contribution determines main faction. Ties allow a player choice before reveal. Neutral-only hands use Robot; a powerless hand has no main type unless Chameleon provides one. Devour offers a Dragon override. Chameleon offers any main faction, including Critter's v2 tiebreak, without changing underlying stats or attack contributions.

Each opposing shield removes Critter **2**, Robot **2**, Dragon **1** power in Abilities v2. Threshold and v1 retain **2/1/0**. Subtract from the whole hand, floored at zero, before earned bonuses. Shield cards count as one shield. Shield Is Damage remains 1 power per shield; One Of Each remains Critter × Robot × Dragon stats (Robot damage, and one Robot attack for Perfect Balance only when the product is above zero); Any Of Each remains the sum of all stats (neutral; Threshold deck only since 2026-10-22). These unit-valued special formulas stay whole-number effects rather than introducing fractions.

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

No Shortcut, 2× or Any Of Each (Critter + Robot + Dragon) cards; Chameleon remains.

- **Critter — Adapt:** automatically turn the Critter stat(s) on one stat card into one ordinary Critter attack when it improves the unshielded score; skip on equal value. Other faction stats on mixed cards remain. A double Critter stat card becomes one attack, as before.
- **Robot — Perfect Balance:** with Robot as chosen main faction, equal positive Robot stats and attack counts earn **+3 after shields**. The creator explicitly increased this from the rescaled +2 because Robots previously felt weak. Robot Ultimate counts as two attacks; One Of Each counts as one if it deals damage. The bonus can survive fully blocked base power, preserving the prior rule.
- **Dragon — Overwhelming:** **7+ Dragon contribution before shields** adds one Dragon stat; recompute all attack formulas once, then apply shields. The bonus stat can also affect hybrid attacks. No recursive retrigger.

Score = recomputed power − shields + Perfect Balance. Equal scores draw. Adapt's automatic choice uses the hand before reveal and does not inspect enemy shields.

## Abilities v2 — current adopted rules

Adopted 2026-10-22 after creator review of 500 Normal Svenbot games per mode at16 samples per decision. Regular deck68 cards / Wild96; Chameleon, Any Of Each, Shortcut and2× excluded. Definitions and artwork remain available to other modes as applicable.

- **Critter — Win Ties:** chosen Critter main wins equal scores against other factions; two Critter hands draw. Each enemy shield removes **1 power**.
- **Robot — Perfect Balance:** chosen Robot main earns **+3 after shields** for equal positive Robot stat pips and Robot attack units. Ultimate counts2; One Of Each counts1 only when its product deals damage. No Reconfigure or Adapt. Each enemy shield removes **2 power**.
- **Dragon — Overwhelming:** **7+ Dragon contribution before shields** adds exactly one Dragon stat and recomputes all attack formulas once. No recursive trigger. Dragon-main hands are **immune to shields**.

Score = max(0, recomputed power - chosen-main shield penalty) + Perfect Balance. Both score-card layouts show Dragon7+ with the extra-stat reward and shield tabs−1/−2/0. Help, browser worker, offline games and rooms share the scorer. Headless rules version `v8-abilitiesv2`.

Normal Svenbot self-play: Draft C/R/D44.8/54.3/52.0%, Discard52.7/51.3/44.9%; draws6.2/8.2%. Metric: cross-faction wins+half draws, mirrors excluded. All1,000 trial games and4searched roots exactly reproduced by playable defaults. Conditional sample estimates, not proof of equal strength. Previous Dragon7/shields220 trial reused as matched control; only Critter shielding changed. Creator selected this version as best so far and requested commit/deployment.

### Preserved experiment — Robot Reconfigure (superseded)

The implementation remains behind `FLEXIBLE_RULES.robotPipReconfigure`, disabled in the playable rules. Configure `abilitiesv2-robot-pips` in a separate study process before constructing hands to reproduce the previous pip/Ultimate optimizer and shields2/1/0. `scripts/robot-pip-trial-tests.mjs` retains its eligibility, main-faction restrictions and exhaustive optimizer checks. Restoring this experiment requires disabling Perfect Balance as well; it is not combined with the adopted Robot ability.

## Historical Abilities v2 — Flexible Robots

**Current clarified rules (2026-10-21):** Dragon6 extra stat remains; Robot Reconfigure now exchanges individual stat/attack units and requires Robot as the resulting chosen main faction. The clarified rule is published in7aa1956 after creator acceptance; the prior base-card-only rule is historical. Robot reference-card artwork stays unchanged; the Dragon card keeps its large cutoff and now shows the v1 extra-stat card.

Earlier Dragon-only experiments are historical: `V2_DRAGON_STAT_RESULTS.md` compares +4 with the extra-stat effect at7. The later extra-stat-at6 study, still using the old one-pip Robot convention, gave C/R/D52.3/44.8/52.0%Draft and51.3/44.8/54.1%Discard. Evidence `.ai-runs/v2-dragon-stat6-2026-10-21/`. Their frozen variants remain available for replay; they are not the current Robot rule.

Same deck exclusions as v1. The older Adapt and Perfect Balance effects do not apply.

- **Critter:** a Critter main faction wins equal final scores against another faction. Two Critter hands still draw. A Chameleon choosing Critter receives this rule; a wholly untyped zero-power hand does not.
- **Robot — Reconfigure:** freely exchange **any Robot stat pip** for **one Robot attack unit**, or one ordinary/ultimate Robot attack unit for one Robot stat. Mixed/double stat cards qualify; Critter/Dragon pips remain. Only `robot_attack` (one unit) and `robot_ulti` (two units) supply convertible attacks. A partially converted Ultimate retains one attack unit and gains one stat; fully converted gives two stats and no attack. Copies qualify. Any of Each, One of Each and every other hybrid/special attack cannot transform. Every plan recalculates all formulas, so converted stats still scale those hybrids. Use conversion **only with Robot as the resulting chosen main faction**; Robot must be a valid resulting type, possibly tied or provided by Chameleon. The starting main need not be Robot. A non-Robot choice uses the original unconverted hand and its original eligible types. Select the highest unshielded power; no conversion on equal power, otherwise prefer fewer traded units. Conversion is a scoring plan, not a physical card replacement or a preparation activation.
- **Dragon — Overwhelming:** **6+ Dragon contribution before shields** adds **one Dragon stat**, once. Recompute every attack formula, including hybrids, before main-faction choice and shields. The trigger uses actual Dragon contribution, not total hand power or Chameleon's faction; the bonus cannot recursively trigger itself.

Score = power after abilities − shields, then the Critter tiebreak. Reconfigure and Overwhelming can both operate in a mixed hand; each Robot plan is evaluated with the real Dragon rule. Main faction is determined after both abilities. AI chooses its type before reveal by highest score, then (v2) Critter tie advantage, then shield resistance. Conversion maximizes power before reveal without consulting enemy shields.

**Historical base-card optimizer follow-up audit:** checked all4,000 saved final hands from the prior Dragon6 experiment and adopted run: the earlier base-card conversion never reduces unshielded power compared with leaving those same cards unchanged. Both Any of Each (C+R+D) and One of Each (C×R×D) recompute from converted stats. This revision also removed the historical ability to convert a pip on double/mixed stat cards; unlimited exchanges alone are not the whole comparison. On the prior2,000 final hands,18 improve,176 lose power versus that historical ability,1,806 tie. Example: two double Robot stat cards plus an ordinary Robot attack scored6 under the former pip conversion and now score4 because neither double stat is eligible. Diagnostic: `.ai-runs/v2-adopted-2026-10-21/inspect-robots.mjs`. Conditional faction scores also change when search picks different hands/main factions.

Clarified-rule test:1,000 fresh search games on the same Normal deals (500 per mode,16 samples), all replayed and4 search roots recomputed. C/R/D Draft53.4/45.9/50.8%, Discard45.0/51.4/53.6%; draws5.0/6.6%. Published baseline48.7/43.5/55.8%,54.0/44.7/50.7%; draws7.4/5.8%. Mean absolute distance from50% improves3.93→3.05pp and worst6.45→5.00pp. Modest overall improvement, Discard Critters now45%; differences uncertain. Adopted and published in7aa1956. Raw `.ai-runs/v2-robot-pips-2026-10-21/`, variant `abilitiesv2-robot-pips`; this combines unit eligibility and Robot-main restriction, not an isolated restriction-only test.

### Shield experiments (not adopted)

Robot immunity's lower self-play percentage is not a fixed-hand nerf. Holding baseline hands and committed types fixed, Robot cross-scores increase45.9→46.7%Draft and51.4→53.2%Discard; every Robot score stays equal or improves. Fresh search changes hand/faction selection. See study `immune-fixed-hands.json`.

**Completed shield experiments (2026-10-21; test only):** 2,000 new Normal search games, 500 per variant/mode at16 samples, matched to the published1,000-game baseline. Published: Draft 53.4/45.9/50.8%, Discard 45.0/51.4/53.6%; draws5.0/6.6%; Robot immunity: Draft 53.3/43.4/53.8%, Discard 50.2/45.4/55.9%; draws4.4/7.4%; Robot immunity plus Dragon7 flat4/shield1: Draft 52.2/46.4/51.6%, Discard 51.6/51.5/45.7%; draws5.8/7.6%. All2,000 replayed,8 search roots exact; baseline1,000/4 also reproduced. Reconfigure stays Robot-main pip/Ultimate. Variant2 uses Dragon contribution minus the actual chosen-main shield penalty for7+ eligibility, then adds4; no extra stat. Each variant uses its own rules in search; shield/stat assertions verified every saved final hand. Default/live7aa1956 unchanged; no adoption or publishing requested. Evidence `.ai-runs/v2-shields-2026-10-21/summary.json`.

Exact test conventions: variant1 changes only Robot shield cost1→0. Variant2 keeps Robot0, sets Dragon1, replaces Dragon6+ extra stat with contribution7+ → flat4. Shields reduce whole-hand power once; the same actual main-faction penalty is subtracted from Dragon contribution before eligibility. Thus Dragon-main8 vs1 shield is7+4=11, while7 vs1 shield is6 with no bonus. Robot-main remains immune, including mixed Dragon engines; Critter-main retains2 per shield. Ordinary/ultimate attack and stat-pip eligibility and all deck contents remain as published. Main choice remains before reveal. These compare the specified combined variants, not isolated causal effects.

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


**Perfect Balance experiment (2026-10-21; test only):** replaced Reconfigure entirely with v1 Robot-main Perfect Balance (+3 after shields for equal positive Robot stats and Robot attack units; Ultimate counts2, product hybrid1, sum hybrid0). Retained published v2 Critter tiebreak, Dragon6+ extra stat and shields C2/R1/D0; did not combine with the shield trials. 1,000 fresh Normal search games, 500 per mode,16 samples/action, matched baseline deals. C/R/D Draft published53.4/45.9/50.8% versus Perfect Balance46.0/49.3/53.9%; Discard45.0/51.4/53.6% versus46.6/55.8/47.1%. Draws5.0/6.6% versus5.8/6.2%. Cross-faction wins+half draws, mirrors excluded; conditional sample estimates. Perfect Balance earned177/281 Robot-main hands in Draft,210/381 in Discard. All1,000 games replayed (10,142 roots/1,518,416 completions),4 search roots recomputed exactly; baseline1,000/4 reproduced. Every final hand checked for correct bonus, no conversions, shield costs and Dragon extra stat.35 targeted tests,lint/build pass. Variant `abilitiesv2-perfect-balance`; evidence `.ai-runs/v2-perfect-balance-2026-10-21/summary.json`. Published/default7aa1956 unchanged; no adoption or publishing requested.


**Perfect Balance shield follow-up (2026-10-21; test only):** 2,000 fresh Normal search games,500 per variant/mode,16 samples/action, same starting deals as Perfect Balance baseline. All variants replace Reconfigure with v1 Robot-main Perfect Balance +3 after shields; C wins ties, D contribution6+ adds one D stat before shields. C/R/D shield costs2/1/0 baseline: Draft46.0/49.3/53.9%, Discard46.6/55.8/47.1%; costs2/2/0: Draft47.7/47.7/53.8%, Discard44.0/61.6/43.6%; costs2/2/1: Draft46.4/50.9/52.3%, Discard48.2/57.8/43.6%. Draws baseline5.8/6.2%,220=5.8/6.2%,221=6.0/5.4%. Cross-faction wins+half draws, mirrors excluded.221 is closest to50% in Draft among these samples; Discard remains Robot-led. Higher conditional Robot score with a larger shield penalty reflects changed search-built hands/matchups and sample uncertainty; holding a baseline Robot hand fixed never increases its score. All2,000 games replayed,20,234 roots/3,027,760 completions verified,8 exact root audits; previous Perfect Balance1,000 games/4 roots also reproduced. All final hands checked for exact shield costs, unchanged printed Robot/Critter stats, no conversion, correct +3 and pre-shield Dragon6 extra stat.16 targeted tests and lint pass. Evidence `.ai-runs/v2-perfect-shields-2026-10-21/summary.json`; variants `abilitiesv2-perfect-balance-shields220` and `abilitiesv2-perfect-balance-shields221`. Defaults/live7aa1956 unchanged; no adoption or publishing requested.


**2026-10-22 tweaks (creator):** Critter × Robot × Dragon (`one_off_each`) counts as one Robot attack for Perfect Balance only when it deals damage (at least one Critter, Robot and Dragon stat, after Overwhelming in v1) — no more free Perfect Balance from a dud card. Critter + Robot + Dragon (`any_off_each`) is removed from Abilities and Abilities v2 decks/collections: with 1 power per stat it had become a flexible "1 of everything" with no risk or planning. Kept in Threshold. Headless pool versions bumped to `v3-abilities` / `v7-abilitiesv2` (pool sizes 99 / 96). Not balance-tested; not published.
