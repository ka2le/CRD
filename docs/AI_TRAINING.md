# Search and neural evaluation plan

Updated **2026-10-19**. The creator requested tree search guided by mathematical evaluation plus a learned correction, then authorized finishing the environment and connecting the next pieces. Shared preparation decisions, either-seat headless control, numeric observations and the Python/Gymnasium wrapper are now implemented. Search/model training remain planned. Read `AI_ENVIRONMENT.md` for the runnable contract, setup and verification.

## Objective and scope

Target the **current digital game**: both hand-building modes, Normal/Wild pools, all four supported preparation effects, and exact simultaneous combat with 21-damage lethal and a 50-round tie cap. The tabletop chart in `TABLETOP_COMBAT_DESIGN.md` remains a separate, unapproved proposal. Give future rulesets separate versions and datasets.

Optimize expected match outcome: win +1, draw 0, loss -1. Value means `P(win) - P(loss)`, not average damage. A faster win is not inherently worth more under current rules. The 50-round combat tie is a real terminal draw, not a training timeout.

```text
legal decisions -> search choices and chance outcomes -> cutoff evaluation
                                                        |
                                    calculated baseline + neural correction
                                                        |
                               exact simulator when both prepared hands are final

deeper searches + played outcomes -> training examples -> improved evaluator
```

Combat needs no policy: there are no decisions after preparation. Given two final hands, calculate the exact result. The learned value concerns unfinished hands, remaining choices, unseen cards and an adapting opponent.

The Stockfish analogy is search plus a fast learned position evaluator. Stockfish removed traditional handcrafted evaluation in 16.1; our explicit mathematical residual is a CRD design choice, not a claim that modern Stockfish works identically. Chess-specific NNUE inputs/incremental accumulators are unnecessary for the first small model here. Primary references are below.

## Existing foundation and gaps

| Piece | Current state | Next use |
| --- | --- | --- |
| `src/game/engine.js` | Pure exact combat with round history | Outcomes, rollout labels and reference checks |
| `src/game/cardEvaluator.js` | Average damage and shared heuristic scoring | Mathematical features and named reference opponent |
| `src/components/card/cardMeta.js`, `src/App.jsx` | UI uses this estimator and marginal hand differences | Reuse the mathematical idea |
| `src/game/preparationState.js`, `preBattleEffects.js`, `preBattle.js` | Shared state/effects, explicit source/target/order/skip/finish, heuristic completion | Use the decision API for future value-based policies |
| `src/game/headlessGame.js` | Both modes, either-seat control, preparation, privacy/history, real-rule terminal rewards | Add observation-consistent hidden-world sampling and rollouts |
| `scripts/headless-worker.mjs`, `python/crd/worker.py` | Protocol v2, versions/hash, persistent sessions, isolated host forks, bounded Python transport | Batch simulations after fair resampling exists |
| `python/crd/env.py`, `python/gym_smoke.py` | Tested Gymnasium wrapper, numeric counts/combat cycles, variable action/history sequences, masks and replays | Attach a candidate/value evaluator and training loop |

Headless now treats preparation as agent decisions and defaults to the actual 21-damage/50-round match. The old 12/999 evaluation is available only as an explicit diagnostic override. The legacy UI/heuristic average estimator still omits whole-hand doubling and penalizes draw utility/shields; new numeric combat cycles use the exact simulator including doubling. Neither raw damage nor heuristic scores are exact strategic value.

Gymnasium and NumPy are installed in ignored `.ai-venv`, with reproducible requirements and integration tests. No PyTorch model, fair hidden-world search/rollout teacher, training loop or browser neural integration exists yet.

## 1. Exact shared transitions and player information

JavaScript stays the sole rules implementation; Python owns orchestration, numerical learning and experiments. Avoid a second Python rules engine unless profiling later justifies one, with parity against JS as a prerequisite.

Implemented: either-seat legal actions, transitions, observations and terminal outcomes. Automatic heuristic advancement is an optional convenience over the same decisions. Browser and headless preparation call shared domain transitions; graphical target selection/cancellation and animation timing remain in React.

Preparation actions cover draw/redraw activation, copy source/target, recycle source/target, and finish. Preserve chosen activation order, optional skips, activation per runtime identity and fresh copied-special identities. Internal scheduling must preserve current shared-deck consumption and privacy; it must not introduce public alternating preparation turns or reveal intermediate enemy preparation.

Separate privileged engine state from each player's information:

- Own hand, activation state, allowed recycle choices and observed history.
- Shared row, public draft picks/discards, remaining decisions, mode/pool settings and observable deck size.
- Opponent cards only where permitted. Remember public picks even if later hidden; private preparation can subsequently change that hand.
- Beliefs about hidden locations based on pool counts and observations. Known pool composition does not mean the remaining deck composition is known when an opponent holds hidden cards.

