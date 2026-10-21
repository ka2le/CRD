# Tabletop faction and card analysis — 2026-10-21

Reanalysis of the six main Wild Deck arms: 500 games per ruleset/building mode, both players using the in-game search with 16 samples per candidate. 3,000 games / 6,000 final hands. The extra 400 budget-check games are excluded, avoiding repeated deals and mixed search budgets.

## Verdict

Abilities v2 is promising for low draws and more frequent Critter play, but these games do not establish balance. Dragons have the most wins in both building modes; their advantage against other factions is clearest in Discard. Robots remain competitive in Draft. Critters are improved as a frequently played fallback, but still lose more often than they win. That can fit the intended identity; it does not show whether switching to Critters was the best available decision.

Joker has the largest winner-versus-loser presence gap in both v2 modes. One of Each, double Dragon stats, Dragon ultimates, and preparation resources also stand out. Basic Dragon Breath is more frequent among losers despite Dragon faction success: completing a strong engine matters more than simply holding a Dragon attack. Low single-Robot-stat results do not demonstrate that Reconfigure is weak; it can rescue a hand that would otherwise be even worse.

The deck is a material caveat: the tested Wild pool reverses the intended Critter advantage in stat availability. Normal contains 16/14/12 printed C/R/D stat pips; Wild contains 18/22/20. Wild increases single-copy cards to three copies, while two-copy cards stay at two. Dragons also have two ultimate-strength definitions (Dragon Ultimate and Devour). This is a reason to test Normal before adjusting the class abilities from these results alone.

## How to read the numbers

- Faction is the chosen main damage class after preparation, including Chameleon/Devour overrides. Mixed hands still receive one main label. Faction wins include mirror matches; share of wins is different from win rate when that faction is played.
- Card presence counts a hand once if it contains at least one copy. All artwork/copies of the basic Critter attack are grouped as Swarm; ultimates and Bite remain separate. Copies per 100 hands also shows duplication. Stats ×2 means two stat pips on one card.
- All = percentage of all final hands containing the card. Winners / Losers / Draws = percentage within those outcome groups containing it. Win when held = wins divided by all hands holding it, with draws counted as non-wins. These are associations, not the result of replacing another card with this one.
- Ready-hand presence is measured at each player’s first preparation decision, after Draft/Discard. Activated means the card’s preparation action was actually selected at least once, including copies and cards drawn during preparation. Copy transforms and Redraw replaces a hand, so final-hand presence is especially misleading for those cards.
- Deck availability, AI preferences, hand size, combos, and fallback choices affect these results. Both hands in a game are related. JSON includes paired approximate 95% intervals for winner-minus-loser final-card presence; these are exploratory and not corrected for testing many cards.
- No claim of optimal play, Normal Deck balance, human fun, or causal faction strength. Discard uses the existing sequential local AI flow. The pooled v2 table weights Draft and Discard equally; separate tables below are preferable when their patterns differ.

## Faction outcomes

| Rules | Building | Main faction | Hands | Wins / draws / losses | Share of all wins | Win when played | Non-mirror score* |
|---|---|---|---:|---:|---:|---:|---:|
| threshold | Draft | critter | 123 | 34 / 4 / 85 | 7.2% | 27.6% | 26.3% |
| threshold | Draft | robot | 361 | 166 / 25 / 170 | 35.4% | 46.0% | 46.8% |
| threshold | Draft | dragon | 490 | 269 / 33 / 188 | 57.4% | 54.9% | 63.4% |
| threshold | Draft | untyped | 26 | 0 / 0 / 26 | 0.0% | 0.0% | — |
| threshold | Discard | critter | 177 | 56 / 9 / 112 | 11.9% | 31.6% | 27.6% |
| threshold | Discard | robot | 378 | 181 / 24 / 173 | 38.5% | 47.9% | 49.4% |
| threshold | Discard | dragon | 403 | 233 / 23 / 147 | 49.6% | 57.8% | 63.5% |
| threshold | Discard | untyped | 42 | 0 / 4 / 38 | 0.0% | 0.0% | — |
| abilities | Draft | critter | 126 | 43 / 4 / 79 | 9.0% | 34.1% | 32.4% |
| abilities | Draft | robot | 359 | 189 / 18 / 152 | 39.6% | 52.6% | 56.6% |
| abilities | Draft | dragon | 502 | 245 / 24 / 233 | 51.4% | 48.8% | 51.2% |
| abilities | Draft | untyped | 13 | 0 / 0 / 13 | 0.0% | 0.0% | — |
| abilities | Discard | critter | 150 | 56 / 11 / 83 | 11.8% | 37.3% | 38.6% |
| abilities | Discard | robot | 362 | 182 / 20 / 160 | 38.4% | 50.3% | 53.9% |
| abilities | Discard | dragon | 476 | 236 / 21 / 219 | 49.8% | 49.6% | 52.5% |
| abilities | Discard | untyped | 12 | 0 / 0 / 12 | 0.0% | 0.0% | — |
| abilitiesv2 | Draft | critter | 217 | 82 / 2 / 133 | 16.9% | 37.8% | 34.7% |
| abilitiesv2 | Draft | robot | 315 | 162 / 11 / 142 | 33.4% | 51.4% | 53.5% |
| abilitiesv2 | Draft | dragon | 460 | 241 / 17 / 202 | 49.7% | 52.4% | 57.2% |
| abilitiesv2 | Draft | untyped | 8 | 0 / 0 / 8 | 0.0% | 0.0% | — |
| abilitiesv2 | Discard | critter | 299 | 130 / 2 / 167 | 26.7% | 43.5% | 40.8% |
| abilitiesv2 | Discard | robot | 328 | 150 / 12 / 166 | 30.9% | 45.7% | 46.2% |
| abilitiesv2 | Discard | dragon | 365 | 206 / 14 / 145 | 42.4% | 56.4% | 62.3% |
| abilitiesv2 | Discard | untyped | 8 | 0 / 0 / 8 | 0.0% | 0.0% | — |

*Non-mirror score counts a draw as half a win and excludes untyped opponents. Unlike win-when-played, it removes same-faction matchups.

## Printed deck composition

Counts include every printed stat pip, including mixed cards and Joker; preparation and automatic class conversions are excluded. Two-damage attack counts exclude unit-formula specials.

| Deck | Cards | Critter stat pips | Robot stat pips | Dragon stat pips | Critter / Robot / Dragon ultimate-strength cards |
|---|---:|---:|---:|---:|---:|
| Normal | 70 | 16 | 14 | 12 | 1 / 1 / 2 |
| Wild | 102 | 18 | 22 | 20 | 3 / 3 / 6 |

## V2 combination and hand-size associations

