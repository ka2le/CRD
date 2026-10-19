# Gameplay rules

The menu's optional **Tabletop battle** setting applies to both Draft and Discard: one power calculation, main-type commitment, class-specific shield reduction and cumulative bonuses replace the digital round combat described below. `TABLETOP_MODE.md` is the authoritative reference for that mode and its approved integer specials.

Reviewed 2026-10-18. These rules describe the shared game model and supported effects. Known implementation exceptions are identified explicitly; they do not silently redefine design intent. See `CURRENT_STATE.md` for the source review.

## Match structure

Two players build five-card hands using either 5 Hand Discard or Draft. Optional preparation follows, then automatic combat. The browser currently provides one human and one AI seat. Preparation may increase the combat hand beyond five.

## 5 Hand Discard

1. Deal five cards to each side from one shuffled deck.
2. Choose zero through five cards to discard and refill those positions.
3. Repeat once: there are exactly two discard/refill passes.
4. Enter preparation after the second pass.

Choosing zero still spends a pass. Currently the human refills first and the AI resolves one discard/refill pass afterward. No discard reshuffle occurs on exhaustion; draw helpers take the available deck prefix. Exhaustion/replacement edge cases need explicit rules before custom small decks become normal play.

## Draft

1. Reveal five cards face up in a shared row.
2. The first picker takes one; the other side takes one of the remaining cards.
3. Discard the remaining three and reveal five new cards.
4. The previous second picker becomes the next first picker.
5. After five packs, both sides have five cards and enter preparation.

The first picker of the first pack should alternate between games. Current exceptions: the first New Game after initialization repeats the human starter, and final-pack leftovers are cleared without entering discard. These are implementation issues, not intended rules.

## Stats and attacks

Stat cards contribute their listed class symbols. Repeated symbols count separately; multi-class cards contribute to each listed class. Every class-scaled attack independently deals `matching stat total * effect.dmg` on its active rounds. Flat attacks do not require stats. Stats alone deal no damage.

Base attacks: Critter 1 per stat at CD 1; Robot 2 per stat at CD 2; Dragon 3 per stat at CD 3. Stronger attacks and special formulas are in `CARD_LIBRARY.md`.

## Preparation

Supported IDs are `draw_2_extra`, `draw_all_new_1`, `copy_card_in_hand`, and `recycle_card`. They have CD 0, but CD 0 alone does not grant an implemented effect.

- Activate available highlighted cards before Battle in a chosen order; starting Battle skips unused player specials.
- Each card identity can activate once in that preparation state.
- Draw 2 adds up to two deck cards; the source stays in hand.
- Draw all new +1 discards the entire current hand, including the source, and draws that count plus one.
- Copy transforms its source into another non-copy card in the same hand. The fresh copied identity can activate a copied preparation effect independently.
- Recycle adds one chosen available discard to hand and removes it from that list. Its source stays in hand.

Preparation is private and has no turn order between players. Newly drawn, copied or recovered supported specials can become eligible. Pressing Battle completes all remaining AI preparation before combat starts, while unused human specials are skipped. AI preparation is committed only at Battle, so it is not revealed during human preparation. Battle waits for any already-started human redraw to finish.

The creator clarified that recycle is intended as one card, usable by only one person per game, and requested existing recycle/pool handling be left as is for now. Current lists remain asymmetric in discard mode and separate snapshots in draft. No deck/copy-count or pile changes are included in the preparation fix.

## Automatic combat

A positive-CD action triggers when `round % cd === 0`. CD 1 triggers every round, CD 2 on even rounds, CD 3 on multiples of three, CD 4 on multiples of four. Zero/negative CDs do not trigger in combat.

Both sides calculate effects, then simultaneously take damage after shield prevention. Lethal damage does not cancel the other's attacks that round. Combat has no player choices, draws, or hand changes.

Shields stack on their active round, prevent up to their value, and expire without carrying over. Current `shield2` has CD 1 and blocks two every round. The creator confirmed this current shield behavior is correct; the historical every-other-round example is superseded. Exact effect ordering is in `COMBAT.md`.

## Outcome

- If only one side has taken 21 or more damage, the other wins.
- If both reach 21+ in the same round, higher cumulative damage actually dealt after shields wins.
- Equal damage on simultaneous lethal ties.
- Without lethal by the end of round 50, the result is a tie regardless of damage lead.

## Scope

The JSON preserves unsupported `extra_turn` and `no_stats_to_2`; neither is playable. Extra and monster sets are not imported. Further special rules must be agreed explicitly rather than inferred from artwork tokens.
