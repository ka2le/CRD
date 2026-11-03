# Abilities+NewCards

Added locally on 2026-11-03. Select **Menu → Battle → Abilities+NewCards**, then choose Draft or Discard. This separate ruleset (`abilities-new-cards`) inherits all current Abilities main scoring, faction eligibility, bonuses, and shield immunity. Existing modes and their decks retain their rules.

The Regular deck has **73 cards**, including one of each addition. Wild has **109**, with three of each addition. Artwork is supplied by the creator and archived through the existing image pipeline.

| Card | Rule |
| --- | --- |
| From Nothing (`no_stats_to_2`) | With no stat cards in your final hand, your starting stats are 2 Critter, 2 Robot, and 2 Dragon. Multiple copies do not stack. Overwhelming can add its normal extra Dragon stat. Any stat card disables the replacement, even if it belongs to another faction. |
| Draw 2 / Discard 2 (`draw_2_discard_2`) | During preparation, draw up to 2 available cards, then discard 2 other cards. Keep the source. Choose after seeing the draws; finish discarding before any other preparation action or Battle. If fewer than 2 other cards exist, discard all available other cards. |
| Shield Ultimate (`shield_ulti`) | 3 shield points. Blocks Critters and Robots; Dragons remain immune. Supplies 3 power to each Shield Is Damage. |
| Discard for Damage (`discard_for_damage`) | Once during preparation, discard any number of other cards, one at a time, then finish. Each sacrificed card adds 1 stored neutral power to this card. Zero sacrifices are allowed. Only cards discarded by this activation count. |

Both discard effects place cards in that player's existing Recycle pool, and can repair Perfect Balance or enable From Nothing. Discard for Damage retains its earned power when cards are recycled. Its activation is spent when started; after finishing, further sacrifices require another instance. Copy creates a fresh, uncharged instance that needs its own sacrifices. Discarding and recycling the same original special does not reset its activation. Full redraw discards any charged card with the hand; it contributes no power while out of hand.

All four cards use the normal draft/discard flow. Nothing activates on acquisition. The statless replacement and shield are passive; the other two activate during preparation. Pending discard choices survive saves and are supported for both room seats.

RolfBot, IngaBot and SvenBot are available. Switching from a fixed-catalog bot to this mode selects IngaBot; Dan, Felix and David are excluded here because their existing models/planners target the original catalog. No models were fitted or deployed. Headless states use `tabletop-single-score-v1-abilities-new-cards`.

Validation: `npm run newcards:test`, existing tabletop/headless/opponent/room regressions, lint, assets check and production build. These verify mechanics and integration, not competitive balance. A development-only fixture is available at `?scenario=new-cards&rules=abilities-new-cards` (add `&mode=discard` for Discard preparation).

Card faces use icons and numeric/formula symbols only, following the creator’s original card designs. Explanations belong in rules, collection, and press/inspect views; do not add prose labels or text banners to in-game cards. The original statless symbol is `0 → ★★`; draw/discard uses paired add-card and subtract-card icons.