| Building | Feature | Hands | Wins / draws / losses | Win rate |
|---|---|---:|---:|---:|
| Draft | Joker + One of Each | 92 | 74 / 2 / 16 | 80.4% |
| Draft | Joker without One of Each | 254 | 138 / 5 / 111 | 54.3% |
| Draft | One of Each without Joker | 116 | 56 / 6 / 54 | 48.3% |
| Draft | Neither Joker nor One of Each | 538 | 217 / 17 / 304 | 40.3% |
| Draft | Dragon ×2 + Dragon Ultimate/Devour | 194 | 133 / 8 / 53 | 68.6% |
| Draft | Exactly five final cards | 357 | 154 / 9 / 194 | 43.1% |
| Draft | Six or more final cards | 643 | 331 / 21 / 291 | 51.5% |
| Discard | Joker + One of Each | 62 | 49 / 0 / 13 | 79.0% |
| Discard | Joker without One of Each | 229 | 136 / 4 / 89 | 59.4% |
| Discard | One of Each without Joker | 93 | 40 / 2 / 51 | 43.0% |
| Discard | Neither Joker nor One of Each | 616 | 261 / 22 / 333 | 42.4% |
| Discard | Dragon ×2 + Dragon Ultimate/Devour | 118 | 85 / 5 / 28 | 72.0% |
| Discard | Exactly five final cards | 477 | 211 / 18 / 248 | 44.2% |
| Discard | Six or more final cards | 523 | 275 / 10 / 238 | 52.6% |

Feature groups overlap except the four mutually exclusive Joker/One of Each groups. These are selected final hands, not controlled tests of adding a card.

## Abilities v2 combined overview

1000 games; 2000 hands; 971 winning hands, 971 losing hands, 58 drawn hands. Final-hand presence:

| Card | Present hands | All | Winners | Losers | Draws | Win when held | Copies / 100 hands |
|---|---:|---:|---:|---:|---:|---:|---:|
| Critter stat ×1 | 495 | 24.8% | 22.3% | 27.3% | 22.4% | 43.8% | 30.2 |
| Critter stat ×2 | 268 | 13.4% | 14.0% | 12.9% | 12.1% | 50.7% | 14.1 |
| Basic Critter attack (all art) | 567 | 28.3% | 24.8% | 32.5% | 17.2% | 42.5% | 34.0 |
| Murder Rabbit | 377 | 18.9% | 19.2% | 19.1% | 10.3% | 49.3% | 21.1 |
| Robot stat ×1 | 593 | 29.6% | 25.2% | 34.5% | 22.4% | 41.3% | 35.9 |
| Robot stat ×2 | 504 | 25.2% | 24.7% | 25.4% | 29.3% | 47.6% | 31.6 |
| Basic Robot attack | 510 | 25.5% | 25.6% | 24.8% | 34.5% | 48.8% | 30.3 |
| Robot Ultimate | 438 | 21.9% | 22.1% | 21.5% | 24.1% | 49.1% | 25.3 |
| Dragon stat ×1 | 657 | 32.9% | 33.1% | 32.2% | 39.7% | 48.9% | 38.9 |
| Dragon stat ×2 | 591 | 29.5% | 34.7% | 24.0% | 36.2% | 57.0% | 33.9 |
| Dragon Breath | 714 | 35.7% | 32.6% | 38.3% | 43.1% | 44.4% | 44.5 |
| Dragon Ultimate | 502 | 25.1% | 28.6% | 21.7% | 22.4% | 55.4% | 29.5 |
| Devour | 498 | 24.9% | 29.4% | 19.9% | 34.5% | 57.2% | 29.6 |
| Robot + Critter stat | 270 | 13.5% | 14.5% | 12.9% | 6.9% | 52.2% | 15.1 |
| Robot + Dragon stat | 485 | 24.3% | 27.0% | 21.3% | 27.6% | 54.0% | 26.6 |
| Dragon + Critter stat | 333 | 16.7% | 17.5% | 16.1% | 12.1% | 51.1% | 18.5 |
| Joker (all three stats) | 637 | 31.9% | 40.9% | 23.6% | 19.0% | 62.3% | 39.5 |
| One of Each (C × R × D) | 363 | 18.1% | 22.6% | 13.8% | 17.2% | 60.3% | 19.3 |
| Any of Each (C + R + D) | 520 | 26.0% | 27.9% | 24.4% | 20.7% | 52.1% | 29.8 |
| Shield ×2 | 245 | 12.3% | 10.5% | 14.0% | 12.1% | 41.6% | 12.9 |
| Shield Is Damage | 185 | 9.3% | 6.8% | 11.8% | 6.9% | 35.7% | 9.7 |
| Bite | 167 | 8.3% | 7.4% | 9.4% | 6.9% | 43.1% | 8.6 |
| Chameleon | 202 | 10.1% | 8.4% | 12.3% | 1.7% | 40.6% | 10.6 |
| Draw 2 | 478 | 23.9% | 27.7% | 20.4% | 19.0% | 56.3% | 31.8 |
| Redraw | 75 | 3.8% | 5.1% | 2.2% | 6.9% | 66.7% | 3.8 |
| Copy | 0 | 0.0% | 0.0% | 0.0% | 0.0% | — | 0.0 |
| Recycle | 501 | 25.1% | 29.2% | 20.6% | 29.3% | 56.7% | 28.1 |

## threshold — Draft

500 games / 1000 hands: 469 winners, 469 losers, 62 drawn hands (31 drawn games).

