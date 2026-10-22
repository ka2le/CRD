# Tabletop balance study — 2026-10-21

> Naming policy (2026-10-22): **Abilities = `abilities-main`** (formerly Abilities v2). The original is **Abilities Prototype** (`abilities-prototype`), hidden and excluded from balance testing unless explicitly requested. Generic tabletop requests mean main; Threshold must be named explicitly. Historical raw IDs/paths remain unchanged. See [ruleset naming policy](RULESET_NAMES.md).

> ARCHIVAL WILD-DECK STUDY. The creator clarified that Wild is intentionally unbalanced and must not be used as the balance baseline. The Normal Deck comparison supersedes this study for tuning decisions.

Search self-play using the actual browser search and mode-specific decks. This is an initial observational balance study, not proof of optimal play or a measurement of fun.

Confirmed rules: ordinary attacks 1/stat; ultimates 2/stat; Bite 1. Threshold: 1/4/7 power → +1/+2/+4 after shields. Abilities Prototype: Adapt, Robot-main Perfect Balance +3, Dragon power 7+ → +1 stat. Abilities v2: Critter-main wins ties, Robot Reconfigure, Dragon power 7+ → +4. Shield costs remain 2/1/0; unit-valued hybrid/shield attacks retain their whole-number formulas.

Card-level follow-up: [faction wins, card presence and preparation analysis](TABLETOP_CARD_ANALYSIS.md).

## Main findings

**3,400 actual self-play games are complete:** 3,000 in the main six-arm comparison (500 per cell), plus 400 games comparing 16/32-sample budgets on 100 matched fresh deals in each building mode. Records verify 40,575 decision points and 6,432,256 root-candidate completions. Nested preparation lookaheads and the 30 independent 256-world decision probes are additional. All runs use Wild Deck.

| Rules | Draft draws | Discard draws |
|---|---:|---:|
| threshold | 6.2% | 6.0% |
| abilities | 4.6% | 5.2% |
| abilitiesv2 | 3.0% | 2.8% |

Against other typed factions, score means wins plus half draws. These are outcomes of the hands search chose to build, not randomized faction assignments. Different selection rates and hand quality matter.

| Rules | Building | Critter score | Robot score | Dragon score |
|---|---|---:|---:|---:|
| threshold | draft | 26.3% | 46.8% | 63.4% |
| threshold | five-hand-discard | 27.6% | 49.4% | 63.5% |
| abilities | draft | 32.4% | 56.6% | 51.2% |
| abilities | five-hand-discard | 38.6% | 53.9% | 52.5% |
| abilitiesv2 | draft | 34.7% | 53.5% | 57.2% |
| abilitiesv2 | five-hand-discard | 40.8% | 46.2% | 62.3% |

**Abilities v2 is promising for the intended identities, without yet establishing equal strength.** It had the fewest draws in the main runs. Critters appeared more often than under the other rules, particularly in Discard (29.9% of hands, versus Robot 32.8% and Dragon 36.5%). Robots used both conversion directions: in Discard, 275/1,000 hands swapped stat→attack and 88/1,000 attack→stat. Dragons rewarded completed engines. Critters still had lower non-mirror success, especially in Draft; that is compatible with a fallback role, but needs human playtesting to judge whether the fallback is satisfying.

**Abilities Prototype Robots are competitive with +3 Perfect Balance in these runs:** 56.6% Draft and 53.9% Discard non-mirror scores. Threshold remains simple, but its observed results favor Dragons more strongly than v1. This study does not justify automatically equalizing the three win percentages.

**The Dragon payoff is not all the bonus.** In v2 Discard, Overwhelming activated in 135/1,000 hands; those hands scored 90.4%. Removing only the +4 bonus from both sides of the same finished matchups lowers their score to 78.5% and changes18/500 winners. The engines were already strong. Critter tiebreaks directly settled5 equal-score Draft games and 13 Discard games; other rule changes also affect draw frequency.

**Do not blame shields alone for the Critter gap.** The gap persists in games without opposing shields. Shield subsets are small and observational; their averages do not isolate the shield penalty. Similarly, frequent preparation cards and expanded hands are selected strategically, so their associations are not causal card-strength estimates.

**Search-budget sensitivity remains inconclusive.** On100 matched fresh deals per building mode, increasing16→32 samples changes Draft draws 6%→5% (paired approximate95% interval for the change −6.2..+4.2 percentage points), and Discard 4%→5% (−4.2..+6.2). Faction percentages vary across these small runs. These are not head-to-head strength tournaments.

### Decision examples and what they explain

- **V2 Draft, 32-sample run, game 7:** the Dragon player held Dragon Ultimate, Dragon/Rabbit, Dragon Ultimate and Double Dragon. The heuristic chose Joker: the searched continuation finished20–20 and Critters won the tie. Search chose Copy instead, then copied Double Dragon for 24 power. The rival tried a redraw and finished3. This shows why exceeding a Critter tie can make a stronger Dragon engine worth pursuing. It is one replay, not proof the line always wins.
- **V2 Discard, main run, game 255:** with Shield, Redraw, Robot/Dragon, Dragon Attack and Robot, search retained Redraw and replaced the other four cards. An independent256-world evaluation favored it over the heuristic by0.570 in P(win)−P(loss). In the actual searched replay, the redraw/copy chain built a19-point Dragon hand instead of the baseline5-point hand. The realized draws were favorable; the expected-value comparison is the evidence for the decision, not that single outcome.
- **Threshold Discard, game 129:** several attacks but no stats. Search kept Any Of Each and redrew four cards; the heuristic kept narrower attacks. Independent256-world advantage:0.637 in P(win)−P(loss). The actual replay improved0→9 power but still lost11–9, illustrating that a better decision does not guarantee a win.
- **Threshold Draft, game 9 exposes a model limitation:** all 256 confirmation rollouts favored the stat pick over Bite, but actual64-sample search for both continuations found a recycle/copy/redraw response that beat it14–11. The baseline also lost8–7. Zero Monte Carlo error within a completion model does not remove opponent-model uncertainty. Actual self-play outcomes, predicted values and diagnostic replays must stay separate.

### Practical reading

Keep the confirmed values for a human playtest of v2. The next evidence worth gathering is whether fallback Critter hands feel useful, whether Robot repair creates satisfying choices, and how difficult a good Dragon engine feels to assemble. A fresh Normal Deck comparison and stronger/policy-diverse search would test how dependent these findings are on the current Wild Deck and completion heuristic. Battle agreement is reported only as a reference; it is not the balance objective.