Never put deck order, episode seed, hidden hands/selections, opponent debug traces, revealing UID provenance or full-state feature summaries in policy inputs. UIDs are action handles, not learned numbers. Keep replay seeds and privileged snapshots outside policy observations. Simulated opponents receive their own information, not ours.

Search branches must resample worlds consistent with the acting player's observations, rather than clone the real hidden deck. Preserve the real match untouched. Evaluate visible/hidden opponent configurations separately.

Keep deferred recycle/pile/bookkeeping semantics explicitly versioned. Do not silently change singleton recycle intent, copy counts, final draft leftovers or starter behavior as part of extraction. Match the browser first; deliberate fixes and affected datasets need separate versions.

## 2. Mathematical features and residual value

For ordinary class attacks, let `s_k` be class stats and `a_k` the sum of matching attack damage coefficients divided by cooldown:

```text
average raw damage = sum_k s_k * a_k
one extra stat of class k -> a_k extra average damage
one extra attack with damage coefficient d and cooldown c -> s_k * d/c extra
```

A zero-damage stat can still be a promising early pick. For draws, `delta(s*a) = s*delta(a) + a*delta(s) + delta(s)*delta(a)`: two new cards can enable one another. Adding independently estimated card values misses that cross-term.

Add engine-derived counts, class totals, attack capacity, flat/hybrid damage, shields, and complete round-by-round damage/shield profiles including doubling. Current positive cooldowns repeat over 12 rounds; that is a feature period, not a replacement for the 21/50 outcome rules. Recompute it if supported cooldowns change. Calculate marginal features for the actual action: add a pick, remove a discard subset, replace a copy source or add a recycle target.

For Draw 2, evaluate the **whole hand after both cards**, then resolve subsequent choices. Broad stats help many attacks pay off; existing attacks also make newly drawn stats useful. Diversity alone is not a value function. Copying draw replaces the copy source; redraw discards the entire hand. Use actual transitions instead of fixed draw bonuses.

Sample without replacement or enumerate weighted outcomes where cheap. Two simple draws have at most 378 unordered definition pairs with 27 definitions before excluding impossible pairs. Account for copy counts and, where needed, hidden pool allocations. Unordered aggregation is valid only if draw order cannot affect continuation; acquired specials and other private draws may require sequence-aware branches.

Separate raw damage features from a baseline `B(I)` in **expected match-outcome units**. Initially estimate it with a cheap fixed completion/opponent policy and exact battles over consistent future samples. Later distill/calibrate a cheaper baseline if profiling warrants it. Cache by information state and baseline version.

For a nonterminal information state `I`, a concrete residual design is:

```text
V(I) = tanh(atanh(clamp(B(I), -1+eps, 1-eps)) + f_theta(features(I)))
```

Zero-initialize the correction output to reproduce the baseline. Known terminal results bypass this formula. Do not add arbitrary heuristic points directly to probabilities. Do not force the correction to remain tiny: specials with no immediate damage can change outcome substantially. Calculations give a useful prior, not a guarantee the remaining strategic correction is small.

Start with a compact PyTorch MLP, for example two 128-unit hidden layers, then benchmark. Use normalized counts by definition and activation status so hands can grow beyond five. Include phase, actor, remaining opportunities, known enemy features and public-history/belief summaries. If those summaries lose relevant history, improve them. No card art or language model is needed.

## 3. Search before neural training

First build a non-neural teacher: evaluate every root action with sampled complete continuations, a fixed completion policy, an explicit opponent policy and exact battles.

- Draft: at most five root picks; account for the opponent's remaining choice and denial.
- Discard: all 32 subsets of a five-card hand, including empty; evaluate combinations jointly.
- Preparation: activation order, targets and finish; a private decision sequence against an uncertain prepared opponent, not alternating combat min/max turns.

Pair consistent sampled future worlds across root actions where possible to reduce variance. Preserve correct marginal distributions when actions consume different numbers of cards; paired samples do not imply forcing identical cards into every branch. Measure label stability as rollout budgets increase.

Next deepen the search and evaluate only unfinished cutoffs with `V`. Maximize our visible choices. For a specified opponent policy, average its responses; for fully visible adversarial choices, minimize our utility. Chance nodes average by probability. Define a consistent seat perspective; do not negate values at every draw or phase transition.

For hidden choices, start with belief-sampled rollouts whose policies act on observations. Do not solve each hidden world with omniscient minimax and average best responses: that permits future choices to depend on hidden facts the player cannot distinguish (strategy fusion). If deeper shared search becomes necessary, group decisions by information set; information-set MCTS is a candidate. This is why directly copying chess alpha-beta is not our first implementation.

