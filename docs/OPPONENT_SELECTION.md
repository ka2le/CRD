# Opponent selection (browser)

Added 2026-10-19. The menu has an **Opponent** dropdown (saved in `crd-dev-settings-v1` as `opponentAi`). Changing it starts a new game, like the other settings.

| Option | id | Draft picks | Discard passes | Preparation |
| --- | --- | --- | --- | --- |
| RolfBot (Easy) | `rules` | `cardEvaluator` heuristic (unchanged) | `chooseDiscardIds` heuristic (unchanged) | `completeOpponentPreBattle` |
| IngaBot (Medium) | `shallow` | shallow search: 4 samples, Rules AI rollouts | 8 samples, Rules AI rollouts, keeps the Rules choice unless beaten by ≥0.25 mean | `completeOpponentPreBattle` |
| SvenBot (Hard) | `search` | root rollout search | root rollout search | searched step by step (order, targets, skip/finish) |

2026-10-21: the bots got names (RolfBot = rules, SvenBot = search) and IngaBot was added in between. Ids stay `rules`/`search`, so saved settings keep working. Budgets live in `BOT_SEARCH_PROFILES` (`src/game/opponentAi.js`); `searchAi.js` gained `rollout: 'rules'` (plain Rules AI rollouts instead of the preparation lookahead) and `margin` options. Calibrate with `node scripts/bot-ladder.mjs <botA> <botB> [mode] [games] [rules] [seed]` (seats swap every game; tabletop deals are converted to the chosen rules).

Abilities-rule ladder (2026-10-21, cloud, scores for the first bot; draws = ½):

| Match | Draft | Discard |
| --- | --- | --- |
| IngaBot vs RolfBot | 69.2% (300 games) | ~53% (300 games, 8 samples + margin) |
| SvenBot vs RolfBot | ~74% (60–100 games) | ~52% (60–100 games) |
| SvenBot vs IngaBot | 65% (100 games) | 56–59% (100 games) |

Discard is weakly separating for every bot under Abilities scoring; draft gives the clear Rolf < Inga < Sven order. A 3-sample Inga fell *below* RolfBot in discard (44.5%), which is why discard keeps a larger sample and a margin.

The neural model from the training runs is **not** wired in. It can become a third option later by adding an entry to `OPPONENT_AI_OPTIONS` and a matching branch in the request client.

## Search AI

`src/game/searchAi.js` is a browser version of the offline rollout teacher (`rolloutSearch.js`, `docs/AI_SEARCH.md`). For each legal choice it:

1. samples a world from what the AI seat can see. In draft, only the deck order is hidden. In discard, the player's hand and the deck are re-dealt together from all unseen cards. Hidden cards are sorted by UID before the seeded shuffle, so the result cannot depend on the real secret order;
2. applies the candidate and finishes the game for both seats with the shared headless stepping (`stepHeadlessGame`) and exact combat. Draft picks and discard passes inside a rollout use the Rules AI. Each preparation step inside a rollout tries every legal option in that sampled world and keeps the best ("prep-lookahead", the strongest non-neural setup offline, see `AI_PREP_V5.md`);
3. scores +1/0/−1 and averages over samples. Every candidate is played in the same sampled world (common random numbers). The highest mean wins, and ties go to the Rules AI's own choice.

**Preparation (since 2026-10-19 evening).** When the player presses Battle, the opponent's whole preparation is searched one step at a time: which unused special to activate next, its copy/recycle target, skip it, or finish. After every step the real result (including real draws) is applied and the next step is searched again, so it can, for example, recycle the card a Draw 2 just brought in and then copy it. Each step samples worlds from `preparationView`: its own hand, pile and activations, the rival's pre-preparation hand only where it is public (draft), and every other card as an unseen pool sorted by UID. The rival's private preparation is never read; the rival re-prepares inside each rollout. Budget per step: 16–96 worlds, about 250 ms.

Budget: at least 16 sampled worlds, at most 128, and about 600 ms. It runs in a module Web Worker (`searchAi.worker.js`, client in `opponentAi.js`), so animations do not stall. If the worker cannot load (no support, or offline before the chunk was cached), a short main-thread search runs instead (8–24 samples, about 200 ms). If that fails too, the Rules AI choice is used.