| Card | Present hands | All | Winners | Losers | Draws | Win when held | Copies / 100 hands |
|---|---:|---:|---:|---:|---:|---:|---:|
| Critter stat ×1 | 222 | 22.2% | 18.8% | 27.1% | 11.3% | 39.6% | 26.8 |
| Critter stat ×2 | 133 | 13.3% | 12.4% | 15.1% | 6.5% | 43.6% | 13.9 |
| Basic Critter attack (all art) | 228 | 22.8% | 19.8% | 27.1% | 12.9% | 40.8% | 28.2 |
| Murder Rabbit | 159 | 15.9% | 14.3% | 17.5% | 16.1% | 42.1% | 17.4 |
| Robot stat ×1 | 300 | 30.0% | 27.3% | 33.0% | 27.4% | 42.7% | 37.4 |
| Robot stat ×2 | 225 | 22.5% | 24.1% | 20.9% | 22.6% | 50.2% | 25.7 |
| Basic Robot attack | 239 | 23.9% | 24.3% | 24.7% | 14.5% | 47.7% | 28.4 |
| Robot Ultimate | 238 | 23.8% | 27.3% | 20.5% | 22.6% | 53.8% | 27.6 |
| Dragon stat ×1 | 348 | 34.8% | 31.3% | 37.7% | 38.7% | 42.2% | 41.2 |
| Dragon stat ×2 | 287 | 28.7% | 33.3% | 24.9% | 22.6% | 54.4% | 33.1 |
| Dragon Breath | 333 | 33.3% | 29.0% | 36.0% | 45.2% | 40.8% | 41.4 |
| Dragon Ultimate | 238 | 23.8% | 27.3% | 20.0% | 25.8% | 53.8% | 28.0 |
| Devour | 279 | 27.9% | 33.5% | 22.8% | 24.2% | 56.3% | 32.1 |
| Robot + Critter stat | 111 | 11.1% | 12.2% | 10.2% | 9.7% | 51.4% | 12.4 |
| Robot + Dragon stat | 243 | 24.3% | 25.4% | 22.4% | 30.6% | 49.0% | 27.1 |
| Dragon + Critter stat | 150 | 15.0% | 18.1% | 12.2% | 12.9% | 56.7% | 17.2 |
| Joker (all three stats) | 323 | 32.3% | 40.1% | 23.5% | 40.3% | 58.2% | 39.2 |
| One of Each (C × R × D) | 205 | 20.5% | 22.6% | 19.2% | 14.5% | 51.7% | 21.6 |
| Any of Each (C + R + D) | 286 | 28.6% | 30.5% | 26.0% | 33.9% | 50.0% | 33.1 |
| Shield ×2 | 89 | 8.9% | 6.2% | 12.2% | 4.8% | 32.6% | 9.7 |
| Shield Is Damage | 78 | 7.8% | 6.2% | 9.8% | 4.8% | 37.2% | 8.2 |
| Bite | 82 | 8.2% | 5.3% | 11.7% | 3.2% | 30.5% | 8.8 |
| Chameleon | 91 | 9.1% | 7.2% | 11.5% | 4.8% | 37.4% | 9.5 |
| Draw 2 | 262 | 26.2% | 28.4% | 25.2% | 17.7% | 50.8% | 32.5 |
| Redraw | 38 | 3.8% | 6.4% | 0.9% | 6.5% | 78.9% | 3.8 |
| Copy | 0 | 0.0% | 0.0% | 0.0% | 0.0% | — | 0.0 |
| Recycle | 239 | 23.9% | 28.1% | 19.6% | 24.2% | 55.2% | 27.6 |
| Shortcut | 107 | 10.7% | 11.1% | 10.4% | 9.7% | 48.6% | 11.1 |
| 2× bonus | 135 | 13.5% | 15.1% | 12.8% | 6.5% | 52.6% | 15.2 |

### Preparation cards: entering preparation and actual use

| Card | Ready hands | Ready: winners / losers | Ready: win when held | Activated hands | Activated: wins / draws / losses | Win when activated |
|---|---:|---:|---:|---:|---:|---:|
| Copy | 266 (26.6%) | 29.9% / 23.2% | 52.6% | 335 | 180 / 21 / 134 | 53.7% |
| Draw 2 | 293 (29.3%) | 33.3% / 26.9% | 53.2% | 335 | 182 / 12 / 141 | 54.3% |
| Redraw | 232 (23.2%) | 23.5% / 23.7% | 47.4% | 248 | 111 / 9 / 128 | 44.8% |
| Recycle | 265 (26.5%) | 29.2% / 23.9% | 51.7% | 315 | 174 / 18 / 123 | 55.2% |

### All cards entering preparation

| Card | Deck copies | Ready presence | Ready: winners | Ready: losers |
|---|---:|---:|---:|---:|
| Critter stat ×1 | 7 | 10.1% | 7.9% | 12.6% |
| Critter stat ×2 | 2 | 9.9% | 7.9% | 12.2% |
| Basic Critter attack (all art) | 8 | 9.4% | 8.5% | 10.9% |
| Murder Rabbit | 3 | 11.2% | 9.8% | 12.6% |
| Robot stat ×1 | 8 | 17.3% | 14.1% | 20.5% |
| Robot stat ×2 | 3 | 19.2% | 19.2% | 19.4% |
| Basic Robot attack | 6 | 15.0% | 13.0% | 18.1% |
| Robot Ultimate | 3 | 19.0% | 19.4% | 19.0% |
| Dragon stat ×1 | 6 | 25.0% | 22.2% | 27.5% |
| Dragon stat ×2 | 3 | 27.2% | 29.9% | 24.3% |
| Dragon Breath | 8 | 24.7% | 20.7% | 26.4% |
| Dragon Ultimate | 3 | 21.0% | 22.6% | 19.2% |
| Devour | 3 | 24.4% | 26.4% | 22.4% |
| Robot + Critter stat | 2 | 7.6% | 9.2% | 6.2% |
| Robot + Dragon stat | 3 | 20.8% | 19.8% | 21.1% |
| Dragon + Critter stat | 2 | 11.1% | 12.8% | 9.6% |
| Joker (all three stats) | 3 | 28.1% | 30.5% | 24.3% |
| One of Each (C × R × D) | 3 | 15.2% | 16.6% | 14.3% |
| Any of Each (C + R + D) | 3 | 22.8% | 21.3% | 23.2% |
| Shield ×2 | 3 | 3.1% | 1.9% | 4.3% |
| Shield Is Damage | 3 | 0.8% | 0.9% | 0.6% |
| Bite | 2 | 5.1% | 3.8% | 6.6% |
| Chameleon | 3 | 2.8% | 2.8% | 3.2% |
| Draw 2 | 3 | 29.3% | 33.3% | 26.9% |
| Redraw | 3 | 23.2% | 23.5% | 23.7% |
| Copy | 3 | 26.6% | 29.9% | 23.2% |
| Recycle | 3 | 26.5% | 29.2% | 23.9% |
| Shortcut | 3 | 5.9% | 5.1% | 6.6% |
| 2× bonus | 3 | 6.8% | 6.4% | 7.7% |

## threshold — Discard

500 games / 1000 hands: 470 winners, 470 losers, 60 drawn hands (30 drawn games).

