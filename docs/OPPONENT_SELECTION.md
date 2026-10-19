# Opponent selection (browser)

Added 2026-10-19. The menu has an **Opponent** dropdown (saved in `crd-dev-settings-v1` as `opponentAi`). Changing it starts a new game, like the other settings.

| Option | id | Draft picks | Discard passes | Preparation |
| --- | --- | --- | --- | --- |
| Rules AI (Easy) | `rules` | `cardEvaluator` heuristic (unchanged) | `chooseDiscardIds` heuristic (unchanged) | `completeOpponentPreBattle` |
| Search AI (Medium) | `search` | root rollout search | root rollout search | `completeOpponentPreBattle` (Rules AI) |

The neural model from the training runs is **not** wired in. It can become a third option later by adding an entry to `OPPONENT_AI_OPTIONS` and a matching branch in the request client.

## Search AI

`src/game/searchAi.js` is a browser version of the offline rollout teacher (`rolloutSearch.js`, `docs/AI_SEARCH.md`). For each legal choice it:

1. samples a world from what the AI seat can see. In draft, only the deck order is hidden. In discard, the player's hand and the deck are re-dealt together from all unseen cards. Hidden cards are sorted by UID before the seeded shuffle, so the result cannot depend on the real secret order;
2. applies the candidate and finishes the game with the Rules AI for both seats, including preparation, using the shared headless stepping (`stepHeadlessGame`) and exact combat;
3. scores +1/0/−1 and averages over samples. Every candidate is played in the same sampled world (common random numbers). The highest mean wins, and ties go to the Rules AI's own choice.

Budget: at least 16 sampled worlds, at most 128, and about 600 ms. It runs in a module Web Worker (`searchAi.worker.js`, client in `opponentAi.js`), so animations do not stall. If the worker cannot load (no support, or offline before the chunk was cached), a short main-thread search runs instead (8–24 samples, about 200 ms). If that fails too, the Rules AI choice is used.

None of the shared game modules used by the training pipeline were changed (`headlessGame.js`, `rolloutSearch.js`, `draftMode.js`, `fiveHandDiscard.js`, `cardEvaluator.js`, `preBattle.js`, …). The Search AI only imports them.

## Browser flow

- **Draft:** while Search AI is selected, the reducer clears the instant heuristic `pendingOpponentPickUid` whenever the opponent starts thinking. An effect asks the worker, then `SET_OPPONENT_DRAFT_PICK` stores the pick, keyed by `dealId:pack:picks` so stale results are ignored. `useDraftFlowEffects` waits (`waitingForOpponentPick`) and measures its usual 800 ms AI delay from when the decision started. Once the pick is known, the eyed card is still shown for at least 450 ms.
- **Discard:** while Search AI is selected, `SUBMIT_DISCARD` applies only the player's pass (`deferOpponent`). The phase becomes `opponent-discard-N`, the action button shows a disabled "Waiting" and the thinking dots appear. The worker result is applied with `APPLY_OPPONENT_DISCARD`, after a minimum of 650 ms of thinking so the player's discard animation finishes first. The opponent's cards then fly to the pile with the existing discard animation. The order of play is unchanged: the opponent still sees the player's public discard first, exactly as before.

## Strength (cloud benchmark, Search AI in the opponent seat vs Rules AI, browser budget)

| Mode | Games | Search AI score | Std. err. | Mean / p95 decision time (desktop CPU) |
| --- | --- | --- | --- | --- |
| Draft | 400 | 85.9% (341 W / 5 D / 54 L) | 1.7 pp | 139 ms / 251 ms |
| Discard | 400 | 65.6% (257 W / 11 D / 132 L) | 2.4 pp | 386 ms / 572 ms |

Rules AI against itself scores 49.3% (draft) and 51.5% (discard) for the opponent seat on the same seeds. Reproduce with `npm run opponent:benchmark -- <draft|five-hand-discard> <games> <maxSamples> <timeBudgetMs> [firstSeed]`. Tests: `npm run opponent:test`. These test legal choices, independence from the hidden deck order and the rival's hidden hand, and that search beats the rules on 40 fixed deals per mode.

Limitations: uniform beliefs (no inference from the human's past choices); the rollouts model the human as the Rules AI; the search is one level deep over the root choice only; preparation is not searched.
