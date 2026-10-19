# Tabletop battle redesign study

**Historical design alternatives.** The creator has now requested and approved an optional browser implementation of power − shields + class bonus; see `TABLETOP_MODE.md` for active rules and integer special conversions. The studies below do not define or validate that mode.

Status: **proposal and local numerical experiment, not approved rules**. Updated 2026-10-19. Digital combat, card definitions, draft, discard and preparation remain unchanged. The single-score direction below supersedes the earlier finish/time-chart recommendation.

## Latest creator direction: one power, one type, one score

The creator explicitly accepts meaningful balance shifts and rounded/reworked specials. The key value lies in multiplicative hand building, risk/reward, adaptation to the opponent and deck, and reactive drafting, rather than reproducing every old battle outcome. A change in card valuation is not itself a reason to reject a simpler system. No fractions, round calculation, lethal threshold, damage ledger or overkill tiebreak should be part of tabletop resolution.

Requested shield candidate: each enemy shield subtracts **2 power from Critter, 1 from Robot, 0 from Dragon**. Equal class contributions allow the player to choose a type before battle. Devour can become 2 power per Dragon stat plus permission to choose Dragon damage type. Other specials may be rounded or redesigned.

Latest refinement: deliberately make Critters strongest at low power, Robots at middle power, and Dragons at high power. These are comparisons at equal adjusted power, not a guarantee that a weaker hand beats a much stronger one. Stop deriving the score order from old lethal outcomes; author the curves for this strategic identity.

### Concrete single-score chart candidate

1. Calculate each class's power using matching stats multiplied by attack strength. Ordinary attacks have strength 1 and ultimates strength 2. Add the class contributions together for total power.
2. Largest class contribution determines damage type; if tied, choose secretly before the simultaneous reveal. Multi-class stat icons count independently in the appropriate class products. Neutral additions do not become another stat multiplier.
3. Reveal power, damage type and shields together. Subtract enemy shield count multiplied by 2/1/0 according to **your** damage type. Floor power at zero.
4. Find the adjusted-power row and your damage-type column. That entry is the complete battle score. Higher wins; equal scores draw. Both sides calculate independently, with no resolution order and no combat choices after reveal.

| Adjusted power | Critter score | Robot score | Dragon score |
| --- | --- | --- | --- |
| 0 | 0 | 0 | 0 |
| 1 | 4 | 2 | 1 |
| 2 | 7 | 4 | 2 |
| 3 | 10 | 7 | 4 |
| 4 | 12 | 10 | 6 |
| 5 | 14 | 15 | 10 |
| 6 | 16 | 18 | 14 |
| 7 | 18 | 21 | 18 |
| 8 | 20 | 23 | 24 |
| 9 | 22 | 25 | 27 |
| 10 | 24 | 27 | 30 |
| 11 | 26 | 29 | 32 |
| 12 | 28 | 31 | 34 |

These are deliberately authored prototype scores, replacing the previous chart derived from old basic-hand finishes. At equal adjusted power, Critters lead at 1–4, Robots at 5–7, Dragons at 8–12. All columns increase strictly: another power always helps, even outside a class's favored band. Scores determine ordering, not damage or margins of victory. Breakpoints and score differences are playtest parameters, not approved card balance.

The chart range is an example, not a cap on hand strength. Enlarged/prepared hands and strong specials require extended rows. A simple provisional continuation after 12 is +2 score per additional power in every column, keeping Dragons ahead at equal high power without an ever-growing lead. Do not cap scores or power silently. Players would read the extended printed chart, not need this authoring formula.

Examples:

- At power 4, Critters score 12, Robots 10, Dragons 6: Critters lead.
- At power 6, Critters score 16, Robots 18, Dragons 14: Robots lead.
- At power 9, Critters score 22, Robots 25, Dragons 27: Dragons lead.
- Critter power 4 scores 12, beating Dragon power 5's score of 10. Dragon power 8 scores 24, tying Critter power 10. Class identity can offset some raw power without making raw power irrelevant.
- Three hypothetical equal-power-6 hands, each facing one enemy shield, become Critter power 4 / Robot power 5 / Dragon power 6: scores 12 / 15 / 14. Robots retain a middle-band advantage despite Dragon shield immunity.
- Robot power 6 with no shield versus Critter power 6 with one shield: Robot power becomes 5 and scores 15; Critter power stays 6 and scores 16. Critters win. A shield only reduces the opposing hand, never its owner's power.
- One Critter stat and one Swarm plus one Dragon stat and one Breath contribute 1+1 power. The owner may choose either tied damage type before reveal. Against a shield, choosing Dragon prevents the shield penalty; that choice is legitimate under this new ruleset.