Implementation conventions to review while playing: Reconfigure automatically exchanges one stat pip and one ordinary attack, preserving other stats; ultimates/hybrid specials cannot be exchanged for a stat. Shield costs remain2/1/0, and unit-valued hybrid/shield formulas remain whole numbers. The study uses the current preparation/copy/recycle implementation.

## Method

- Both seats use browser search, including preparation, with fixed samples per candidate and prep-lookahead completions. No neural training. Actual decks include Chameleon; only Threshold includes Shortcut and 2×.
- Distinct deal seeds per game; Draft first picker alternates. The same seed ranges are reused across rules, but different decks can produce different deals. Discard follows the existing sequential browser AI flow with hidden rival hands, not the simultaneous online submission flow.
- Faction means chosen main damage type after preparation, including Chameleon/Devour overrides. Faction share is descriptive. Non-mirror score = wins + half draws divided by games against other main factions (untyped rivals excluded); it is not a causal estimate of choosing that faction.
- Approximate 95% intervals use per-game non-mirror outcomes (one hand of a given faction per such game). Mirror hands are excluded from faction score to avoid double counting. Strategy groups overlap and can include both hands, so their scores are descriptive without independent-sample confidence claims.
- Search rollouts are correlated counterfactual continuations, not independent played games. The three largest search departures from the heuristic per run are rechecked with independent 256-world searches; selection makes these diagnostic examples, not strength evidence.
- Battle agreement compares the same final original printed cards using digital rounds. Games containing tabletop-only cards are excluded. Different winners are acceptable and do not measure strategic balance.

## Overall results

| Rules | Building | Deck | Samples | Games | Draws | Critter tie wins | P1 score |
|---|---|---|---:|---:|---:|---:|---:|
| abilities | draft | wild | 16 | 500 | 4.6% | 0 | 51.9% |
| abilities | five-hand-discard | wild | 16 | 500 | 5.2% | 0 | 51.0% |
| abilitiesv2 | draft | wild | 16 | 500 | 3.0% | 5 | 47.5% |
| abilitiesv2 | draft | wild | 16 | 100 | 6.0% | 1 | 51.0% |
| abilitiesv2 | draft | wild | 32 | 100 | 5.0% | 1 | 41.5% |
| abilitiesv2 | five-hand-discard | wild | 16 | 500 | 2.8% | 13 | 55.0% |
| abilitiesv2 | five-hand-discard | wild | 16 | 100 | 4.0% | 0 | 51.0% |
| abilitiesv2 | five-hand-discard | wild | 32 | 100 | 5.0% | 2 | 54.5% |
| threshold | draft | wild | 16 | 500 | 6.2% | 0 | 54.3% |
| threshold | five-hand-discard | wild | 16 | 500 | 6.0% | 0 | 50.6% |

## abilities / draft / wild / 16 samples

500 games; 7,758 actual decision roots; 629,376 root-candidate completions (nested preparation lookaheads are additional). First-picker score: 58.3%. Battle agreement: 78.0% of 423 comparable games.

| Main faction | Hand share | Non-mirror W/D/L | Score | Approx. 95% interval | Mean power |
|---|---:|---:|---:|---:|---:|
| critter | 12.6% | 32/4/69 | 32.4% | 23.6%–41.2% | 9.32 |
| robot | 35.9% | 126/14/95 | 56.6% | 50.4%–62.8% | 12.18 |
| dragon | 50.2% | 120/12/114 | 51.2% | 45.1%–57.3% | 13.09 |

Untyped hands: 13 of 1000.

| Faction | No opposing shield: score (n) | Opposing shield: score (n) | Natural main type: score (n) |
|---|---:|---:|---:|
| critter | 32.4% (94) | 31.8% (11) | 32.4% (105) |
| robot | 57.1% (212) | 52.2% (23) | 56.2% (233) |
| dragon | 50.2% (220) | 59.6% (26) | 53.8% (213) |

| Matchup | W/D/L for first faction | Score |
|---|---:|---:|
| critter vs robot | 14/3/30 | 33.0% |
| critter vs dragon | 18/1/39 | 31.9% |
| robot vs dragon | 96/11/81 | 54.0% |

| Mechanism / hand feature | Hands | Share | Descriptive score |
|---|---:|---:|---:|
| Adapt | 140 | 14.0% | 46.1% |
| Perfect Balance earned | 181 | 18.1% | 55.5% |
| Overwhelming earned | 265 | 26.5% | 73.6% |
| Chameleon | 79 | 7.9% | 46.2% |
| Draw 2 in final hand | 265 | 26.5% | 59.1% |
| 6+ final cards | 636 | 63.6% | 53.8% |

Search departed from the heuristic at 2622/6758 searched roots (38.8%).
Most frequent draft picks: draw_2_extra (349), copy_card_in_hand (330), recycle_card (317), dragon2 (307), joker (300), dragons_breath (299), devour (275), dragon_ulti (271). These counts also reflect card availability.

Decision probes (values are P(win) − P(loss), conditional on the search completion policy):

- Game 39, draft-opponent-thinking; hand: copy_card_in_hand, dragons_breath, shield2, robot_ulti. Baseline {"type":"draft-pick","uid":"dragon2__3","index":1,"cardId":"dragon2"}. Independent search chooses {"type":"draft-pick","uid":"robot1__1","index":3,"card":{"uid":"robot1__1","id":"robot1","name":"robot1","type":"stat","stats":["robot"],"effect":{},"cd":0}}; advantage 2.000 ± 0.000 (approx. 95% paired Monte Carlo interval).
- Game 119, draft-opponent-thinking; hand: rabbit2, joker, murder_rabbit, swarm. Baseline {"type":"draft-pick","uid":"critter1__7","index":2,"cardId":"critter1"}. Independent search chooses {"type":"draft-pick","uid":"devour__3","index":3,"card":{"uid":"devour__3","id":"devour","name":"Devour","type":"action","stats":[],"effect":{"dmg":2,"dmgType":"dragon"},"cd":0}}; advantage 2.000 ± 0.000 (approx. 95% paired Monte Carlo interval).
- Game 127, draft-opponent-thinking; hand: copy_card_in_hand, dragons_breath, any_off_each, critter1. Baseline {"type":"draft-pick","uid":"dragon1__5","index":3,"cardId":"dragon1"}. Independent search chooses {"type":"draft-pick","uid":"murder_rabbit__2","index":4,"card":{"uid":"murder_rabbit__2","id":"murder_rabbit","name":"Murder rabbit","type":"action","stats":[],"effect":{"dmg":2,"dmgType":"critter"},"cd":0}}; advantage 2.000 ± 0.000 (approx. 95% paired Monte Carlo interval).