Configure search budget, leaf evaluator, completion policy and opponent policy separately. Initially keep all root actions. Add pruning only after checking rare specials/counterpicks. Cache exact final-hand combat results separately from information-state values, including rules/pool/activation/perspective/history or belief in relevant keys.

## 4. Python environment and worker contract

Use NumPy, Gymnasium and PyTorch. Gymnasium supplies an episode interface; it does not require starting with PPO. Supervised value fitting from searched continuations is the first training algorithm. Self-play subsequently improves coverage and the teacher.

Implemented: controlled-seat Gymnasium wrapper with the heuristic as the non-controlled policy. One step applies our action and runs intervening opponent/automatic events until our next decision or result. Worker `control: 'both'` exposes every actor for external policies/self-play. Host forks isolate immutable states, but do not yet provide observation-consistent hidden-world resampling. PettingZoo remains optional.

```python
observation, info = env.reset(seed=seed, options=config)
observation, reward, terminated, truncated, info = env.step(action)
```

Use zero intermediate reward and terminal +1/0/-1 initially. A training guard/timeout is truncation, not a draw/loss; invalid states and worker failures are errors. Do not substitute 12-round damage for winning. Mathematical damage labels may serve as diagnostics or auxiliary targets.

Implemented: all actions form a variable candidate list, including explicit preparation source/target/skip/finish decisions. Gymnasium uses a masked Discrete index into that current list, with capacity derived from pool/growth bounds. Numeric candidates/history are variable Sequence observations; counts handle hands above five. No actions are silently clipped. Checker coverage passes for both modes and controlled seats. See `AI_ENVIRONMENT.md` for exact shapes and transient-index semantics; off-the-shelf flat PPO input is not supplied.

Extend the persistent worker incrementally:

1. Real-rule reset/step, both-seat legal actions, player observations and rule/card versions.
2. Internal immutable branches or snapshot/restore, with reproducible observation-consistent resampling.
3. Batched branch/completion/outcome requests to avoid a Python/JSON round trip for every node.
4. A value-only battle path, reference-checked against `simulateBattle`, if profiling justifies it.

Keep stdout for JSON responses and stderr for logs. Manage shutdown/errors/timeouts. Independently seed deck generation, belief sampling, exploration and opponent randomness; preserve replay metadata outside observations.

Current and next boundaries:

```text
src/game/preparationState.js   full shared preparation transitions
src/game/preBattleEffects.js   primitive effects; preBattle.js is the baseline policy/facade
src/game/headlessGame.js      either-seat actions/steps, observations/history and JS mechanical features
python/crd/env.py             Gymnasium wrapper
python/crd/worker.py          persistent bounded bridge client; batching remains planned
python/gym_smoke.py           masked random episodes and optional local replays
python/crd/search.py          PLANNED: fair sampling and rollout/search orchestration
python/crd/model.py           PLANNED: small residual evaluator
python/crd/dataset.py         PLANNED: grouped/versioned training records
python/train_value.py         PLANNED: evaluator fitting
python/evaluate.py            PLANNED: tournaments and ablations
```

## 5. Training data and improvement loop

Collect reachable states from random play, existing heuristics and search. Include incomplete early hands, late decisions, shield counters and preparation chains. Add targeted rare-effect scenarios, marked separately from tournament sampling.

At each selected decision, branch all legal actions and run multiple consistent continuations. Record mean exact outcome per action, sample count and uncertainty; back up a teacher state value under the declared decision/opponent policy. Train the value residual on these nonterminal state targets. Candidate ranking or a policy head can be added later. Training only on the old heuristic's score would reproduce its blind spots.

One played game supplies all decisions plus simulated counterfactuals. Five draft decisions with up to five picks and 64 continuations yield up to 1,600 candidate-outcome observations before preparation. Discard offers two decisions with 32 subsets each. These are extra simulations with correlated origins, not free independent labels.

Records need root episode/seed family, observation/history, actor, legal candidates, baseline, teacher values, counts/uncertainty, search budget, policy/checkpoint IDs, rules version and card-data hash. Seeds remain metadata. Split train/validation/test **by root episode/seed family before expanding branches**, deduplicate across splits, and keep sibling branches/two seats together. Reserve separate evaluation opponents.

Start with value regression, regularization and appropriate weighting for noisy estimates. Batch inference; benchmark CPU and any available GPU after measuring simulator/IPC cost. No hardware or training-time requirement is established yet.