None of the shared game modules used by the training pipeline were changed (`headlessGame.js`, `rolloutSearch.js`, `draftMode.js`, `fiveHandDiscard.js`, `cardEvaluator.js`, `preBattle.js`, …). The Search AI only imports them.

## Browser flow

- **Draft:** while Search AI is selected, the reducer clears the instant heuristic `pendingOpponentPickUid` whenever the opponent starts thinking. An effect asks the worker, then `SET_OPPONENT_DRAFT_PICK` stores the pick, keyed by `dealId:pack:picks` so stale results are ignored. `useDraftFlowEffects` waits (`waitingForOpponentPick`) and measures its usual 800 ms AI delay from when the decision started. Once the pick is known, the eyed card is still shown for at least 450 ms.
- **Preparation:** with Search AI selected, `START_BATTLE` marks the player done and stores `preBattle.opponentSearchKey` (`dealId:battleInstance`) instead of starting. The Battle button shows a disabled "Waiting" and the thinking dots appear. An effect asks the worker (`requestOpponentPreparation`, falling back to a short main-thread search, then to the Rules AI) and dispatches `START_BATTLE` with the opponent's preparation, after at least 450 ms. Results with a stale key are ignored. Rules AI games and finished dev scenarios start immediately, as before.
- **Discard:** while Search AI is selected, `SUBMIT_DISCARD` applies only the player's pass (`deferOpponent`). The phase becomes `opponent-discard-N`, the action button shows a disabled "Waiting" and the thinking dots appear. The worker result is applied with `APPLY_OPPONENT_DISCARD`, after a minimum of 650 ms of thinking so the player's discard animation finishes first. The opponent's cards then fly to the pile with the existing discard animation. The order of play is unchanged: the opponent still sees the player's public discard first, exactly as before.

## Strength (current version, 2026-10-19 evening)

Cloud benchmark, Search AI in the opponent seat, browser budget (up to 128 samples, 600 ms), 300 games per mode, seeds 700000+:

| Mode | vs Rules AI, previous Search AI | vs Rules AI, current Search AI | Current vs previous Search AI, head-to-head |
| --- | --- | --- | --- |
| Draft | 86.0% (256 W / 4 D / 40 L) | **89.3%** (267 W / 2 D / 31 L) | **58.5%** (170 W / 11 D / 119 L, ±2.8 pp) |
| Discard | 67.0% (197 W / 8 D / 95 L) | 68.5% (201 W / 9 D / 90 L) | 50.8% (149 W / 7 D / 144 L, ±2.9 pp) |

In the head-to-head games each deal is played twice with the seats swapped; the previous Search AI uses Rules AI preparation. Decision time on the cloud CPU: draft picks mean 228 ms / p95 600 ms (was 118 / 204), discard passes mean 606 ms (they now use the whole budget, about 88 samples instead of 128), preparation steps mean 107–133 ms / p95 about 260 ms. Draft gains clearly. In discard mode the rival's hand is hidden, so pre-battle search helps less, and the slower rollouts cost samples; the net effect there is about zero. Reproduce with `npm run opponent:benchmark -- <draft|five-hand-discard> <games> 128 600 700000 [search|rules]`.

## Strength of the first version (cloud benchmark, Search AI in the opponent seat vs Rules AI, browser budget)

| Mode | Games | Search AI score | Std. err. | Mean / p95 decision time (desktop CPU) |
| --- | --- | --- | --- | --- |
| Draft | 400 | 85.9% (341 W / 5 D / 54 L) | 1.7 pp | 139 ms / 251 ms |
| Discard | 400 | 65.6% (257 W / 11 D / 132 L) | 2.4 pp | 386 ms / 572 ms |

Rules AI against itself scores 49.3% (draft) and 51.5% (discard) for the opponent seat on the same seeds. Reproduce with `npm run opponent:benchmark -- <draft|five-hand-discard> <games> <maxSamples> <timeBudgetMs> [firstSeed]`. Tests: `npm run opponent:test`. These test legal choices, independence from the hidden deck order and the rival's hidden hand, and that search beats the rules on 40 fixed deals per mode.

Limitations: uniform beliefs (no inference from the human's past choices); the rollouts model the human as the Rules AI for hand building; the search is one level deep over the root choice only; no neural network is used (see `NEURAL_NET_STATUS.md`).