## abilities / five-hand-discard / wild / 16 samples

500 games; 4,304 actual decision roots; 1,184,832 root-candidate completions (nested preparation lookaheads are additional). Battle agreement: 81.7% of 387 comparable games.

| Main faction | Hand share | Non-mirror W/D/L | Score | Approx. 95% interval | Mean power |
|---|---:|---:|---:|---:|---:|
| critter | 15.0% | 47/11/78 | 38.6% | 30.7%–46.5% | 7.35 |
| robot | 36.2% | 120/10/102 | 53.9% | 47.6%–60.2% | 8.12 |
| dragon | 47.6% | 131/13/118 | 52.5% | 46.6%–58.4% | 9.69 |

Untyped hands: 12 of 1000.

| Faction | No opposing shield: score (n) | Opposing shield: score (n) | Natural main type: score (n) |
|---|---:|---:|---:|
| critter | 38.9% (117) | 36.8% (19) | 38.6% (136) |
| robot | 52.0% (204) | 67.9% (28) | 54.1% (231) |
| dragon | 50.5% (222) | 63.7% (40) | 55.8% (214) |

| Matchup | W/D/L for first faction | Score |
|---|---:|---:|
| critter vs robot | 23/4/26 | 47.2% |
| critter vs dragon | 24/7/52 | 33.1% |
| robot vs dragon | 94/6/79 | 54.2% |

| Mechanism / hand feature | Hands | Share | Descriptive score |
|---|---:|---:|---:|
| Adapt | 149 | 14.9% | 51.3% |
| Perfect Balance earned | 169 | 16.9% | 55.3% |
| Overwhelming earned | 143 | 14.3% | 86.4% |
| Chameleon | 115 | 11.5% | 47.0% |
| Draw 2 in final hand | 216 | 21.6% | 59.0% |
| 6+ final cards | 522 | 52.2% | 54.5% |

Search departed from the heuristic at 1882/3304 searched roots (57.0%).
Discard size frequencies (number discarded: decisions): 0: 180; 1: 312; 2: 561; 3: 513; 4: 333; 5: 101.

Decision probes (values are P(win) − P(loss), conditional on the search completion policy):

- Game 159, opponent-discard-1; hand: dragons_breath, swarm, robot_ulti, critter1, copy_card_in_hand. Baseline {"type":"discard","mask":5,"selectedIds":["dragons_breath__3","robot_ulti__3"]}. Independent search chooses {"type":"discard","mask":11,"selectedIds":["dragons_breath__3","swarm__2","critter1__5"]}; advantage 0.422 ± 0.137 (approx. 95% paired Monte Carlo interval).
- Game 248, opponent-discard-1; hand: robot_attack, recycle_card, one_off_each, shield2, dragons_breath. Baseline {"type":"discard","mask":20,"selectedIds":["one_off_each__3","dragons_breath__6"]}. Independent search chooses {"type":"discard","mask":29,"selectedIds":["robot_attack__6","one_off_each__3","shield2__3","dragons_breath__6"]}; advantage 0.250 ± 0.154 (approx. 95% paired Monte Carlo interval).
- Game 11, player-discard-1; hand: any_off_each, robot_attack, murder_rabbit, chameleon, shield_is_dmg. Baseline {"type":"discard","mask":24,"selectedIds":["chameleon__3","shield_is_dmg__3"]}. Independent search chooses {"type":"discard","mask":30,"selectedIds":["robot_attack__6","murder_rabbit__1","chameleon__3","shield_is_dmg__3"]}; advantage 0.309 ± 0.153 (approx. 95% paired Monte Carlo interval).

## abilitiesv2 / draft / wild / 16 samples

500 games; 7,768 actual decision roots; 632,352 root-candidate completions (nested preparation lookaheads are additional). First-picker score: 55.1%. Battle agreement: 79.3% of 416 comparable games.

| Main faction | Hand share | Non-mirror W/D/L | Score | Approx. 95% interval | Mean power |
|---|---:|---:|---:|---:|---:|
| critter | 21.7% | 60/0/113 | 34.7% | 27.6%–41.8% | 10.40 |
| robot | 31.5% | 120/7/104 | 53.5% | 47.1%–59.8% | 14.13 |
| dragon | 46.0% | 144/7/107 | 57.2% | 51.2%–63.1% | 10.50 |

Untyped hands: 8 of 1000.

| Faction | No opposing shield: score (n) | Opposing shield: score (n) | Natural main type: score (n) |
|---|---:|---:|---:|
| critter | 33.3% (153) | 45.0% (20) | 29.4% (119) |
| robot | 53.1% (211) | 57.5% (20) | 53.5% (231) |
| dragon | 55.5% (228) | 70.0% (30) | 57.7% (235) |

| Matchup | W/D/L for first faction | Score |
|---|---:|---:|
| critter vs robot | 23/0/50 | 31.5% |
| critter vs dragon | 37/0/63 | 37.0% |
| robot vs dragon | 70/7/81 | 46.5% |

| Mechanism / hand feature | Hands | Share | Descriptive score |
|---|---:|---:|---:|
| Reconfigure stat→attack | 236 | 23.6% | 44.5% |
| Reconfigure attack→stat | 81 | 8.1% | 61.7% |
| Overwhelming earned | 273 | 27.3% | 72.7% |
| Chameleon | 85 | 8.5% | 46.5% |
| Draw 2 in final hand | 267 | 26.7% | 59.0% |
| 6+ final cards | 643 | 64.3% | 53.1% |

Holding these final hands and main-type choices fixed, removing only the v2 Dragon bonus from both sides changes 43/500 winners. The 273 Overwhelming hands score 59.9% without that bonus, versus 72.7% with it. This is a mechanical comparison, not a new-policy tournament. Critter tiebreaks at zero score: 0.

Search departed from the heuristic at 2534/6768 searched roots (37.4%).
Most frequent draft picks: copy_card_in_hand (343), draw_2_extra (339), recycle_card (321), dragon2 (319), dragons_breath (318), joker (308), dragon_ulti (290), devour (284). These counts also reflect card availability.

