# Hand-building modes

Testing also offers **Secret Card**, a private opening-choice variant of Draft, and **20Cards**, three locked five-card lanes chosen from twenty private cards. See [TESTING_HAND_MODES.md](TESTING_HAND_MODES.md) for their rules, privacy and match flow.

Draft, 6draft and Discard are implemented. See the mode modules and `useGameSession.js`.

## Draft

Reveal five cards, let each side pick one, discard the remaining three, then reveal a fresh five. Alternate first picker per pack. Five packs produce five-card hands. The intended first-pack starter also alternates between games.

The final pick also puts all three remaining cards into `draftDiscard` before preparation starts, for 15 discarded cards across five packs. Both players can Recycle those final-pack leftovers. Monsters uses six packs of six, leaving 24 discards.

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

- Initialization and the first New Game both start human-first; later resets alternate. Settings/mode changes do not consistently consume the starter toggle.
- Preparation gives each side a separate discard snapshot, so recycle removal is not shared.

These are recorded issues, not intended rule amendments.

## 6draft

Available beside Draft and Discard without Testing. Use the selected card pool, pack size and battle rules. Six packs alternate their first picker exactly as ordinary Draft, for six public picks each. Monsters keeps its six-card pack; every 6draft setup ends with five cards before preparation.

After the twelfth pick, hide the hands. Each player must privately set aside exactly one card; no draws or preparation are allowed until both lock. The card stays in its owner's hidden set-aside zone, outside every discard pile and Recycle target list. The six public picks remain known, so any five may be retained. Prepare privately as usual; specials may then increase or change the five-card hand. Battle resolution reveals the hands and the separate Set aside pile. Reloads preserve the locks and privacy.

RolfBot and SvenBot support picks, the mandatory discard and preparation. Sven samples possible five-card opposing hands from the six known picks, without using the real opposing discard or private preparation. Felix is also available with the Regular Abilities + New Cards deck and stays selected when switching between supported Draft and 6draft setups. Same-screen play uses the existing reveal handoffs. Online seats can lock either discard first.

`draft-hidden-discard` is the phase between the final public pick and `battle-ready`. `applyHiddenDraftDiscard(game, side, uid)` removes exactly one card per seat and opens prep only after both commit. `playerDraftedHand` / `opponentDraftedHand` retain public pick knowledge; `playerHiddenDiscard` / `opponentHiddenDiscard` retain the private excluded cards.

## 5 Hand Discard

`createFiveHandDiscardGame` deals five to the human, then five to the AI from the shared deck. Two `applyDiscardPhase` submissions lead through `player-discard-1`, `player-discard-2`, and `battle-ready`.

The human selects any subset, including empty, to replace. Refill preserves slots. Each submission then runs an AI pass using the remaining deck. Its heuristic normally targets two discards but can preserve additional highly valued attacks. Zero human discards still advances both passes.

`playerDiscards` accumulates both sides' discards; `opponentDiscards` only the AI's. This supports human recycling of opponent discards but is not a symmetric shared pile end to end.

## Shared boundary

Draft, 6draft and Discard target five cards before preparation; ordinary Monsters Draft/Discard uses six, while 6draft always uses five. Supported specials can then change hands and deck before shared combat. Normal/Wild Deck is a pool-copy setting, not a third mode or a deckbuilding interface. See `CURRENT_STATE.md` for findings and `RULES.md` for shared rules.
