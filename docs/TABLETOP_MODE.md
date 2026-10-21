# Tabletop battle mode

Implemented 2026-10-19; since 2026-10-20 Menu → **Battle** picks **Battle** (digital rounds), **Threshold** or **Abilities**. The original **Tabletop battle** toggle was a persisted setting, off by default, independent of Draft / Discard and Normal / Wild Deck. Changing it deals a fresh game. Digital round combat remains available when off.

The tabletop deck includes two exclusive cards, **Shortcut** and **Chameleon**, defined in `data/tabletop-cards.json`. Each has one normal copy / three Wild copies, bringing tabletop decks to 72 / 108 cards (29 definitions). Digital decks remain 70 / 102 (27 definitions). Their supplied originals are archived in `assets/originals/tabletop/`; optimized WebP art uses the normal manifest pipeline and base-aware renderer. Both are available in the tabletop collection, draft, discard, draw, copy and recycle pools.

## Rule sets (2026-10-20)

`settings.tabletop` is `false`, `'threshold'` or `'abilities'` (legacy `true` → `'threshold'`). Tabletop card derivatives carry their rule set in `card.tabletop`, so scoring, AI and search infer the rules from any hand (`getHandTabletopRules` in `src/game/tabletop.js`). Steps 1–3 below (power, main type, shields) are shared.

- **Threshold:** step 4 is replaced by one bonus for the main faction after shields — Critter 2+ → +1, Robot 8+ → +3, Dragon 14+ → +6 (`TABLETOP_THRESHOLDS`). Shortcut grants the bonus below its threshold (positive power required); 2× cards double it.
- **Abilities:** no faction bonus. Deck drops Shortcut and 2× (Chameleon stays). Every hand checks all three abilities:
  - *Adapt* — one pure Critter stat card (Critter, Two Critters) may become an ordinary Critter attack. Applied automatically to the conversion that scores most before reveal; none on ties.
  - *Overwhelming* — Dragon base power (Dragon contributions) 14+ adds one Dragon stat, then power is recounted. Before shields.
  - *Perfect Balance* — Robot stats equal Robot attack cards (at least one each): +3 after shields.
  Score = power − shields + Perfect Balance. The result formula marks Adapt and Overwhelming with small icons.
  - Clarifications (2026-10-21): Perfect Balance is a Robot ability — only a hand whose chosen main faction is Robots earns the +3 (Chameleon choosing Robots counts). Robot Ultimate counts as **two** Robot attacks (it hits like two ordinary attacks; `ROBOT_ULTI_ATTACK_COUNT`, open design question — set it to 1 to make the Ultimate balance with a single stat). Critter × Robot × Dragon counts as one Robot attack. Adapt may convert any stat card with a Critter stat: its Critter stat(s) become the attack and any other faction stats on the card stay (Joker keeps Robot + Dragon; Two Critters becomes one attack).
- **Both rule sets (2026-10-21):** Critter × Robot × Dragon (`one_off_each`) is Robot damage — its power counts as a Robot contribution for the main type, and clicking it can commit Robot on ties.


1. Add every attack's power. An ordinary class attack contributes **2 × matching stats**; multiple attacks each use the full stat total.
2. The class contributing most power is the main damage type. Only positive class contributions count. When tied, the human must tap an eligible stat or attack card before battle. A multi-class card opens a choice between its eligible types. Chameleon permits any of the three factions: click it and choose a faction icon. All power, including neutral power, receives the chosen type's shield rule and bonus.
3. Each opposing **shield card** subtracts 2 for Critter, 1 for Robot, 0 for Dragon. Power floors at zero.
4. Apply bonuses to **power remaining after shields**: Critter +1 if positive; Robot +2 at 7 and another +1 at 11; Dragon +4 at 11 and another +2 at 14. Bonuses are cumulative. The creator confirmed 11 rather than the original message's 10 to match the updated score card.
5. Compare scores. Higher wins; equality ties. No health threshold, cooldowns, rounds, cap, or overkill tiebreak.

The result and the table show both formulas: **base − shield reduction + class bonus = broken hearts**, hiding zero shield/bonus terms. Bonus and final score use broken-heart icons. With no modifiers, show only final damage. Shield reduction shown is capped at base power; the accessible description/title records the actual shield count and nominal penalty. A neutral-only scoring hand uses Robot unless a type-changing card permits another choice. A zero-power hand gains no bonus (Chameleon still permits a faction choice).

## Integer specials

The creator approved these conversions on 2026-10-19. Balance remains experimental.

| Card | Tabletop effect |
| --- | --- |
| Murder Rabbit / Robot Ultimate / Dragon Ultimate | 4 power per matching stat |
| Bite | 2 flat power |
| Shield | One shield card, including for shield-based power |
| 2× / Punch (`double_dmg`) | Doubles the chosen faction's earned bonus after shields. Neutral effect, no base power or faction contribution. With k copies, multiply the bonus by 2^k. |
| Devour | 4 power per Dragon stat (doubled ordinary attack, like the other ultimates); permits a Dragon main-type override before reveal |
| Shield is damage | 1 power per own shield; shields still defend |
| One of each | Critter stats × Robot stats × Dragon stats, neutral power |
| Any of each | Sum of all class stats, neutral power |
| Draw / redraw / copy / recycle | Existing preparation effects; no direct power |
| Shortcut | With positive power remaining after shields, count the chosen faction bonus two tiers higher, capped at its highest bonus; no added base power. Each copy advances two tiers (`SHORTCUT_TIER_STEPS`). Card shows two up arrows (rotated `arrow` icon), no star. |
| Chameleon | Click before battle to choose any main faction (Critters / Robots / Dragons), regardless of contributions. That faction controls the whole hand's bonus and shield vulnerability. No added stats or power. |