### Integer special candidates, for subsequent development

- Bite: +2 flat power. It is added once and is not multiplied by class stats. A purely neutral offensive hand can use Robot type/column as a fixed default; choosing Dragon freely for neutral-only hands would give automatic shield immunity.
- Punch: double the power from Robot attacks; other attacks that already contribute positive power each add +1 flat power. This is a deliberately different integer effect, retaining Robot preference while still helping other builds. Define stacking and interaction with neutral attacks before treating a full conversion as final; no old half-power multiplier is required.
- Devour: 2 power per Dragon stat, with an optional Dragon-type override declared before reveal. Its contribution still requires Dragon stats. The override changes the whole hand's damage type, which can protect mixed or neutral power from shields; that is part of its new value.
- Shield-based damage and hybrid cards may also receive integer formulas. Their previous exact long-run output is no longer a conversion constraint. Do not reintroduce a CD4/Heavy tempo merely to preserve Devour timing.

This direction is conceptually simpler than the historical proposal: only the class products and one shield subtraction are calculated; the chart supplies a single comparable integer. The earlier 40,000-matchup agreement results do **not** evaluate this new shield rule, chart-plus-rounded-card system or its strategic balance.

## Design brief

Keep the five-card engine-building decisions, draw odds, discard risks, reactive drafting, multiplicative stat/attack combinations, shields, and timing-sensitive counters. Remove repeated arithmetic and written damage tracking from tabletop combat. One setup calculation is acceptable. Some interaction loss or a small number of additional rules is acceptable.

## What creates the decisions

For ordinary attacks, sustained output is `Critter stats * Critter attacks + Robot stats * Robot attacks + Dragon stats * Dragon attacks`. The separate products matter. Three stats and two attacks give six; four stats and one attack give four. Two matching stats and two attacks give four, while one complete Critter pair plus one complete Dragon pair gives two. The mixed engine still improves on one complete pair's output of one. Double-stat and ultimate cards change these values without changing the underlying principle.

The marginal value of a stat is the number of matching attacks; the marginal value of an attack is the matching stat total. Consequently a card's value depends on the existing hand, remaining slots, available replacements and opposing engine. Neither stats nor attacks have a fixed strategic value.

Discard mode trades a functioning floor against the chance of a better combination, with only two replacement opportunities. An off-plan complete pair can be a useful fallback even though specialization has a higher ceiling. A shield costs an offensive slot; whether it buys an extra attack matters more than its theoretical prevention over a long game. Exact keep/discard probabilities depend on the remaining shared pool and known cards; this study does not estimate policy-optimal discard decisions.

Draft makes that calculation reactive. Taking the second attack can complete an engine; denying the opponent their missing attack can outperform improving one's own average output. Multi-class stats preserve options early. Later, a threshold-crossing stat, a shield that delays lethal, or a support attack that fills a gap can be the better pick. The existing heuristic AI does not model all this counterplay, so its preferences are not evidence of optimal strategy.

Combat is a deterministic reveal of those earlier decisions. The appealing uncertainty lies in assembling and judging engines, not in maintaining a damage ledger. Removing the ledger need not remove suspense at the reveal.

## Why higher average plus fixed RPS is too lossy

Without shields and specials, equal normalized power gives Critters a cumulative total at least as high as either other class at every round. Their advantage disappears on shared burst rounds; it does not form a fixed three-way cycle. Robots versus Dragons depends on the lethal breakpoint. Shields and synchronized specials create additional reversals.

Examples from the actual engine:

- Robot power 6 finishes on round 4 with 24; Dragon power 6 needs round 6. At the actual round-4 end, Dragons have dealt only 18.
- Critter power 5 finishes on round 5 with 25; Dragon power 6 still needs round 6. A rule that only consults tempo on equal power gets this wrong.
- Power 4 gives all three basic classes a round-6 finish without shields. Against one shield each, Critters finish on 11, Robots on 8, Dragons on 9. Shield resistance alone does not imply Dragons always beat Robots.
- At power 7 without shields, Dragons finish on 3 and Robots on 4; at power 6 the Robot/Dragon ordering is reversed.

Removing a stat as a shield rule also changes multiplication: removing one stat costs one power per matching attack. A shield currently prevents a bounded amount per active round, not an amount growing with attack-card count.

## Proposed prototype: Power and Tempo

This is a complete mathematical candidate for testing. It deliberately approximates mixed timing. It is not a claim that one scalar preserves the existing game.