| Card | Present hands | All | Winners | Losers | Draws | Win when held | Copies / 100 hands |
|---|---:|---:|---:|---:|---:|---:|---:|
| Critter stat ×1 | 264 | 26.4% | 25.3% | 27.7% | 25.0% | 45.1% | 30.1 |
| Critter stat ×2 | 135 | 13.5% | 14.9% | 12.1% | 13.3% | 51.9% | 14.4 |
| Basic Critter attack (all art) | 283 | 28.3% | 23.0% | 34.5% | 21.7% | 38.2% | 34.8 |
| Murder Rabbit | 173 | 17.3% | 16.4% | 18.3% | 16.7% | 44.5% | 18.9 |
| Robot stat ×1 | 307 | 30.7% | 26.0% | 35.3% | 31.7% | 39.7% | 37.5 |
| Robot stat ×2 | 199 | 19.9% | 20.9% | 18.5% | 23.3% | 49.2% | 21.0 |
| Basic Robot attack | 272 | 27.2% | 26.6% | 27.7% | 28.3% | 46.0% | 30.5 |
| Robot Ultimate | 226 | 22.6% | 23.4% | 21.7% | 23.3% | 48.7% | 24.7 |
| Dragon stat ×1 | 281 | 28.1% | 28.3% | 27.0% | 35.0% | 47.3% | 31.7 |
| Dragon stat ×2 | 224 | 22.4% | 28.7% | 16.4% | 20.0% | 60.3% | 24.8 |
| Dragon Breath | 344 | 34.4% | 33.4% | 34.9% | 38.3% | 45.6% | 41.0 |
| Dragon Ultimate | 203 | 20.3% | 22.1% | 18.1% | 23.3% | 51.2% | 23.1 |
| Devour | 198 | 19.8% | 24.3% | 16.2% | 13.3% | 57.6% | 21.3 |
| Robot + Critter stat | 150 | 15.0% | 17.2% | 13.8% | 6.7% | 54.0% | 16.7 |
| Robot + Dragon stat | 236 | 23.6% | 27.7% | 18.7% | 30.0% | 55.1% | 26.5 |
| Dragon + Critter stat | 145 | 14.5% | 15.5% | 13.8% | 11.7% | 50.3% | 16.0 |
| Joker (all three stats) | 275 | 27.5% | 37.4% | 18.1% | 23.3% | 64.0% | 32.5 |
| One of Each (C × R × D) | 154 | 15.4% | 16.4% | 14.5% | 15.0% | 50.0% | 16.1 |
| Any of Each (C + R + D) | 259 | 25.9% | 31.7% | 20.4% | 23.3% | 57.5% | 30.0 |
| Shield ×2 | 108 | 10.8% | 8.5% | 12.3% | 16.7% | 37.0% | 11.9 |
| Shield Is Damage | 121 | 12.1% | 7.2% | 16.8% | 13.3% | 28.1% | 12.3 |
| Bite | 92 | 9.2% | 8.7% | 10.4% | 3.3% | 44.6% | 9.8 |
| Chameleon | 112 | 11.2% | 8.9% | 13.4% | 11.7% | 37.5% | 11.9 |
| Draw 2 | 207 | 20.7% | 23.4% | 17.7% | 23.3% | 53.1% | 28.0 |
| Redraw | 48 | 4.8% | 6.2% | 3.4% | 5.0% | 60.4% | 4.9 |
| Copy | 0 | 0.0% | 0.0% | 0.0% | 0.0% | — | 0.0 |
| Recycle | 204 | 20.4% | 23.0% | 17.9% | 20.0% | 52.9% | 23.5 |
| Shortcut | 149 | 14.9% | 14.0% | 16.0% | 13.3% | 44.3% | 15.7 |
| 2× bonus | 128 | 12.8% | 11.5% | 14.7% | 8.3% | 42.2% | 13.6 |

### Preparation cards: entering preparation and actual use

| Card | Ready hands | Ready: winners / losers | Ready: win when held | Activated hands | Activated: wins / draws / losses | Win when activated |
|---|---:|---:|---:|---:|---:|---:|
| Copy | 192 (19.2%) | 18.9% / 19.1% | 46.4% | 243 | 124 / 14 / 105 | 51.0% |
| Draw 2 | 227 (22.7%) | 27.2% / 18.1% | 56.4% | 254 | 145 / 15 / 94 | 57.1% |
| Redraw | 187 (18.7%) | 19.6% / 17.4% | 49.2% | 186 | 94 / 13 / 79 | 50.5% |
| Recycle | 206 (20.6%) | 22.3% / 18.9% | 51.0% | 251 | 135 / 14 / 102 | 53.8% |

### All cards entering preparation

| Card | Deck copies | Ready presence | Ready: winners | Ready: losers |
|---|---:|---:|---:|---:|
| Critter stat ×1 | 7 | 18.9% | 17.4% | 20.6% |
| Critter stat ×2 | 2 | 10.2% | 11.5% | 9.1% |
| Basic Critter attack (all art) | 8 | 20.9% | 15.5% | 26.8% |
| Murder Rabbit | 3 | 13.8% | 12.3% | 15.5% |
| Robot stat ×1 | 8 | 24.0% | 20.2% | 27.9% |
| Robot stat ×2 | 3 | 15.5% | 15.1% | 15.1% |
| Basic Robot attack | 6 | 18.8% | 18.1% | 18.7% |
| Robot Ultimate | 3 | 19.3% | 18.7% | 19.1% |
| Dragon stat ×1 | 6 | 20.5% | 19.4% | 21.3% |
| Dragon stat ×2 | 3 | 19.0% | 23.0% | 15.5% |
| Dragon Breath | 8 | 27.6% | 23.8% | 31.3% |
| Dragon Ultimate | 3 | 18.3% | 18.1% | 18.1% |
| Devour | 3 | 16.2% | 19.6% | 13.4% |
| Robot + Critter stat | 2 | 11.9% | 12.3% | 12.1% |
| Robot + Dragon stat | 3 | 19.0% | 21.5% | 16.2% |
| Dragon + Critter stat | 2 | 12.5% | 13.2% | 11.7% |
| Joker (all three stats) | 3 | 22.6% | 28.3% | 17.7% |
| One of Each (C × R × D) | 3 | 10.2% | 10.4% | 10.2% |
| Any of Each (C + R + D) | 3 | 20.9% | 24.7% | 17.2% |
| Shield ×2 | 3 | 8.1% | 6.0% | 9.6% |
| Shield Is Damage | 3 | 7.7% | 3.8% | 11.7% |
| Bite | 2 | 7.3% | 6.8% | 8.1% |
| Chameleon | 3 | 6.9% | 6.6% | 7.2% |
| Draw 2 | 3 | 22.7% | 27.2% | 18.1% |
| Redraw | 3 | 18.7% | 19.6% | 17.4% |
| Copy | 3 | 19.2% | 18.9% | 19.1% |
| Recycle | 3 | 20.6% | 22.3% | 18.9% |
| Shortcut | 3 | 10.9% | 9.1% | 12.6% |
| 2× bonus | 3 | 7.9% | 6.4% | 9.6% |

## abilities — Draft

500 games / 1000 hands: 477 winners, 477 losers, 46 drawn hands (23 drawn games).