Shortcut uses bonus tiers Critter 0→1, Robot 0→2→3, Dragon 0→4→6. First earn the normal bonus from post-shield power, then advance two tiers per Shortcut, then apply 2× cards. Examples (2026-10-20, two-tier rule): 6 Robot power + Shortcut earns +3; 8 Robot power + Shortcut earns +3; 2 Dragon power + Shortcut earns +6. Critters with positive power already have their highest tier. Fully blocked or zero-power hands gain no bonus. These are the implementation defaults for the requested "next bonus tier" effect.

Chameleon can be opened during preparation, including before other preparation effects are used. Its choice can be changed until Battle. Copy target selection takes precedence over opening Chameleon. Changing the hand invalidates the previous choice; removing Chameleon removes its unrestricted faction eligibility. Extra copies do not add stats or extra faction effects. AI chooses from all three factions using its own completed hand before reveal.

The 2× card affects only the earned faction bonus: base power, contributions, main-type eligibility, shield reduction and threshold checks stay unchanged. Zero bonus stays zero. It works for all factions (for example +1 becomes +2, +3 becomes +6, +6 becomes +12 with one copy). Copies stack ×2/×4/×8. Its printed effect is **2 × star**, using the local `card icons/star.png` asset's existing optimized derivative, with no BONUS text. Neutral attacks remain neutral. The scorer is shared by AI evaluation and final results; the formula shows the multiplied bonus, with its calculation in the bonus tooltip.

## Preparation and opponent

Preparation remains optional and private. When no human specials remain (or Battle is pressed to skip the remainder), tied eligible cards highlight. Battle is disabled until a valid type is chosen. A hand change invalidates a previous choice. Battle then completes AI preparation privately, reveals the hands and scores them immediately.

The AI chooses its main type from its own completed hand before reveal, without using enemy shields: highest unshielded score, then smallest shield vulnerability, then class order. Rules AI uses tabletop power/engine potential for picks, discards, copy and recycle. Browser Search AI completes sampled hands with the same heuristics and compares tabletop results. Offline digital training/Gymnasium stays on the existing digital rules.

## Code and verification

### Instant development scenarios

Use these instead of playing through a match for UI checks. Available only with the Vite development server; helpers and fixtures are omitted from production builds.

```js
crdDev.list()                         // plain, bonuses, double-bonus, shortcut, chameleon, shields, tie, preparation
crdDev.prepare('tie')                 // jump to main-type selection
crdDev.result('bonuses')              // jump to the result overlay
crdDev.result('double-bonus')         // Robot 8 − 1 shield + (2 × 2 bonus) = 11
crdDev.prepare('chameleon')           // click Chameleon to open the three-faction picker
crdDev.result('shortcut')             // preview next-tier bonus, shields and 2× interaction
crdDev.result('shields', { mode: 'discard' })
crdDev.result('tie', { playerType: 'robot' })
crdDev.prepare('preparation', {
  playerCards: ['draw_2_extra', 'robot2', 'robot_attack', 'shield2', 'copy_card_in_hand'],
})
```

Browser automation can navigate directly to `/?scenario=plain&at=result` or `/?scenario=tie&mode=discard`. Omit `at=result` to open preparation. Scenarios use real, deterministic Wild Deck card instances and the session reducer; immediate result previews freeze unused preparation effects so the specified hands stay exact. Preparation previews retain normal interaction. Dealing/shuffle entrances are skipped for scenario loads. Source: `src/game/devScenarios.js`.

### Implementation

- `src/game/tabletop.js`: immutable card derivatives, contribution/profile calculation, eligibility, bonuses, shield scoring and winner.
- `src/game/tabletopAi.js`: tabletop heuristic and discard subset ranking.
- `src/hooks/useGameSession.js`: persisted setting, preparation/type selection and validation.
- `src/hooks/useBattlePlayback.js`: immediate tabletop result; timed playback stays digital.
- `src/components/battle/TabletopScore.jsx`: shared formulas in table and result overlay.
- Cards carry `tabletop: true` only in tabletop decks; draws, copied cards, piles, flying cards and inspect all use the same derivatives. Imported digital definitions remain intact.
- `npm run tabletop:test`: threshold, shield, tie, special, deck/mode, search and browser-reducer coverage.

The old chart/finish-time studies in `TABLETOP_COMBAT_DESIGN.md` are historical alternatives. Their balance percentages do not validate this mode. Current values require playtesting.

Verified locally: production build and lint pass; tabletop 13 tests and digital/headless 17 tests pass. Asset smoke checks 481 rendered references at each of `/` and `/CRD/`, including both new artworks. Browser preview verified Chameleon's three-faction picker and a Critter-powered hand using Robot shield cost and Shortcut bonus (4 − 1 + 2 = 5). Tests cover tabletop-only deck inclusion, tier caps, zero power, 2× interactions, all faction choices, copied Chameleons and selection invalidation. Earlier full-game browser checks and digital/opponent regressions remain recorded in session notes.