Decision probes (values are P(win) − P(loss), conditional on the search completion policy):

- Game 59, draft-opponent-thinking; hand: robot_dragon, dragons_breath, draw_2_extra, dragon_ulti. Baseline {"type":"draft-pick","uid":"dragon1__1","index":4,"cardId":"dragon1"}. Independent search chooses {"type":"draft-pick","uid":"recycle_card__1","index":3,"card":{"uid":"recycle_card__1","id":"recycle_card","name":"recycle_card","type":"action","stats":[],"effect":{},"cd":0}}; advantage 1.984 ± 0.022 (approx. 95% paired Monte Carlo interval).
- Game 61, draft-opponent-thinking; hand: recycle_card, copy_card_in_hand, copy_card_in_hand, robot_attack. Baseline {"type":"draft-pick","uid":"dragon1__2","index":3,"cardId":"dragon1"}. Independent search chooses {"type":"draft-pick","uid":"devour__1","index":2,"card":{"uid":"devour__1","id":"devour","name":"Devour","type":"action","stats":[],"effect":{"dmg":2,"dmgType":"dragon"},"cd":0}}; advantage 2.000 ± 0.000 (approx. 95% paired Monte Carlo interval).
- Game 98, draft-opponent-thinking; hand: one_off_each, bite, dragon_rabbit, joker. Baseline {"type":"draft-pick","uid":"murder_rabbit__3","index":0,"cardId":"murder_rabbit"}. Independent search chooses {"type":"draft-pick","uid":"copy_card_in_hand__2","index":2,"card":{"uid":"copy_card_in_hand__2","id":"copy_card_in_hand","name":"copy_card_in_hand","type":"action","stats":[],"effect":{},"cd":0}}; advantage 2.000 ± 0.000 (approx. 95% paired Monte Carlo interval).

## abilitiesv2 / draft / wild / 16 samples

100 games; 1,500 actual decision roots; 116,960 root-candidate completions (nested preparation lookaheads are additional). First-picker score: 54.0%. Battle agreement: 70.9% of 86 comparable games.

| Main faction | Hand share | Non-mirror W/D/L | Score | Approx. 95% interval | Mean power |
|---|---:|---:|---:|---:|---:|
| critter | 17.0% | 8/0/18 | 30.8% | 12.7%–48.9% | 7.32 |
| robot | 31.5% | 24/3/17 | 58.0% | 43.7%–72.2% | 13.98 |
| dragon | 50.5% | 22/3/19 | 53.4% | 39.0%–67.8% | 10.80 |

Untyped hands: 2 of 200.

| Faction | No opposing shield: score (n) | Opposing shield: score (n) | Natural main type: score (n) |
|---|---:|---:|---:|
| critter | 25.0% (20) | 50.0% (6) | 44.4% (18) |
| robot | 59.8% (41) | 33.3% (3) | 58.0% (44) |
| dragon | 54.9% (41) | 33.3% (3) | 53.4% (44) |

| Matchup | W/D/L for first faction | Score |
|---|---:|---:|
| critter vs robot | 5/0/8 | 38.5% |
| critter vs dragon | 3/0/10 | 23.1% |
| robot vs dragon | 16/3/12 | 56.5% |

| Mechanism / hand feature | Hands | Share | Descriptive score |
|---|---:|---:|---:|
| Reconfigure stat→attack | 43 | 21.5% | 52.3% |
| Reconfigure attack→stat | 8 | 4.0% | 62.5% |
| Overwhelming earned | 56 | 28.0% | 72.3% |
| Chameleon | 14 | 7.0% | 17.9% |
| Draw 2 in final hand | 55 | 27.5% | 48.2% |
| 6+ final cards | 112 | 56.0% | 51.3% |

Holding these final hands and main-type choices fixed, removing only the v2 Dragon bonus from both sides changes 9/100 winners. The 56 Overwhelming hands score 60.7% without that bonus, versus 72.3% with it. This is a mechanical comparison, not a new-policy tournament. Critter tiebreaks at zero score: 0.

Search departed from the heuristic at 438/1300 searched roots (33.7%).
Most frequent draft picks: copy_card_in_hand (74), draw_2_extra (68), dragons_breath (64), dragon_ulti (61), joker (61), recycle_card (59), devour (56), dragon2 (55). These counts also reflect card availability.

Decision probes (values are P(win) − P(loss), conditional on the search completion policy):

- Game 7, draft-opponent-thinking; hand: dragon_ulti, dragon_rabbit, dragon_ulti, dragon2. Baseline {"type":"draft-pick","uid":"joker__3","index":1,"cardId":"joker"}. Independent search chooses {"type":"draft-pick","uid":"copy_card_in_hand__3","index":0,"card":{"uid":"copy_card_in_hand__3","id":"copy_card_in_hand","name":"copy_card_in_hand","type":"action","stats":[],"effect":{},"cd":0,"tabletop":"abilitiesv2"}}; advantage 2.000 ± 0.000 (approx. 95% paired Monte Carlo interval).
- Game 48, draft-player-pick; hand: joker, dragon_rabbit, recycle_card, one_off_each. Baseline {"type":"draft-pick","uid":"robot2__2","index":4,"cardId":"robot2"}. Independent search chooses {"type":"draft-pick","uid":"dragon2__1","index":0,"card":{"uid":"dragon2__1","id":"dragon2","name":"dragon2","type":"stat","stats":["dragon","dragon"],"effect":{},"cd":0,"tabletop":"abilitiesv2"}}; advantage 1.816 ± 0.070 (approx. 95% paired Monte Carlo interval).
- Game 29, draft-opponent-thinking; hand: robot_ulti, robot2, draw_2_extra, robot_attack. Baseline {"type":"draft-pick","uid":"robot1__3","index":4,"cardId":"robot1"}. Independent search chooses {"type":"draft-pick","uid":"copy_card_in_hand__2","index":3,"card":{"uid":"copy_card_in_hand__2","id":"copy_card_in_hand","name":"copy_card_in_hand","type":"action","stats":[],"effect":{},"cd":0,"tabletop":"abilitiesv2"}}; advantage 1.477 ± 0.106 (approx. 95% paired Monte Carlo interval).

## abilitiesv2 / draft / wild / 32 samples