| Card | Present hands | All | Winners | Losers | Draws | Win when held | Copies / 100 hands |
|---|---:|---:|---:|---:|---:|---:|---:|
| Critter stat ×1 | 274 | 27.4% | 25.2% | 30.0% | 23.9% | 43.8% | 33.0 |
| Critter stat ×2 | 159 | 15.9% | 15.7% | 16.1% | 15.2% | 47.2% | 18.0 |
| Basic Critter attack (all art) | 246 | 24.6% | 22.4% | 27.3% | 19.6% | 43.5% | 32.3 |
| Murder Rabbit | 183 | 18.3% | 17.4% | 18.9% | 21.7% | 45.4% | 21.6 |
| Robot stat ×1 | 258 | 25.8% | 26.2% | 25.6% | 23.9% | 48.4% | 32.2 |
| Robot stat ×2 | 236 | 23.6% | 21.8% | 24.7% | 30.4% | 44.1% | 25.7 |
| Basic Robot attack | 232 | 23.2% | 22.6% | 24.3% | 17.4% | 46.6% | 27.7 |
| Robot Ultimate | 242 | 24.2% | 25.2% | 23.3% | 23.9% | 49.6% | 26.8 |
| Dragon stat ×1 | 333 | 33.3% | 34.6% | 32.1% | 32.6% | 49.5% | 40.3 |
| Dragon stat ×2 | 336 | 33.6% | 40.9% | 26.4% | 32.6% | 58.0% | 38.1 |
| Dragon Breath | 378 | 37.8% | 33.1% | 41.3% | 50.0% | 41.8% | 49.9 |
| Dragon Ultimate | 298 | 29.8% | 33.5% | 26.6% | 23.9% | 53.7% | 37.2 |
| Devour | 279 | 27.9% | 31.9% | 23.9% | 28.3% | 54.5% | 34.7 |
| Robot + Critter stat | 123 | 12.3% | 12.2% | 12.4% | 13.0% | 47.2% | 13.1 |
| Robot + Dragon stat | 228 | 22.8% | 24.9% | 20.3% | 26.1% | 52.2% | 24.9 |
| Dragon + Critter stat | 181 | 18.1% | 19.3% | 16.8% | 19.6% | 50.8% | 19.6 |
| Joker (all three stats) | 340 | 34.0% | 41.5% | 27.3% | 26.1% | 58.2% | 41.7 |
| One of Each (C × R × D) | 215 | 21.5% | 26.4% | 15.7% | 30.4% | 58.6% | 22.9 |
| Any of Each (C + R + D) | 250 | 25.0% | 27.7% | 23.1% | 17.4% | 52.8% | 29.4 |
| Shield ×2 | 104 | 10.4% | 9.0% | 11.7% | 10.9% | 41.3% | 11.5 |
| Shield Is Damage | 87 | 8.7% | 6.9% | 10.9% | 4.3% | 37.9% | 9.0 |
| Bite | 79 | 7.9% | 5.7% | 10.1% | 8.7% | 34.2% | 8.3 |
| Chameleon | 79 | 7.9% | 7.3% | 8.6% | 6.5% | 44.3% | 8.4 |
| Draw 2 | 265 | 26.5% | 31.9% | 21.8% | 19.6% | 57.4% | 34.9 |
| Redraw | 50 | 5.0% | 8.0% | 1.9% | 6.5% | 76.0% | 5.0 |
| Copy | 0 | 0.0% | 0.0% | 0.0% | 0.0% | — | 0.0 |
| Recycle | 265 | 26.5% | 34.0% | 19.9% | 17.4% | 61.1% | 30.2 |

### Preparation cards: entering preparation and actual use

| Card | Ready hands | Ready: winners / losers | Ready: win when held | Activated hands | Activated: wins / draws / losses | Win when activated |
|---|---:|---:|---:|---:|---:|---:|
| Copy | 303 (30.3%) | 34.6% / 26.2% | 54.5% | 370 | 213 / 15 / 142 | 57.6% |
| Draw 2 | 322 (32.2%) | 41.9% / 23.1% | 62.1% | 355 | 216 / 13 / 126 | 60.8% |
| Redraw | 235 (23.5%) | 23.1% / 24.1% | 46.8% | 265 | 122 / 11 / 132 | 46.0% |
| Recycle | 298 (29.8%) | 32.3% / 27.9% | 51.7% | 353 | 202 / 12 / 139 | 57.2% |

### All cards entering preparation

| Card | Deck copies | Ready presence | Ready: winners | Ready: losers |
|---|---:|---:|---:|---:|
| Critter stat ×1 | 7 | 13.4% | 11.7% | 15.7% |
| Critter stat ×2 | 2 | 12.3% | 10.7% | 13.4% |
| Basic Critter attack (all art) | 8 | 10.1% | 7.8% | 11.9% |
| Murder Rabbit | 3 | 11.7% | 9.9% | 13.2% |
| Robot stat ×1 | 8 | 12.6% | 11.7% | 13.2% |
| Robot stat ×2 | 3 | 17.6% | 15.9% | 18.9% |
| Basic Robot attack | 6 | 11.2% | 9.9% | 13.4% |
| Robot Ultimate | 3 | 19.2% | 19.3% | 19.1% |
| Dragon stat ×1 | 6 | 24.7% | 25.4% | 23.9% |
| Dragon stat ×2 | 3 | 28.2% | 30.6% | 25.8% |
| Dragon Breath | 8 | 25.8% | 23.1% | 27.5% |
| Dragon Ultimate | 3 | 24.9% | 26.8% | 23.3% |
| Devour | 3 | 24.6% | 24.5% | 24.5% |
| Robot + Critter stat | 2 | 9.2% | 8.2% | 10.5% |
| Robot + Dragon stat | 3 | 16.2% | 15.7% | 16.6% |
| Dragon + Critter stat | 2 | 14.9% | 11.7% | 17.4% |
| Joker (all three stats) | 3 | 27.6% | 29.4% | 26.0% |
| One of Each (C × R × D) | 3 | 14.7% | 15.3% | 14.0% |
| Any of Each (C + R + D) | 3 | 21.7% | 21.0% | 22.6% |
| Shield ×2 | 3 | 5.2% | 4.4% | 6.1% |
| Shield Is Damage | 3 | 1.2% | 0.6% | 1.3% |
| Bite | 2 | 3.6% | 3.4% | 3.8% |
| Chameleon | 3 | 1.4% | 0.8% | 2.1% |
| Draw 2 | 3 | 32.2% | 41.9% | 23.1% |
| Redraw | 3 | 23.5% | 23.1% | 24.1% |
| Copy | 3 | 30.3% | 34.6% | 26.2% |
| Recycle | 3 | 29.8% | 32.3% | 27.9% |

## abilities — Discard

500 games / 1000 hands: 474 winners, 474 losers, 52 drawn hands (26 drawn games).

