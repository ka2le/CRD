# Ruleset names and testing policy

Effective 2026-10-22, **Abilities** in the UI means **`abilities-main`** in code and project notes. This is the mode previously called Abilities v2. Its rules remain Critter tie wins, Robot Perfect Balance +3, Dragon contribution 7+ adding one stat, and shield penalties C/R/D 1/2/0.

The first Abilities version is **Abilities Prototype** (`abilities-prototype`). It retains Adapt, its original Perfect Balance and Dragon rules, artwork and both reference-card components. It is hidden from the mode selector and score-card sheet. Do not use it for balance tests or comparisons unless the creator explicitly requests the prototype or old Abilities version. Unit regressions explicitly named prototype may verify that retained implementation.

Unqualified requests for “abilities”, “tabletop”, or tabletop testing use `abilities-main`. Threshold is a separate, explicitly named mode. Digital Battle is unaffected. Default balance and bot-ladder commands select main; the prototype requires its explicit name.

Runtime aliases `abilities`, `abilitiesv2`, `tabletop`, and `true` resolve to `abilities-main`. Explicit `abilities-prototype`, `abilities-v1`, and `old-abilities` resolve to the prototype for deliberate historical use. Normal UI settings route a stored prototype selection to main rather than reopening a hidden mode.

Historical dataset filenames, variant IDs, source snapshots and raw evidence are preserved. Before this rename, the raw ID `abilities` denoted the prototype and `abilitiesv2` denoted main. Those archived IDs are provenance, not current defaults. The replay verifier translates old metadata without editing evidence. Historical tuning variants are not the adopted main rules unless explicitly stated.

Canonical exports are `MAIN_ABILITY_RULES`, `MAIN_ABILITY_SHIELD_COST`, and `PROTOTYPE_ABILITY_RULES`. Prototype score cards are `PrototypeAbilityLedgerCard` / `PrototypeAbilityBandsCard`; active cards are `MainAbilityLedgerCard` / `MainAbilityBandsCard`.