100 games; 1,494 actual decision roots; 232,384 root-candidate completions (nested preparation lookaheads are additional). First-picker score: 54.5%. Battle agreement: 77.3% of 88 comparable games.

| Main faction | Hand share | Non-mirror W/D/L | Score | Approx. 95% interval | Mean power |
|---|---:|---:|---:|---:|---:|
| critter | 15.5% | 10/0/18 | 35.7% | 17.6%–53.8% | 8.26 |
| robot | 29.5% | 27/2/18 | 59.6% | 45.7%–73.4% | 12.90 |
| dragon | 54.0% | 25/2/26 | 49.1% | 35.7%–62.4% | 11.13 |

Untyped hands: 2 of 200.

| Faction | No opposing shield: score (n) | Opposing shield: score (n) | Natural main type: score (n) |
|---|---:|---:|---:|
| critter | 30.4% (23) | 60.0% (5) | 42.1% (19) |
| robot | 57.8% (45) | 100.0% (2) | 59.6% (47) |
| dragon | 45.8% (48) | 80.0% (5) | 51.0% (51) |

| Matchup | W/D/L for first faction | Score |
|---|---:|---:|
| critter vs robot | 5/0/6 | 45.5% |
| critter vs dragon | 5/0/12 | 29.4% |
| robot vs dragon | 21/2/13 | 61.1% |

| Mechanism / hand feature | Hands | Share | Descriptive score |
|---|---:|---:|---:|
| Reconfigure stat→attack | 38 | 19.0% | 57.9% |
| Reconfigure attack→stat | 10 | 5.0% | 20.0% |
| Overwhelming earned | 56 | 28.0% | 73.2% |
| Chameleon | 12 | 6.0% | 25.0% |
| Draw 2 in final hand | 57 | 28.5% | 43.9% |
| 6+ final cards | 119 | 59.5% | 50.4% |

Holding these final hands and main-type choices fixed, removing only the v2 Dragon bonus from both sides changes 7/100 winners. The 56 Overwhelming hands score 62.5% without that bonus, versus 73.2% with it. This is a mechanical comparison, not a new-policy tournament. Critter tiebreaks at zero score: 0.

Search departed from the heuristic at 456/1294 searched roots (35.2%).
Most frequent draft picks: copy_card_in_hand (74), draw_2_extra (72), dragons_breath (67), joker (66), dragon_ulti (63), dragon2 (61), recycle_card (60), devour (59). These counts also reflect card availability.

Decision probes (values are P(win) − P(loss), conditional on the search completion policy):

- Game 7, draft-opponent-thinking; hand: dragon_ulti, dragon_rabbit, dragon_ulti, dragon2. Baseline {"type":"draft-pick","uid":"joker__3","index":1,"cardId":"joker"}. Independent search chooses {"type":"draft-pick","uid":"copy_card_in_hand__3","index":0,"card":{"uid":"copy_card_in_hand__3","id":"copy_card_in_hand","name":"copy_card_in_hand","type":"action","stats":[],"effect":{},"cd":0,"tabletop":"abilitiesv2"}}; advantage 2.000 ± 0.000 (approx. 95% paired Monte Carlo interval).
- Game 17, draft-opponent-thinking; hand: dragon2, one_off_each, recycle_card, robot1. Baseline {"type":"draft-pick","uid":"dragons_breath__3","index":2,"cardId":"dragons_breath"}. Independent search chooses {"type":"draft-pick","uid":"robot_dragon__2","index":3,"card":{"uid":"robot_dragon__2","id":"robot_dragon","name":"robot_dragon","type":"stat","stats":["robot","dragon"],"effect":{},"cd":0,"tabletop":"abilitiesv2"}}; advantage 1.781 ± 0.075 (approx. 95% paired Monte Carlo interval).
- Game 29, draft-opponent-thinking; hand: robot_ulti, robot2, draw_2_extra, robot_attack. Baseline {"type":"draft-pick","uid":"robot1__3","index":4,"cardId":"robot1"}. Independent search chooses {"type":"draft-pick","uid":"copy_card_in_hand__2","index":3,"card":{"uid":"copy_card_in_hand__2","id":"copy_card_in_hand","name":"copy_card_in_hand","type":"action","stats":[],"effect":{},"cd":0,"tabletop":"abilitiesv2"}}; advantage 1.477 ± 0.106 (approx. 95% paired Monte Carlo interval).

## abilitiesv2 / five-hand-discard / wild / 16 samples

500 games; 4,320 actual decision roots; 1,181,680 root-candidate completions (nested preparation lookaheads are additional). Battle agreement: 80.3% of 385 comparable games.

| Main faction | Hand share | Non-mirror W/D/L | Score | Approx. 95% interval | Mean power |
|---|---:|---:|---:|---:|---:|
| critter | 29.9% | 86/0/125 | 40.8% | 34.1%–47.4% | 7.40 |
| robot | 32.8% | 113/4/132 | 46.2% | 40.0%–52.3% | 8.41 |
| dragon | 36.5% | 145/4/87 | 62.3% | 56.1%–68.4% | 9.00 |

Untyped hands: 8 of 1000.

| Faction | No opposing shield: score (n) | Opposing shield: score (n) | Natural main type: score (n) |
|---|---:|---:|---:|
| critter | 41.3% (184) | 37.0% (27) | 43.4% (145) |
| robot | 44.0% (210) | 57.7% (39) | 46.2% (249) |
| dragon | 61.4% (210) | 69.2% (26) | 63.1% (217) |

| Matchup | W/D/L for first faction | Score |
|---|---:|---:|
| critter vs robot | 50/0/62 | 44.6% |
| critter vs dragon | 36/0/63 | 36.4% |
| robot vs dragon | 51/4/82 | 38.7% |

| Mechanism / hand feature | Hands | Share | Descriptive score |
|---|---:|---:|---:|
| Reconfigure stat→attack | 275 | 27.5% | 44.9% |
| Reconfigure attack→stat | 88 | 8.8% | 52.8% |
| Overwhelming earned | 135 | 13.5% | 90.4% |
| Chameleon | 117 | 11.7% | 36.8% |
| Draw 2 in final hand | 211 | 21.1% | 55.5% |
| 6+ final cards | 523 | 52.3% | 53.5% |

Holding these final hands and main-type choices fixed, removing only the v2 Dragon bonus from both sides changes 18/500 winners. The 135 Overwhelming hands score 78.5% without that bonus, versus 90.4% with it. This is a mechanical comparison, not a new-policy tournament. Critter tiebreaks at zero score: 0.