Iterate: freeze evaluator -> stronger searched continuations -> new examples -> train challenger -> held-out tournament -> promote if stronger at the intended budget. Mix current/older checkpoints and random/heuristic opponents, with exploration and near-tied decisions. Use actual outcomes to check/calibrate search targets. A shallow search teacher is not ground truth about optimal strategy.

## 6. Milestones and evidence

| Milestone | Deliverable | Acceptance evidence |
| --- | --- | --- |
| A. Shared exact environment | Full preparation, either-seat actions, validation, real-rule outcomes | Scripted seeded parity with shared browser logic; supported effects, optional skips, copied/acquired specials, 21-damage outcomes and 50-round ties |
| B. Python contract | Gymnasium wrapper, masks, observations/history, reproducible worker | Environment checker; invalid actions rejected without mutation; hidden seed/deck/debug changes leave an identical policy observation unchanged; branching does not mutate real match |
| C. Search teacher | All-action sampled rollouts and tournament runner | Draft pilot first, then discard/preparation reports; comparisons with random/current heuristic; label stability, outcomes/second, IPC cost and decision latency measured |
| D. Learned evaluator | Versioned dataset, residual MLP, repeatable commands | Held-out value/calibration checks; zero correction matches baseline; search+net beats or justifies itself against identical search with mathematical baseline |
| E. Iterative strength | Deeper search, frozen opponent league, refreshed labels | Gains on unseen seeds, both seats/first pickers, modes, pool/visibility settings, with uncertainty |
| F. Browser opponent | Exported model and budgeted search in Web Worker | JS/Python features/output parity; mobile latency/memory measured; heuristic fallback; legal actions preserved |

Report win/draw/loss, score `win + 0.5*draw`, independent game counts, paired-seed/seat confidence intervals and latency. Preserve physical draw/refill asymmetry when swapping roles; pairing is an experimental control, not proof the current game is symmetric. Separate pilot/tuning data from final held-out evaluation.

Compare current heuristic, mathematical/completion baseline alone, search with that baseline, learned evaluator without deeper search, and search plus learned evaluator. Use equal simulation budgets to isolate evaluator contribution and equal wall-clock budgets for practical strength. Better damage prediction without stronger match results is insufficient. Exploiting only the old heuristic does not establish robust strength.

Train in Python, export a small numeric model, and benchmark plain JS versus an ONNX runtime before choosing packaging. Keep search off the React thread and enforce a decision budget. Players should need neither Python nor a server.

## Completed first slice and next work

Milestone A and the minimal B contract are implemented: shared preparation choices (including ordering and targets), actual terminal outcomes, either-seat control, legal validation, private observations, deterministic replays and Gymnasium. Verification includes browser reducer parity, all supported preparation effects, 144 JS seeded replay cases, 48 Python replay episodes, environment checkers and 200 additional smoke episodes. Full interaction/balance proof is not claimed.

The next slice is observation-consistent hidden-world sampling and a non-neural rollout teacher. Build/test sampling against public history and hidden-pool constraints before deriving search labels; the host fork command preserves the real hidden world and is not a fair search implementation. Then benchmark batching and fit the residual model. Existing commands now play **complete real-rule episodes**:

```bash
python python/random_headless_smoke.py --mode five-hand-discard --seed 7 --reveal-opponent
python python/random_headless_smoke.py --mode draft --seed 7 --reveal-opponent
```

Reuse current seams: `cards.js` seeded/injected RNG/decks; draft strategy overrides, omitted move records and idle animations; discard strategy overrides; the persistent worker. Extend them for actual control of both seats rather than training through React timing hooks.

## Primary references

- [Stockfish search source](https://github.com/official-stockfish/Stockfish/blob/master/src/search.cpp): search/evaluation boundary.
- [Stockfish 16.1 release](https://stockfishchess.org/blog/2024/stockfish-16-1/): removal of handcrafted evaluation.
- [Stockfish PyTorch trainer](https://github.com/official-stockfish/nnue-pytorch): separate evaluator/data workflow; not a CRD dependency.
- [Gymnasium Env API](https://gymnasium.farama.org/api/env/) and [custom environments](https://gymnasium.farama.org/introduction/create_custom_env/): episode contract, spaces, seeding and termination.
- [Gymnasium action masks](https://gymnasium.farama.org/tutorials/training_agents/action_masking_taxi/): legal-action masking.
- [PettingZoo AEC API](https://pettingzoo.farama.org/api/aec/): optional multi-agent interface.
- [Cowling, Powley and Whitehouse: Information Set Monte Carlo Tree Search](https://eprints.whiterose.ac.uk/id/eprint/75048/): hidden-information search. Applying it to CRD is our proposal, not an existing CRD result.
