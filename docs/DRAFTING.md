# Hand-building modes

Both modes are implemented. Reviewed 2026-10-18 against the mode modules and `useGameSession.js`.

## Draft

Reveal five cards, let each side pick one, discard the remaining three, then reveal a fresh five. Alternate first picker per pack. Five packs produce five-card hands. The intended first-pack starter also alternates between games.

`src/game/draftMode.js` exposes these transitions:

| Phase | Transition |
| --- | --- |
| `draft-player-pick` | `applyDraftPick` moves a valid chosen card into the human hand |
| `draft-opponent-thinking` | `resolveOpponentDraftPick` commits the pending AI selection |
| `draft-pack-clearing` | `commitDraftDiscard` moves leftovers into `draftDiscard` |
| `draft-pack-dealing` | `revealNextDraftPack` draws five and switches pack starter |
| `battle-ready` | Hand building complete; session preparation available |

`draftAi.js` uses the shared evaluator for own-hand synergy. Strategy overrides, seeded/injected decks and optional move records support headless use.

`useDraftFlowEffects.js` owns AI pauses and discard/deal sequencing. `draftMotion.js` and the motion context handle flights. Cards can enter hand state before their flight ends; explicit visibility suppression prevents duplicate/early rendering.

Source-review exceptions:

- Final picks clear the row immediately, bypassing final discard. Only 12 of the intended 15 leftovers reach `draftDiscard`.
- Initialization and the first New Game both start human-first; later resets alternate. Settings/mode changes do not consistently consume the starter toggle.
- Preparation gives each side a separate discard snapshot, so recycle removal is not shared.

These are recorded issues, not intended rule amendments.

## 5 Hand Discard

`createFiveHandDiscardGame` deals five to the human, then five to the AI from the shared deck. Two `applyDiscardPhase` submissions lead through `player-discard-1`, `player-discard-2`, and `battle-ready`.

The human selects any subset, including empty, to replace. Refill preserves slots. Each submission then runs an AI pass using the remaining deck. Its heuristic normally targets two discards but can preserve additional highly valued attacks. Zero human discards still advances both passes.

`playerDiscards` accumulates both sides' discards; `opponentDiscards` only the AI's. This supports human recycling of opponent discards but is not a symmetric shared pile end to end.

## Shared boundary

Both modes target five cards before preparation. Supported specials can then change hands and deck before shared combat. Normal/Wild Deck is a pool-copy setting, not a third mode or a deckbuilding interface. See `CURRENT_STATE.md` for findings and `RULES.md` for shared rules.
