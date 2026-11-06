# Abilities+NewCards

Added locally on 2026-11-03. Select **Menu → Battle → Abilities+NewCards**, then choose Draft or Discard. This separate ruleset (`abilities-new-cards`) inherits all current Abilities main scoring, faction eligibility, bonuses, and shield immunity. Existing modes and their decks retain their rules.

Adopted 2026-11-06: **From Nothing and Shield Ultimate are hidden from the deck and collection**, with their definitions and artwork retained for possible restoration. Critter Guard supplies one Critter stat and one shield. The NC pool has 9 Swarms, 8 ordinary Robot attacks, 5 basic Dragon stats and 7 ordinary Dragon attacks. Both Dragon double-damage attacks and Dragon shield immunity remain.

The Regular deck has **73 cards**. Wild has **109**, including three of each enabled addition. Specialist and Critter Guard appear under Specials. Shield Is Damage uses shield × damage in every mode.

| Card | Rule |
| --- | --- |
| Specialist (`single_faction_2`) | With stats in exactly one faction, adds 2 power per stat point of that faction. Multiple stat cards and points are allowed; zero stats or two or three stat factions give zero power. Its damage belongs to the powered faction, and it counts as two attacks of that faction for Perfect Balance. Overwhelming adds its extra Dragon stat normally. The card face shows Critter \| Robot \| Dragon × two damage icons; the bars mean exclusive alternatives. |
| Draw 2 / Discard 2 (`draw_2_discard_2`) | During preparation, draw up to 2 available cards, then discard 2 cards, which may include this card. Select cards directly in your regular hand after seeing the draws, then Accept at the bottom right. This ability cannot be cancelled once activated because the drawn cards have been revealed. Finish discarding before any other preparation action or Battle. If fewer than 2 cards exist, discard all available cards. |
| Critter Guard (`critter_shield`) | One Critter stat and one shield point, printed on separate rows. Listed under Specials. Uses the mouse artwork; the former knight artwork is on an ordinary Shield card. |
| Discard for Damage (`discard_for_damage`) | Once during preparation, select any number of cards directly in your regular hand, including this card, then Accept at the bottom right. Cancel clears the selection and leaves the ability unused. Each other sacrificed card adds 1 stored neutral power to this card. Discarding this card ends its activation; it deals no damage while out of hand. Zero sacrifices are allowed. Only cards discarded by this activation count. |

Both discard effects place cards in that player's existing Recycle pool and can repair Perfect Balance. Discard for Damage retains its earned power when cards are recycled. Accept spends its activation; further sacrifices require another instance. Copy creates a fresh, uncharged instance that needs its own sacrifices. Discarding and recycling the same original special does not reset its activation. Full redraw discards any charged card with the hand; it contributes no power while out of hand.

All four enabled additions use the normal draft/discard flow. Nothing activates on acquisition. Specialist scores during battle; Critter Guard is passive; the other two activate during preparation. Pending discard choices survive saves and are supported for both room seats.

RolfBot, IngaBot, SvenBot and Felix are available in NC Draft. Selecting Felix uses the qualified FelixNC draft model and bounded native preparation (12,000 nodes, depth 8). NC Discard retains its mode-specific alternatives. Dan and David are excluded here. Headless states use `tabletop-single-score-v6-abilities-new-cards`.

Validation: `npm run newcards:test`, existing tabletop/headless/opponent/room regressions, lint, assets check and production build. These verify mechanics and integration, not competitive balance. A development-only fixture is available at `?scenario=new-cards&rules=abilities-new-cards` (add `&mode=discard` for Discard preparation).

Card faces use icons and numeric/formula symbols only, following the creator’s original card designs. Explanations belong in rules, collection, and press/inspect views; do not add prose labels or text banners to in-game cards. The original statless symbol is `0 → ★★`; draw/discard uses paired add-card and subtract-card icons.

The hidden From Nothing definition retains its no-stat-card replacement (2 of each faction), and Shield Ultimate retains its 3 shields. These effects remain supported for archived fixtures and possible future restoration. Neither card appears in the current playable pool.
