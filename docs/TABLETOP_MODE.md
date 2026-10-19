# Tabletop battle mode

Implemented 2026-10-19. Menu → **Tabletop battle** is a persisted toggle, off by default, independent of Draft / Discard and Normal / Wild Deck. Changing it deals a fresh game. Digital round combat remains available when off.

## Scoring

1. Add every attack's power. An ordinary class attack contributes **2 × matching stats**; multiple attacks each use the full stat total.
2. The class contributing most power is the main damage type. Only positive class contributions count. When tied, the human must tap an eligible stat or attack card before battle. A multi-class card opens a choice between its eligible types. All power, including neutral power, receives the chosen type's shield rule and bonus.
3. Each opposing **shield card** subtracts 2 for Critter, 1 for Robot, 0 for Dragon. Power floors at zero.
4. Apply bonuses to **power remaining after shields**: Critter +1 if positive; Robot +2 at 7 and another +1 at 11; Dragon +4 at 11 and another +2 at 14. Bonuses are cumulative. The creator confirmed 11 rather than the original message's 10 to match the updated score card.
5. Compare scores. Higher wins; equality ties. No health threshold, cooldowns, rounds, cap, or overkill tiebreak.

The result and the table show both formulas: **base − shield reduction + class bonus = broken hearts**, hiding zero shield/bonus terms. Bonus and final score use broken-heart icons. With no modifiers, show only final damage. Shield reduction shown is capped at base power; the accessible description/title records the actual shield count and nominal penalty. A neutral-only scoring hand uses Robot. A zero-power hand has no main type and no bonus.

## Integer specials

The creator approved these conversions on 2026-10-19. Balance remains experimental.

| Card | Tabletop effect |
| --- | --- |
| Murder Rabbit / Robot Ultimate / Dragon Ultimate | 4 power per matching stat |
| Bite | 2 flat power |
| Shield | One shield card, including for shield-based power |
| Punch (`double_dmg`) | Each Punch doubles Robot attack power; each other attack already producing positive power gains +1. With k Punches, Robot attacks multiply by 2^k; other scoring attacks gain k. Zero attacks stay zero. |
| Devour | 4 power per Dragon stat (doubled ordinary attack, like the other ultimates); permits a Dragon main-type override before reveal |
| Shield is damage | 1 power per own shield; shields still defend |
| One of each | Critter stats × Robot stats × Dragon stats, neutral power |
| Any of each | Sum of all class stats, neutral power |
| Draw / redraw / copy / recycle | Existing preparation effects; no direct power |

Punch-enhanced class attacks contribute their enhanced power to the main-type comparison. Neutral attacks remain neutral. Punch does not multiply shield reductions or class bonuses. Copies stack just like additional cards.

## Preparation and opponent

Preparation remains optional and private. When no human specials remain (or Battle is pressed to skip the remainder), tied eligible cards highlight. Battle is disabled until a valid type is chosen. A hand change invalidates a previous choice. Battle then completes AI preparation privately, reveals the hands and scores them immediately.

The AI chooses its main type from its own completed hand before reveal, without using enemy shields: highest unshielded score, then smallest shield vulnerability, then class order. Rules AI uses tabletop power/engine potential for picks, discards, copy and recycle. Browser Search AI completes sampled hands with the same heuristics and compares tabletop results. Offline digital training/Gymnasium stays on the existing digital rules.

## Code and verification

### Instant development scenarios

Use these instead of playing through a match for UI checks. Available only with the Vite development server; helpers and fixtures are omitted from production builds.

```js
crdDev.list()                         // plain, bonuses, shields, tie, preparation
crdDev.prepare('tie')                 // jump to main-type selection
crdDev.result('bonuses')              // jump to the result overlay
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

Verified locally: production build and lint pass; tabletop 10 tests, digital/headless 15 tests, opponent 5 tests and original regression smoke pass. Browser completed both Draft and Discard, activated a tabletop draw, committed a tied Robot/Dragon type, resolved private AI preparation and displayed the simplified formulas with broken-heart bonuses.