| Card | Present hands | All | Winners | Losers | Draws | Win when held | Copies / 100 hands |
|---|---:|---:|---:|---:|---:|---:|---:|
| Critter stat ×1 | 300 | 30.0% | 27.0% | 31.6% | 42.3% | 42.7% | 35.8 |
| Critter stat ×2 | 149 | 14.9% | 16.2% | 13.3% | 17.3% | 51.7% | 16.8 |
| Basic Critter attack (all art) | 301 | 30.1% | 25.9% | 34.8% | 25.0% | 40.9% | 34.4 |
| Murder Rabbit | 166 | 16.6% | 17.5% | 16.0% | 13.5% | 50.0% | 19.4 |
| Robot stat ×1 | 308 | 30.8% | 25.7% | 36.9% | 21.2% | 39.6% | 36.5 |
| Robot stat ×2 | 185 | 18.5% | 18.6% | 18.6% | 17.3% | 47.6% | 20.3 |
| Basic Robot attack | 295 | 29.5% | 27.4% | 31.9% | 26.9% | 44.1% | 35.6 |
| Robot Ultimate | 227 | 22.7% | 25.3% | 20.0% | 23.1% | 52.9% | 25.2 |
| Dragon stat ×1 | 300 | 30.0% | 29.1% | 32.3% | 17.3% | 46.0% | 36.1 |
| Dragon stat ×2 | 247 | 24.7% | 31.0% | 18.4% | 25.0% | 59.5% | 26.6 |
| Dragon Breath | 346 | 34.6% | 30.6% | 38.2% | 38.5% | 41.9% | 42.5 |
| Dragon Ultimate | 206 | 20.6% | 24.9% | 16.0% | 23.1% | 57.3% | 24.4 |
| Devour | 219 | 21.9% | 27.2% | 16.5% | 23.1% | 58.9% | 25.3 |
| Robot + Critter stat | 137 | 13.7% | 13.3% | 13.5% | 19.2% | 46.0% | 14.9 |
| Robot + Dragon stat | 227 | 22.7% | 27.0% | 17.7% | 28.8% | 56.4% | 25.9 |
| Dragon + Critter stat | 166 | 16.6% | 17.1% | 16.0% | 17.3% | 48.8% | 17.9 |
| Joker (all three stats) | 307 | 30.7% | 39.9% | 23.4% | 13.5% | 61.6% | 37.5 |
| One of Each (C × R × D) | 168 | 16.8% | 17.1% | 17.1% | 11.5% | 48.2% | 18.1 |
| Any of Each (C + R + D) | 250 | 25.0% | 30.8% | 19.6% | 21.2% | 58.4% | 29.4 |
| Shield ×2 | 134 | 13.4% | 11.8% | 15.2% | 11.5% | 41.8% | 13.8 |
| Shield Is Damage | 100 | 10.0% | 6.5% | 13.7% | 7.7% | 31.0% | 10.6 |
| Bite | 79 | 7.9% | 7.8% | 8.2% | 5.8% | 46.8% | 8.4 |
| Chameleon | 115 | 11.5% | 11.2% | 12.7% | 3.8% | 46.1% | 12.0 |
| Draw 2 | 216 | 21.6% | 26.4% | 18.1% | 9.6% | 57.9% | 27.4 |
| Redraw | 41 | 4.1% | 4.6% | 3.0% | 9.6% | 53.7% | 4.1 |
| Copy | 0 | 0.0% | 0.0% | 0.0% | 0.0% | — | 0.0 |
| Recycle | 240 | 24.0% | 28.1% | 19.8% | 25.0% | 55.4% | 27.0 |

### Preparation cards: entering preparation and actual use

| Card | Ready hands | Ready: winners / losers | Ready: win when held | Activated hands | Activated: wins / draws / losses | Win when activated |
|---|---:|---:|---:|---:|---:|---:|
| Copy | 235 (23.5%) | 26.2% / 20.5% | 52.8% | 290 | 165 / 16 / 109 | 56.9% |
| Draw 2 | 242 (24.2%) | 30.6% / 19.4% | 59.9% | 265 | 163 / 6 / 96 | 61.5% |
| Redraw | 209 (20.9%) | 21.9% / 19.6% | 49.8% | 204 | 110 / 7 / 87 | 53.9% |
| Recycle | 230 (23.0%) | 24.7% / 21.1% | 50.9% | 283 | 160 / 14 / 109 | 56.5% |

### All cards entering preparation

| Card | Deck copies | Ready presence | Ready: winners | Ready: losers |
|---|---:|---:|---:|---:|
| Critter stat ×1 | 7 | 21.8% | 19.6% | 22.6% |
| Critter stat ×2 | 2 | 12.0% | 12.4% | 11.2% |
| Basic Critter attack (all art) | 8 | 20.4% | 14.6% | 26.4% |
| Murder Rabbit | 3 | 12.1% | 11.4% | 12.9% |
| Robot stat ×1 | 8 | 23.3% | 20.7% | 27.2% |
| Robot stat ×2 | 3 | 14.8% | 13.3% | 16.0% |
| Basic Robot attack | 6 | 20.8% | 18.8% | 22.8% |
| Robot Ultimate | 3 | 17.3% | 16.5% | 17.5% |
| Dragon stat ×1 | 6 | 23.3% | 21.5% | 26.4% |
| Dragon stat ×2 | 3 | 20.6% | 25.1% | 16.0% |
| Dragon Breath | 8 | 26.0% | 22.2% | 29.5% |
| Dragon Ultimate | 3 | 17.2% | 20.0% | 13.9% |
| Devour | 3 | 18.2% | 21.3% | 15.2% |
| Robot + Critter stat | 2 | 10.3% | 8.2% | 11.8% |
| Robot + Dragon stat | 3 | 19.6% | 20.7% | 17.3% |
| Dragon + Critter stat | 2 | 13.1% | 13.1% | 12.9% |
| Joker (all three stats) | 3 | 25.1% | 30.8% | 20.5% |
| One of Each (C × R × D) | 3 | 11.2% | 10.8% | 12.4% |
| Any of Each (C + R + D) | 3 | 22.3% | 27.2% | 17.5% |
| Shield ×2 | 3 | 8.4% | 6.1% | 10.8% |
| Shield Is Damage | 3 | 7.2% | 4.0% | 10.1% |
| Bite | 2 | 6.5% | 5.3% | 7.8% |
| Chameleon | 3 | 8.6% | 7.4% | 10.1% |
| Draw 2 | 3 | 24.2% | 30.6% | 19.4% |
| Redraw | 3 | 20.9% | 21.9% | 19.6% |
| Copy | 3 | 23.5% | 26.2% | 20.5% |
| Recycle | 3 | 23.0% | 24.7% | 21.1% |

## abilitiesv2 — Draft

500 games / 1000 hands: 485 winners, 485 losers, 30 drawn hands (15 drawn games).