Search departed from the heuristic at 1868/3320 searched roots (56.3%).
Discard size frequencies (number discarded: decisions): 0: 209; 1: 316; 2: 555; 3: 494; 4: 331; 5: 95.

Decision probes (values are P(win) − P(loss), conditional on the search completion policy):

- Game 255, player-discard-2; hand: shield2, draw_all_new_1, robot_dragon, dragons_breath, robot1. Baseline {"type":"discard","mask":3,"selectedIds":["shield2__3","draw_all_new_1__2"]}. Independent search chooses {"type":"discard","mask":29,"selectedIds":["shield2__3","robot_dragon__2","dragons_breath__6","robot1__8"]}; advantage 0.570 ± 0.148 (approx. 95% paired Monte Carlo interval).
- Game 388, opponent-discard-1; hand: shield_is_dmg, swarm, one_off_each, robot1, devour. Baseline {"type":"discard","mask":5,"selectedIds":["shield_is_dmg__1","one_off_each__1"]}. Independent search chooses {"type":"discard","mask":15,"selectedIds":["shield_is_dmg__1","swarm__2","one_off_each__1","robot1__3"]}; advantage 0.309 ± 0.158 (approx. 95% paired Monte Carlo interval).
- Game 69, player-discard-2; hand: draw_all_new_1, robot_dragon, robot_attack, robot2, copy_card_in_hand. Baseline {"type":"discard","mask":5,"selectedIds":["draw_all_new_1__1","robot_attack__5"]}. Independent search chooses {"type":"discard","mask":1,"selectedIds":["draw_all_new_1__1"]}; advantage 0.359 ± 0.124 (approx. 95% paired Monte Carlo interval).

## abilitiesv2 / five-hand-discard / wild / 16 samples

100 games; 822 actual decision roots; 230,800 root-candidate completions (nested preparation lookaheads are additional). Battle agreement: 84.3% of 83 comparable games.

| Main faction | Hand share | Non-mirror W/D/L | Score | Approx. 95% interval | Mean power |
|---|---:|---:|---:|---:|---:|
| critter | 25.5% | 19/0/20 | 48.7% | 32.8%–64.6% | 7.61 |
| robot | 31.5% | 18/1/20 | 47.4% | 31.8%–63.1% | 8.19 |
| dragon | 42.0% | 26/1/23 | 53.0% | 39.2%–66.8% | 8.65 |

Untyped hands: 2 of 200.

| Faction | No opposing shield: score (n) | Opposing shield: score (n) | Natural main type: score (n) |
|---|---:|---:|---:|
| critter | 48.6% (37) | 50.0% (2) | 46.4% (28) |
| robot | 47.0% (33) | 50.0% (6) | 47.4% (39) |
| dragon | 51.1% (46) | 75.0% (4) | 58.1% (43) |

| Matchup | W/D/L for first faction | Score |
|---|---:|---:|
| critter vs robot | 7/0/7 | 50.0% |
| critter vs dragon | 12/0/13 | 48.0% |
| robot vs dragon | 11/1/13 | 46.0% |

| Mechanism / hand feature | Hands | Share | Descriptive score |
|---|---:|---:|---:|
| Reconfigure stat→attack | 52 | 26.0% | 57.7% |
| Reconfigure attack→stat | 16 | 8.0% | 34.4% |
| Overwhelming earned | 25 | 12.5% | 96.0% |
| Chameleon | 18 | 9.0% | 50.0% |
| Draw 2 in final hand | 37 | 18.5% | 54.1% |
| 6+ final cards | 96 | 48.0% | 53.1% |

Holding these final hands and main-type choices fixed, removing only the v2 Dragon bonus from both sides changes 3/100 winners. The 25 Overwhelming hands score 84.0% without that bonus, versus 96.0% with it. This is a mechanical comparison, not a new-policy tournament. Critter tiebreaks at zero score: 0.

Search departed from the heuristic at 363/622 searched roots (58.4%).
Discard size frequencies (number discarded: decisions): 0: 40; 1: 60; 2: 117; 3: 99; 4: 65; 5: 19.

Decision probes (values are P(win) − P(loss), conditional on the search completion policy):

- Game 21, player-discard-1; hand: swarm, robot_critter, draw_all_new_1, critter1, dragons_breath. Baseline {"type":"discard","mask":20,"selectedIds":["draw_all_new_1__1","dragons_breath__8"]}. Independent search chooses {"type":"discard","mask":26,"selectedIds":["robot_critter__1","critter1__2","dragons_breath__8"]}; advantage 0.508 ± 0.151 (approx. 95% paired Monte Carlo interval).
- Game 36, player-discard-1; hand: dragons_breath, one_off_each, robot_dragon, robot1, dragons_breath. Baseline {"type":"discard","mask":10,"selectedIds":["one_off_each__3","robot1__4"]}. Independent search chooses {"type":"discard","mask":27,"selectedIds":["dragons_breath__5","one_off_each__3","robot1__4","dragons_breath__7"]}; advantage 0.117 ± 0.168 (approx. 95% paired Monte Carlo interval).
- Game 11, player-discard-1; hand: shield2, swarm, murder_rabbit, robot1, dragons_breath. Baseline {"type":"discard","mask":20,"selectedIds":["murder_rabbit__2","dragons_breath__7"]}. Independent search chooses {"type":"discard","mask":27,"selectedIds":["shield2__2","swarm__5","robot1__4","dragons_breath__7"]}; advantage 0.348 ± 0.154 (approx. 95% paired Monte Carlo interval).

## abilitiesv2 / five-hand-discard / wild / 32 samples

100 games; 840 actual decision roots; 471,328 root-candidate completions (nested preparation lookaheads are additional). Battle agreement: 72.6% of 84 comparable games.

| Main faction | Hand share | Non-mirror W/D/L | Score | Approx. 95% interval | Mean power |
|---|---:|---:|---:|---:|---:|
| critter | 28.5% | 19/0/15 | 55.9% | 38.9%–72.8% | 8.35 |
| robot | 28.5% | 17/1/24 | 41.7% | 26.8%–56.6% | 9.28 |
| dragon | 41.0% | 27/1/24 | 52.9% | 39.3%–66.5% | 8.95 |

Untyped hands: 4 of 200.