### Player flow

1. Build and prepare hands using the existing rules and card pool.
2. Reveal. Calculate offensive power once, retaining subtotals for the four tempo groups below.
3. The largest power subtotal determines the hand's tempo. Break equal subtotals toward the shorter interval. This is determined by damage contribution, not number of cards, number of stat icons, or a freely chosen faction.
4. Add all subtotals to get total power.
5. Look up total power, tempo and the enemy's number of shield cards on a reference sheet. Read **finish** and **tiebreak damage**.
6. Earlier finish wins. Equal finishes compare the printed tiebreak damage; equal values draw. If neither finishes by 50, draw. A hand unable to finish can still lose to a hand that does finish.

Finish is a race rank printed on the reference sheet: players do not play or record those rounds. Exact entries are generated from the rules below, rather than manually assigning faction advantages. Reference-sheet layout and lookup time require tabletop testing; this study does not claim a complete compact sheet for every prepared hand.

### Offensive values before Punch

| Source | Power | Tempo group |
| --- | --- | --- |
| Swarm | Critter stats | Quick (1) |
| Robot attack | Robot stats | Clockwork (2) |
| Dragon's Breath | Dragon stats | Breath (3) |
| Class ultimate | Twice matching stats | Matching class's tempo |
| Bite | 1.5, independent of stats | Clockwork (2) |
| Shield is damage | Own total shield: 2 per shield card | Quick (1) |
| One of each | Critter stats * Robot stats * Dragon stats | Quick (1) |
| Any of each | Total class stats / 2 | Clockwork (2) |
| Devour | 1.75 * Dragon stats | Heavy (4) |

Add repeated attacks normally. Multi-class stats contribute separately to each matching formula. Prep cards contribute zero combat power unless transformed by Copy. A tempo group is a timing identity, not a stat identity: Bite receives no bonus from Robot stats.

These values preserve original raw long-run output, before changing the rhythm of the combined hand. Bite, the hybrid attack and Devour expose a real cost of averaging: halves and quarters. Printing the converted values avoids division by CD, but does not make fraction addition disappear. An integer-only redesign of those cards is a separate balance decision; rounding them silently is not justified.

### Punch

For one Punch, double Clockwork and Heavy power; multiply Quick and Breath power by 1.5. Apply before determining the dominant group. This preserves the original long-run preference for synchronized Robot, Bite, hybrid-CD2 and Devour attacks. It does not preserve the exact boosted/unboosted sequence for Quick or Breath.

For `k` Punch cards, Clockwork and Heavy use `2^k`; Quick and Breath use `(1 + 2^k) / 2`. Factors for 0/1/2/3 Punch cards are `1/2/4/8` and `1/1.5/2.5/4.5`, respectively. Multiple-Punch arithmetic is another tabletop cost, especially in Wild/prepared hands. The diagnostic does not assume duplicates are forbidden.

### Shields and the reference calculation

Let `P` be total power, `t` the chosen interval and `S` the number of enemy shield cards. The reference sheet is generated using:

```
net strike = max(0, t * P - 2 * S)
strikes needed = ceil(21 / net strike)
finish = t * strikes needed
tiebreak damage = strikes needed * net strike
```

A zero net strike, or a finish after 50, has no finish. The division and rounding belong to reference generation, not tabletop play. Totals at finish can exceed 21 and must not be capped, because existing simultaneous-lethal rules use overkill.

This keeps one shield rule: block two per strike. Critters expose their damage to it more often than Dragons. No stat-removal rules or faction exceptions are required. Focused basic/ultimate engines without Punch retain their exact outcomes, including shields and simultaneous lethal. Focused even-tempo engines also retain Punch timing exactly. Odd-tempo Punch engines are approximate.

## What this prototype preserves, and what it changes

Preserved structurally: product-based engine building; concentrated versus split output; off-plan pairs being useful; basic class finish thresholds; stronger attacks; broad shield asymmetry; Robot/Punch rate synergy; existing hand-building and preparation procedures.

Changed: all damage inherits one tempo, so support attacks no longer fill gaps independently. The dominant-group boundary creates a new breakpoint that did not exist previously. Fast support moved onto a slow rhythm encounters fewer shields, and slow support moved onto a fast rhythm becomes more vulnerable. Averaging odd-tempo Punch effects also changes some early finishes and tiebreaks. Preserving draw/discard procedures does not preserve the value of every draft/discard choice.

Concrete counterexamples, verified against `simulateBattle`:

1. Five Dragon stats + one Breath + Bite: 3 on round 2, 15 on round 3, 3 on round 4, reaching 21 on round 4. This is achievable in a five-card Wild hand using two double-Dragon stats. It beats Critter power 5, which finishes on 5. Collapsing its 6.5 power into Breath tempo gives 19.5 on round 3 and a finish on 6, reversing the winner.
2. Three Dragon stats + Breath + Bite + shield versus Robot power 4 + shield: original finishes are 9 versus 8, so Robots win. The approximation shifts Bite into the Dragon burst, reduces exposure to shields and gives Dragons a finish on 6, reversing the winner in the other direction.
3. One Critter stat/attack plus one Dragon stat/attack still penetrates a two-point shield on Dragon rounds. Collapsing equal contributions to Quick tempo blocks the entire resulting two-power strike. It is not enough to say all mixed damage is preserved because its raw sum is unchanged.

These are meaningful strategic losses, not only cosmetic replay differences. Do not patch them by declaring all support untyped or letting players freely assign it to a preferred class: those choices introduce different incentives.

## Numerical experiment

Reproduce with `node scripts/tabletop-combat-study.mjs`. Detailed output is `docs/tabletop-combat-study.json`.

Four deterministic samples of 10,000 matchups each. Deal two five-card hands without replacement from the relevant physical combat-only pool; condition on both hands having nonzero raw damage. Test Normal/Wild separately and core/full combat cards separately. No draft policies, discard passes, preparation effects or enlarged hands are sampled. Therefore these are diagnostic agreement rates, not estimates of player experience, class balance or competitive strategy preservation. Win-to-draw changes count as disagreements.

| Pool | One-rhythm result disagreements | Among mixed-rhythm core matchups | Average-only disagreements |
| --- | --- | --- | --- |
| Normal, core | 522 / 10,000 (5.22%) | 522 / 5,011 (10.42%) | 11.30% |
| Wild, core | 359 / 10,000 (3.59%) | 359 / 5,011 (7.16%) | 8.50% |
| Normal, full combat | 363 / 10,000 (3.63%) | Not the core subgroup | 5.63% |
| Wild, full combat | 310 / 10,000 (3.10%) | Not the core subgroup | 5.23% |

The average-only comparator is deliberately favorable: it uses the exact long-run post-shield damage, including original timing and Punch. It draws on equal averages; it is not an implementation or benchmark of a particular RPS rule. The one-rhythm candidate preserves exact fractional power without rounding; an integer-card rewrite is not covered by these results.

The independent profile/finish calculation was checked against the actual engine for 1,000 matchups per sample plus all named examples. No disagreement. The one-rhythm and exact calculations are separate. Existing application behavior was not modified.

## Alternative: exact lookup, no change to combat outcomes

Because hands are fixed, record each attack once into its actual burst group: every-round, even-round, third-round and fourth-round. Record Punch count separately. An exact reference can map those values and enemy shield count directly to finish/tiebreak. Neutral attacks join the group matching their timing; Bite naturally goes with Robot timing, not Robot stat scaling. It needs no new rules for mixed hands.

An enumeration of legal five-card Wild multisets finds only **95 attack signatures** for basic attacks, existing stats and shields. With all playable combat specials it finds **1,152 signatures**, including zero-damage signatures and Punch count. Enemy shield columns are additional; those counts are not complete matchup-table cells. Preparation can create larger hands and additional signatures, so the five-card enumeration is not a complete game reference.

This is a viable fidelity-first direction for a folded core reference, but a full exact booklet risks replacing arithmetic intimidation with lookup intimidation. Do not advertise a tiny universal chart without designing and usability-testing it. Keeping multiple rhythms is the straightforward way to preserve support timing; a dominant-rhythm chart knowingly gives that information up.

## Recommendation and playtest criteria

Use **Power plus Tempo** as the first simplification candidate, rather than average score plus fixed faction RPS. Treat the dominant-rhythm rule as the main experiment, not as a settled balance-preserving conversion. Keep an exact lookup candidate as the comparison if losing support timing proves unacceptable.

First test low-arithmetic players: can they calculate the setup, identify the right entry and agree on a result without a confident player taking over? Include mixed hands, shield count changes and Punch; pure basic hands alone make the system look easier than the full deck is.

Then test paired draft/discard choices using the same starting deals: whether shield picks, class commitment, off-plan insurance, denial, Bite timing and Punch builds remain attractive. Compare the decision ranking, not only match winner agreement. Specifically look for deliberate exploitation of the dominant-tempo boundary and support shielding. No new card numbers or replacement combat rules are adopted by this study.