| Card | Present hands | All | Winners | Losers | Draws | Win when held | Copies / 100 hands |
|---|---:|---:|---:|---:|---:|---:|---:|
| Critter stat ×1 | 230 | 23.0% | 20.8% | 25.4% | 20.0% | 43.9% | 28.9 |
| Critter stat ×2 | 126 | 12.6% | 13.0% | 12.2% | 13.3% | 50.0% | 13.5 |
| Basic Critter attack (all art) | 246 | 24.6% | 21.6% | 28.2% | 13.3% | 42.7% | 30.5 |
| Murder Rabbit | 180 | 18.0% | 17.7% | 18.8% | 10.0% | 47.8% | 20.3 |
| Robot stat ×1 | 277 | 27.7% | 25.4% | 30.3% | 23.3% | 44.4% | 33.1 |
| Robot stat ×2 | 269 | 26.9% | 27.6% | 26.4% | 23.3% | 49.8% | 34.2 |
| Basic Robot attack | 242 | 24.2% | 24.5% | 23.9% | 23.3% | 49.2% | 29.9 |
| Robot Ultimate | 218 | 21.8% | 22.5% | 21.2% | 20.0% | 50.0% | 25.5 |
| Dragon stat ×1 | 351 | 35.1% | 33.6% | 36.3% | 40.0% | 46.4% | 41.9 |
| Dragon stat ×2 | 335 | 33.5% | 39.4% | 27.0% | 43.3% | 57.0% | 39.7 |
| Dragon Breath | 372 | 37.2% | 33.8% | 40.4% | 40.0% | 44.1% | 46.9 |
| Dragon Ultimate | 295 | 29.5% | 31.8% | 27.0% | 33.3% | 52.2% | 35.8 |
| Devour | 283 | 28.3% | 31.8% | 24.1% | 40.0% | 54.4% | 34.7 |
| Robot + Critter stat | 127 | 12.7% | 13.2% | 12.6% | 6.7% | 50.4% | 14.1 |
| Robot + Dragon stat | 239 | 23.9% | 25.6% | 21.6% | 33.3% | 51.9% | 26.0 |
| Dragon + Critter stat | 179 | 17.9% | 20.0% | 15.9% | 16.7% | 54.2% | 19.3 |
| Joker (all three stats) | 346 | 34.6% | 43.7% | 26.2% | 23.3% | 61.3% | 43.5 |
| One of Each (C × R × D) | 208 | 20.8% | 26.8% | 14.4% | 26.7% | 62.5% | 22.2 |
| Any of Each (C + R + D) | 258 | 25.8% | 26.4% | 25.4% | 23.3% | 49.6% | 29.5 |
| Shield ×2 | 105 | 10.5% | 9.1% | 12.0% | 10.0% | 41.9% | 11.3 |
| Shield Is Damage | 87 | 8.7% | 6.4% | 11.1% | 6.7% | 35.6% | 9.0 |
| Bite | 72 | 7.2% | 6.2% | 8.5% | 3.3% | 41.7% | 7.6 |
| Chameleon | 85 | 8.5% | 8.0% | 9.3% | 3.3% | 45.9% | 9.0 |
| Draw 2 | 267 | 26.7% | 32.0% | 22.1% | 16.7% | 58.1% | 35.0 |
| Redraw | 46 | 4.6% | 7.0% | 1.9% | 10.0% | 73.9% | 4.6 |
| Copy | 0 | 0.0% | 0.0% | 0.0% | 0.0% | — | 0.0 |
| Recycle | 271 | 27.1% | 32.0% | 21.2% | 43.3% | 57.2% | 30.5 |

### Preparation cards: entering preparation and actual use

| Card | Ready hands | Ready: winners / losers | Ready: win when held | Activated hands | Activated: wins / draws / losses | Win when activated |
|---|---:|---:|---:|---:|---:|---:|
| Copy | 311 (31.1%) | 35.5% / 27.0% | 55.3% | 387 | 219 / 10 / 158 | 56.6% |
| Draw 2 | 320 (32.0%) | 39.2% / 24.7% | 59.4% | 362 | 215 / 10 / 137 | 59.4% |
| Redraw | 231 (23.1%) | 22.7% / 23.1% | 47.6% | 262 | 122 / 8 / 132 | 46.6% |
| Recycle | 301 (30.1%) | 31.1% / 28.5% | 50.2% | 353 | 196 / 14 / 143 | 55.5% |

### All cards entering preparation

| Card | Deck copies | Ready presence | Ready: winners | Ready: losers |
|---|---:|---:|---:|---:|
| Critter stat ×1 | 7 | 9.3% | 6.6% | 12.0% |
| Critter stat ×2 | 2 | 8.8% | 8.0% | 9.9% |
| Basic Critter attack (all art) | 8 | 10.8% | 8.2% | 13.4% |
| Murder Rabbit | 3 | 11.9% | 9.7% | 14.4% |
| Robot stat ×1 | 8 | 12.6% | 9.7% | 15.3% |
| Robot stat ×2 | 3 | 20.1% | 20.2% | 20.6% |
| Basic Robot attack | 6 | 13.0% | 13.0% | 13.4% |
| Robot Ultimate | 3 | 15.3% | 14.6% | 16.1% |
| Dragon stat ×1 | 6 | 25.3% | 24.9% | 25.4% |
| Dragon stat ×2 | 3 | 29.6% | 31.5% | 27.0% |
| Dragon Breath | 8 | 27.1% | 23.9% | 30.9% |
| Dragon Ultimate | 3 | 26.2% | 27.8% | 24.1% |
| Devour | 3 | 25.1% | 26.8% | 22.9% |
| Robot + Critter stat | 2 | 9.4% | 9.1% | 10.1% |
| Robot + Dragon stat | 3 | 17.7% | 18.8% | 16.1% |
| Dragon + Critter stat | 2 | 13.2% | 13.2% | 13.2% |
| Joker (all three stats) | 3 | 28.2% | 30.5% | 26.4% |
| One of Each (C × R × D) | 3 | 13.4% | 14.6% | 11.3% |
| Any of Each (C + R + D) | 3 | 20.1% | 16.9% | 23.1% |
| Shield ×2 | 3 | 4.3% | 4.1% | 4.5% |
| Shield Is Damage | 3 | 1.4% | 1.2% | 1.6% |
| Bite | 2 | 2.7% | 2.3% | 3.3% |
| Chameleon | 3 | 1.7% | 0.8% | 2.7% |
| Draw 2 | 3 | 32.0% | 39.2% | 24.7% |
| Redraw | 3 | 23.1% | 22.7% | 23.1% |
| Copy | 3 | 31.1% | 35.5% | 27.0% |
| Recycle | 3 | 30.1% | 31.1% | 28.5% |

## abilitiesv2 — Discard

500 games / 1000 hands: 486 winners, 486 losers, 28 drawn hands (14 drawn games).