| Faction | No opposing shield: score (n) | Opposing shield: score (n) | Natural main type: score (n) |
|---|---:|---:|---:|
| critter | 58.1% (31) | 33.3% (3) | 55.6% (27) |
| robot | 40.8% (38) | 50.0% (4) | 41.7% (42) |
| dragon | 54.3% (47) | 40.0% (5) | 53.1% (48) |

| Matchup | W/D/L for first faction | Score |
|---|---:|---:|
| critter vs robot | 9/0/3 | 75.0% |
| critter vs dragon | 10/0/12 | 45.5% |
| robot vs dragon | 14/1/15 | 48.3% |

| Mechanism / hand feature | Hands | Share | Descriptive score |
|---|---:|---:|---:|
| Reconfigure stat→attack | 58 | 29.0% | 51.7% |
| Reconfigure attack→stat | 14 | 7.0% | 53.6% |
| Overwhelming earned | 26 | 13.0% | 78.8% |
| Chameleon | 18 | 9.0% | 55.6% |
| Draw 2 in final hand | 27 | 13.5% | 74.1% |
| 6+ final cards | 88 | 44.0% | 61.4% |

Holding these final hands and main-type choices fixed, removing only the v2 Dragon bonus from both sides changes 3/100 winners. The 26 Overwhelming hands score 69.2% without that bonus, versus 78.8% with it. This is a mechanical comparison, not a new-policy tournament. Critter tiebreaks at zero score: 0.

Search departed from the heuristic at 380/640 searched roots (59.4%).
Discard size frequencies (number discarded: decisions): 0: 48; 1: 51; 2: 99; 3: 98; 4: 74; 5: 30.

Decision probes (values are P(win) − P(loss), conditional on the search completion policy):

- Game 6, opponent-discard-2; hand: draw_all_new_1, dragons_breath, draw_all_new_1, draw_2_extra, dragon1. Baseline {"type":"discard","mask":5,"selectedIds":["draw_all_new_1__1","draw_all_new_1__2"]}. Independent search chooses {"type":"discard","mask":18,"selectedIds":["dragons_breath__8","dragon1__4"]}; advantage 0.566 ± 0.128 (approx. 95% paired Monte Carlo interval).
- Game 15, player-discard-2; hand: draw_all_new_1, dragons_breath, robot2, dragon1, dragons_breath. Baseline {"type":"discard","mask":17,"selectedIds":["draw_all_new_1__1","dragons_breath__8"]}. Independent search chooses {"type":"discard","mask":26,"selectedIds":["dragons_breath__6","dragon1__6","dragons_breath__8"]}; advantage 0.582 ± 0.142 (approx. 95% paired Monte Carlo interval).
- Game 27, player-discard-2; hand: chameleon, chameleon, robot2, joker, shield_is_dmg. Baseline {"type":"discard","mask":18,"selectedIds":["chameleon__1","shield_is_dmg__3"]}. Independent search chooses {"type":"discard","mask":19,"selectedIds":["chameleon__2","chameleon__1","shield_is_dmg__3"]}; advantage 0.398 ± 0.118 (approx. 95% paired Monte Carlo interval).

## threshold / draft / wild / 16 samples

500 games; 7,558 actual decision roots; 587,552 root-candidate completions (nested preparation lookaheads are additional). First-picker score: 57.9%. Battle agreement: 78.2% of 326 comparable games.

| Main faction | Hand share | Non-mirror W/D/L | Score | Approx. 95% interval | Mean power |
|---|---:|---:|---:|---:|---:|
| critter | 12.3% | 28/4/82 | 26.3% | 18.4%–34.2% | 7.23 |
| robot | 36.1% | 101/15/116 | 46.8% | 40.5%–53.0% | 10.17 |
| dragon | 49.0% | 156/15/87 | 63.4% | 57.7%–69.1% | 9.79 |

Untyped hands: 26 of 1000.

| Faction | No opposing shield: score (n) | Opposing shield: score (n) | Natural main type: score (n) |
|---|---:|---:|---:|
| critter | 27.0% (102) | 20.8% (12) | 27.8% (108) |
| robot | 44.8% (213) | 68.4% (19) | 46.9% (225) |
| dragon | 60.7% (233) | 88.0% (25) | 62.7% (221) |

| Matchup | W/D/L for first faction | Score |
|---|---:|---:|
| critter vs robot | 13/2/29 | 31.8% |
| critter vs dragon | 15/2/53 | 22.9% |
| robot vs dragon | 72/13/103 | 41.8% |

| Mechanism / hand feature | Hands | Share | Descriptive score |
|---|---:|---:|---:|
| Chameleon | 91 | 9.1% | 39.0% |
| Shortcut | 107 | 10.7% | 51.4% |
| Draw 2 in final hand | 262 | 26.2% | 52.9% |
| 6+ final cards | 612 | 61.2% | 49.8% |

Search departed from the heuristic at 2514/6558 searched roots (38.3%).
Most frequent draft picks: draw_2_extra (311), joker (303), dragon2 (296), recycle_card (285), copy_card_in_hand (282), dragons_breath (278), dragon1 (275), devour (260). These counts also reflect card availability.

Decision probes (values are P(win) − P(loss), conditional on the search completion policy):

- Game 9, draft-opponent-thinking; hand: recycle_card, robot2, dragon2, one_off_each. Baseline {"type":"draft-pick","uid":"bite__1","index":4,"cardId":"bite"}. Independent search chooses {"type":"draft-pick","uid":"robot_dragon__3","index":0,"card":{"uid":"robot_dragon__3","id":"robot_dragon","name":"robot_dragon","type":"stat","stats":["robot","dragon"],"effect":{},"cd":0}}; advantage 2.000 ± 0.000 (approx. 95% paired Monte Carlo interval).
- Game 48, draft-player-pick; hand: robot2, robot1, any_off_each, robot_attack. Baseline {"type":"draft-pick","uid":"robot_critter__1","index":1,"cardId":"robot_critter"}. Independent search chooses {"type":"draft-pick","uid":"recycle_card__2","index":2,"card":{"uid":"recycle_card__2","id":"recycle_card","name":"recycle_card","type":"action","stats":[],"effect":{},"cd":0}}; advantage 2.000 ± 0.000 (approx. 95% paired Monte Carlo interval).
- Game 77, draft-opponent-thinking; hand: recycle_card, robot_attack, joker, dragon2. Baseline {"type":"draft-pick","uid":"one_off_each__3","index":1,"cardId":"one_off_each"}. Independent search chooses {"type":"draft-pick","uid":"copy_card_in_hand__3","index":4,"card":{"uid":"copy_card_in_hand__3","id":"copy_card_in_hand","name":"copy_card_in_hand","type":"action","stats":[],"effect":{},"cd":0}}; advantage 2.000 ± 0.000 (approx. 95% paired Monte Carlo interval).

