# Current New Cards balance baseline

Adopted 6 November 2026: Abilities+NewCards uses **73 Regular / 109 Wild cards**. From Nothing and Shield Ultimate are hidden from the deck and collection; their definitions and artwork remain available for possible restoration.

The pool includes Critter Guard (one Critter stat and one shield), 9 Swarms, 8 ordinary Robot attacks, 5 basic Dragon stat cards, and 7 ordinary Dragon attacks. Both Dragon double-damage attacks and Dragon shield immunity remain. Specialist and Critter Guard appear under Specials. The collection displays actual deck copies.

Selecting **Felix** in NC Draft uses the qualified FelixNC draft checkpoint `e9b03e264b3e486fa93fb8f7a084a62b683540d405c7a57bcf8ce85d632958af` and native preparation bounded to 12,000 nodes / depth 8. Other rules retain the existing Felix behavior. Model weights were copied unchanged.

## Reviewed balance test

The adopted pool was evaluated in 3,000 FelixNC mirror games, matched to saved controls by parent shuffle, first picker and private RNG initialization. Remove only From Nothing from each 74-card control shuffle, preserving remaining order. Controls were reused, not regenerated.

| Faction | Main-faction choices | Choice share | Wins | Win rate when chosen |
|---|---:|---:|---:|---:|
| Critter | 2,199 | 36.65% | 925 | 42.06% |
| Robot | 1,996 | 33.27% | 940 | 47.09% |
| Dragon | 1,805 | 30.08% | 942 | 52.19% |

Draws: 193. Choices count all 6,000 final hands. Compared with the saved controls, Critter wins/all games rose 2.87 percentage points (paired marginal 95% interval +1.70 to +4.00); Robot changed −0.23 (−1.37 to +0.87); Dragon fell 2.83 (−3.97 to −1.67). These are exploratory effects under the frozen policy, not a guarantee of balance under adapted or optimal play. Keep combat faction, damage engine and stat supply distinct.

Validation retained every outcome and 15,000 actual draft prefixes; checks covered source/model pins, paired physical decks, independent combat arithmetic, encoded values/labels and sampled official/policy/privacy replays. No additional fitting was performed.