| Card | Present hands | All | Winners | Losers | Draws | Win when held | Copies / 100 hands |
|---|---:|---:|---:|---:|---:|---:|---:|
| Critter stat ×1 | 265 | 26.5% | 23.9% | 29.2% | 25.0% | 43.8% | 31.5 |
| Critter stat ×2 | 142 | 14.2% | 15.0% | 13.6% | 10.7% | 51.4% | 14.7 |
| Basic Critter attack (all art) | 321 | 32.1% | 28.0% | 36.8% | 21.4% | 42.4% | 37.6 |
| Murder Rabbit | 197 | 19.7% | 20.6% | 19.3% | 10.7% | 50.8% | 21.9 |
| Robot stat ×1 | 316 | 31.6% | 25.1% | 38.7% | 21.4% | 38.6% | 38.6 |
| Robot stat ×2 | 235 | 23.5% | 21.8% | 24.5% | 35.7% | 45.1% | 29.1 |
| Basic Robot attack | 268 | 26.8% | 26.7% | 25.7% | 46.4% | 48.5% | 30.7 |
| Robot Ultimate | 220 | 22.0% | 21.8% | 21.8% | 28.6% | 48.2% | 25.0 |
| Dragon stat ×1 | 306 | 30.6% | 32.5% | 28.2% | 39.3% | 51.6% | 35.9 |
| Dragon stat ×2 | 256 | 25.6% | 30.0% | 21.0% | 28.6% | 57.0% | 28.0 |
| Dragon Breath | 342 | 34.2% | 31.5% | 36.2% | 46.4% | 44.7% | 42.2 |
| Dragon Ultimate | 207 | 20.7% | 25.5% | 16.5% | 10.7% | 59.9% | 23.2 |
| Devour | 215 | 21.5% | 27.0% | 15.6% | 28.6% | 60.9% | 24.4 |
| Robot + Critter stat | 143 | 14.3% | 15.8% | 13.2% | 7.1% | 53.8% | 16.1 |
| Robot + Dragon stat | 246 | 24.6% | 28.4% | 21.0% | 21.4% | 56.1% | 27.3 |
| Dragon + Critter stat | 154 | 15.4% | 15.0% | 16.3% | 7.1% | 47.4% | 17.7 |
| Joker (all three stats) | 291 | 29.1% | 38.1% | 21.0% | 14.3% | 63.6% | 35.5 |
| One of Each (C × R × D) | 155 | 15.5% | 18.3% | 13.2% | 7.1% | 57.4% | 16.4 |
| Any of Each (C + R + D) | 262 | 26.2% | 29.4% | 23.5% | 17.9% | 54.6% | 30.0 |
| Shield ×2 | 140 | 14.0% | 11.9% | 16.0% | 14.3% | 41.4% | 14.6 |
| Shield Is Damage | 98 | 9.8% | 7.2% | 12.6% | 7.1% | 35.7% | 10.3 |
| Bite | 95 | 9.5% | 8.6% | 10.3% | 10.7% | 44.2% | 9.6 |
| Chameleon | 117 | 11.7% | 8.8% | 15.2% | 0.0% | 36.8% | 12.2 |
| Draw 2 | 211 | 21.1% | 23.5% | 18.7% | 21.4% | 54.0% | 28.6 |
| Redraw | 29 | 2.9% | 3.3% | 2.5% | 3.6% | 55.2% | 2.9 |
| Copy | 0 | 0.0% | 0.0% | 0.0% | 0.0% | — | 0.0 |
| Recycle | 230 | 23.0% | 26.5% | 20.0% | 14.3% | 56.1% | 25.8 |

### Preparation cards: entering preparation and actual use

| Card | Ready hands | Ready: winners / losers | Ready: win when held | Activated hands | Activated: wins / draws / losses | Win when activated |
|---|---:|---:|---:|---:|---:|---:|
| Copy | 243 (24.3%) | 25.1% / 23.7% | 50.2% | 297 | 159 / 8 / 130 | 53.5% |
| Draw 2 | 234 (23.4%) | 27.6% / 19.3% | 57.3% | 268 | 160 / 5 / 103 | 59.7% |
| Redraw | 203 (20.3%) | 21.6% / 19.3% | 51.7% | 210 | 115 / 3 / 92 | 54.8% |
| Recycle | 222 (22.2%) | 25.1% / 20.0% | 55.0% | 271 | 154 / 4 / 113 | 56.8% |

### All cards entering preparation

| Card | Deck copies | Ready presence | Ready: winners | Ready: losers |
|---|---:|---:|---:|---:|
| Critter stat ×1 | 7 | 20.5% | 16.5% | 24.9% |
| Critter stat ×2 | 2 | 10.9% | 10.9% | 10.9% |
| Basic Critter attack (all art) | 8 | 22.9% | 19.3% | 26.5% |
| Murder Rabbit | 3 | 15.4% | 14.6% | 16.7% |
| Robot stat ×1 | 8 | 23.9% | 19.8% | 28.2% |
| Robot stat ×2 | 3 | 20.1% | 17.5% | 21.8% |
| Basic Robot attack | 6 | 18.0% | 15.2% | 19.8% |
| Robot Ultimate | 3 | 16.4% | 15.2% | 16.9% |
| Dragon stat ×1 | 6 | 22.9% | 22.8% | 21.8% |
| Dragon stat ×2 | 3 | 20.3% | 24.1% | 16.7% |
| Dragon Breath | 8 | 27.8% | 24.3% | 31.1% |
| Dragon Ultimate | 3 | 16.7% | 20.4% | 13.4% |
| Devour | 3 | 17.6% | 21.0% | 13.8% |
| Robot + Critter stat | 2 | 10.5% | 10.5% | 10.7% |
| Robot + Dragon stat | 3 | 20.4% | 22.4% | 18.5% |
| Dragon + Critter stat | 2 | 11.8% | 11.3% | 12.3% |
| Joker (all three stats) | 3 | 23.8% | 29.0% | 19.1% |
| One of Each (C × R × D) | 3 | 10.1% | 10.3% | 10.5% |
| Any of Each (C + R + D) | 3 | 22.0% | 24.5% | 20.0% |
| Shield ×2 | 3 | 8.8% | 7.4% | 9.9% |
| Shield Is Damage | 3 | 6.4% | 3.7% | 9.1% |
| Bite | 2 | 6.0% | 4.5% | 7.2% |
| Chameleon | 3 | 7.4% | 4.9% | 10.1% |
| Draw 2 | 3 | 23.4% | 27.6% | 19.3% |
| Redraw | 3 | 20.3% | 21.6% | 19.3% |
| Copy | 3 | 24.3% | 25.1% | 23.7% |
| Recycle | 3 | 22.2% | 25.1% | 20.0% |

## Reproduce

```powershell
node scripts/analyze-tabletop-cards.mjs .ai-runs/tabletop-confirmed-2026-10-21 docs/TABLETOP_CARD_ANALYSIS.md
```

Machine-readable counts, rates, and paired intervals: `.ai-runs/tabletop-confirmed-2026-10-21/card-analysis.json`. Original games and decision logs remain unchanged.