## threshold / five-hand-discard / wild / 16 samples

500 games; 4,211 actual decision roots; 1,164,992 root-candidate completions (nested preparation lookaheads are additional). Battle agreement: 80.2% of 278 comparable games.

| Main faction | Hand share | Non-mirror W/D/L | Score | Approx. 95% interval | Mean power |
|---|---:|---:|---:|---:|---:|
| critter | 17.7% | 37/5/101 | 27.6% | 20.4%–34.8% | 5.90 |
| robot | 37.8% | 113/13/116 | 49.4% | 43.2%–55.5% | 7.55 |
| dragon | 40.3% | 151/14/84 | 63.5% | 57.6%–69.3% | 7.59 |

Untyped hands: 42 of 1000.

| Faction | No opposing shield: score (n) | Opposing shield: score (n) | Natural main type: score (n) |
|---|---:|---:|---:|
| critter | 26.7% (129) | 35.7% (14) | 30.6% (129) |
| robot | 47.7% (220) | 65.9% (22) | 49.6% (236) |
| dragon | 63.0% (220) | 67.2% (29) | 64.4% (201) |

| Matchup | W/D/L for first faction | Score |
|---|---:|---:|
| critter vs robot | 22/2/44 | 33.8% |
| critter vs dragon | 15/3/57 | 22.0% |
| robot vs dragon | 69/11/94 | 42.8% |

| Mechanism / hand feature | Hands | Share | Descriptive score |
|---|---:|---:|---:|
| Chameleon | 112 | 11.2% | 40.6% |
| Shortcut | 149 | 14.9% | 47.0% |
| Draw 2 in final hand | 207 | 20.7% | 56.5% |
| 6+ final cards | 490 | 49.0% | 53.6% |

Search departed from the heuristic at 1844/3211 searched roots (57.4%).
Discard size frequencies (number discarded: decisions): 0: 194; 1: 325; 2: 570; 3: 466; 4: 348; 5: 97.

Decision probes (values are P(win) − P(loss), conditional on the search completion policy):

- Game 454, player-discard-1; hand: dragon2, robot1, bite, chameleon, robot_dragon. Baseline {"type":"discard","mask":3,"selectedIds":["dragon2__2","robot1__6"]}. Independent search chooses {"type":"discard","mask":30,"selectedIds":["robot1__6","bite__1","chameleon__2","robot_dragon__3"]}; advantage 0.355 ± 0.156 (approx. 95% paired Monte Carlo interval).
- Game 129, opponent-discard-2; hand: dragons_breath, shortcut, swarm, any_off_each, swarm. Baseline {"type":"discard","mask":10,"selectedIds":["shortcut__3","any_off_each__1"]}. Independent search chooses {"type":"discard","mask":23,"selectedIds":["dragons_breath__1","shortcut__3","swarm__5","swarm__7"]}; advantage 0.637 ± 0.115 (approx. 95% paired Monte Carlo interval).
- Game 28, player-discard-1; hand: robot1, shield_is_dmg, chameleon, draw_2_extra, dragon1. Baseline {"type":"discard","mask":6,"selectedIds":["shield_is_dmg__1","chameleon__2"]}. Independent search chooses {"type":"discard","mask":23,"selectedIds":["robot1__8","shield_is_dmg__1","chameleon__2","dragon1__1"]}; advantage 0.270 ± 0.172 (approx. 95% paired Monte Carlo interval).

## Matched-deal search-budget check

Additional Abilities v2 games compare 16 versus 32 sampled worlds on the same fresh starting deals. Both seats use the budget under test. This checks outcome stability, not head-to-head AI strength. Subsequent hands can diverge because the policies make different choices.

| Building | Paired deals | Draws at 16 | Draws at 32 | Draw-rate change, approximate paired 95% interval |
|---|---:|---:|---:|---:|
| draft | 100 | 6.0% | 5.0% | -1.0 pp (-6.2 to 4.2) |
| five-hand-discard | 100 | 4.0% | 5.0% | 1.0 pp (-4.2 to 6.2) |

## Engine examples

Unshielded pure engines, calculated with the same resolver. These isolate the rule mechanics, not the difficulty of drafting the cards. Equal v2 scores favor Critters against the other factions.

| Engine | Rules | Critter score | Robot score | Dragon score |
|---|---|---:|---:|---:|
| 4 single stats + 1 attack | threshold | 5 | 6 | 4 |
| 4 single stats + 1 attack | abilities | 6 | 4 | 4 |
| 4 single stats + 1 attack | abilitiesv2 | 4 | 6 | 4 |
| 1 stat + 4 attacks | threshold | 5 | 6 | 4 |
| 1 stat + 4 attacks | abilities | 4 | 4 | 4 |
| 1 stat + 4 attacks | abilitiesv2 | 4 | 6 | 4 |
| 3 stats + 2 attacks | threshold | 7 | 8 | 6 |
| 3 stats + 2 attacks | abilities | 6 | 6 | 6 |
| 3 stats + 2 attacks | abilitiesv2 | 6 | 6 | 6 |
| Two double-stat cards + ultimate | threshold | 9 | 10 | 12 |
| Two double-stat cards + ultimate | abilities | 8 | 8 | 10 |
| Two double-stat cards + ultimate | abilitiesv2 | 8 | 9 | 12 |

## Evidence and reproduction

Local raw evidence: `.ai-runs/tabletop-confirmed-2026-10-21`. Each run saves manifest/rules/source hash, every game and final scoring breakdown, every decision and candidate values/WDL, progress, and complete root snapshots for decision probes. Summary: `.ai-runs/tabletop-confirmed-2026-10-21/summary.json`. Pilot/interrupted runs in other directories are excluded.

```powershell
node scripts/tabletop-balance.mjs abilitiesv2 draft 500 16 21000000 wild .ai-runs/new-study
node scripts/summarize-tabletop-balance.mjs .ai-runs/new-study docs/TABLETOP_BALANCE_RESULTS.md
```
