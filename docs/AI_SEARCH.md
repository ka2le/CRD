# Observation-sampled rollout teacher

Current scale-up: `AI_DRAFT_V2.md` documents per-candidate compressed W/D/L examples, search self-play, ~100k parameters and paired search-opponent tournaments. Search continues to use the independent observation-only sampler below. A new draft-specific test requires identical evaluations after reversing the real unseen deck/changing its seed, and different hypothetical packs across independent planning seeds.

Latest follow-up: `AI_DRAFT_EXPERIMENT.md` implements the creator's narrower draft-only experiment, preserving heuristic preparation. It includes grouped mixed self-play collection, first NumPy model, same-budget experimental neural root correction and held-out tournaments. The original general teacher remains unchanged; "no model" statements below describe its initial delivery.

Implemented **2026-10-19**, after the complete decision/Gymnasium environment. `AI_ENVIRONMENT.md` documents that foundation; `AI_TRAINING.md` describes the remaining neural evaluator plan.

This is a shallow all-action rollout evaluator, not a trained policy or deep adversarial tree search. It provides a useful completion-based baseline and dense per-action targets for the first value model.

## Information boundary

`src/game/rolloutSearch.js` takes **only** a permitted observation, public physical-card catalog and independent planning seed. It cannot query a live session, original deck or episode seed. The worker's `evaluate`/`sample` commands call it without looking up a session. `CRDEnv.evaluate_actions()` passes only these public/permitted inputs, not its real replay configuration.

The public pool catalog contains IDs/UIDs sorted by UID, never deal order. Canonical card definitions come from shared JS. UIDs identify already known physical cards but are omitted from numeric model inputs.

Sampler version: `uniform-feasible-random-private-prep-v1`:

1. Collect known originals from hands, row, piles, public history and the observer's private history. Retain copy/source identities and all observed past draws, even cards no longer held.
2. Sample an unknown enemy hand and remaining deck without replacement from unseen physical cards. Publicly known hands remain fixed.
3. At preparation, reconstruct our original ready hand and initial eligible piles from history, respecting current per-side pile semantics.
4. For the second physical seat, propose the first seat's unobserved private preparation with a random legal policy. Reserve our already observed draws so they cannot be consumed by that proposal.
5. Replay our own known preparation choices/outcomes, including order, copies, recycling and skips. Reject a proposal if it contradicts those outcomes or would consume reserved cards.
6. Re-encode the sampled state's root view and require semantic equality with the supplied observation, including hand, activation, piles, history, counters and visibility flags. Return no label if conditioning fails within the attempt budget.

This samples **feasible beliefs**, not the exact posterior induced by a strategic opponent's past choices. Unknown current holdings are sampled uniformly from feasible unseen cards; hidden prior preparation uses the declared random proposal rather than an inferred optimal/heuristic policy. Rejection conditions preserve the root's knowledge, but stronger opponent-policy inference/importance weighting is future work. Simulated hidden histories are not claimed to be a complete reconstruction of an opponent's perfect recall; current continuation policies are hand-based/random.

The normal 70/102-card pools are the initial training baseline. Pathological custom exhaustion histories may fail conditioning explicitly. Real-state forks remain privileged replay tools; they are never used here as unseen-world samples.

## Action evaluation

For each sampled root world, apply every legal candidate independently, then complete the game under either `heuristic` (default) or `random` policy. These policies use their own hand/available targets and permitted observations; they do not inspect future deck order. The same world and continuation RNG seed are paired across candidate actions. Different card consumption still produces each action's proper draws from that world's deck.

Final hands use exact shared combat. Utility is +1/0/-1 for the root seat. Every candidate reports:

- Mean match value `P(win) - P(loss)`, win/draw/loss counts, sample count and empirical standard error.
- Gap from the highest sampled value and paired gap standard error.
- Difference from the original heuristic's root choice and paired difference standard error.

The report includes `baselineIndex`, `baselineValue`, `bestIndices`, `bestValue`, `bestDeltaFromBaseline`, simulation count, sampling attempts, sampler/rules versions and completion-policy version. The baseline is estimated in match-outcome units using the same completed samples; raw damage is still a mechanical feature rather than an outcome reward. These paired targets are suitable for later residual learning.

Errors are not losses/draws. An exceeded rollout/conditioning guard aborts evaluation with an error. One sample reports no standard-error estimate (`null`). Small-sample winners and zero empirical variance do not prove optimality; selecting a maximum also introduces optimism. The teacher is conditional on its declared belief/completion policy and must be checked against actual held-out play.

Defaults: eight sampled worlds per action; supported configurable budget 1–256. This is one root comparison with policy rollouts. No model leaf evaluation, information-set MCTS, policy-conditioned belief model, pruning, batch/vector runner or self-play league is implemented yet.

## Python usage

```python
from crd.env import CRDEnv

with CRDEnv({"mode": "draft"}) as env:
    observation, info = env.reset(seed=7)
    report = env.evaluate_actions(samples=16, seed=100000)
    action_index = report["bestIndices"][0]
    observation, reward, terminated, truncated, info = env.step(action_index)
```

The planning seed argument is independent of the actual deal/replay seed. Evaluation leaves the live game unchanged. Candidate order matches the current `info['legal_actions']`; selecting one follows the normal environment step. `completion_policy='random'` and `max_decisions=...` are supported diagnostics.

Run complete rollout-controlled games and optionally save targets/replays:

```powershell
.ai-venv/Scripts/python.exe python/gym_smoke.py --mode draft --episodes 20 --policy rollout --samples 16 --seed 100 --planning-seed 100000 --dataset .ai-runs/draft-targets.jsonl --output .ai-runs/draft-replays.jsonl
.ai-venv/Scripts/python.exe python/gym_smoke.py --mode five-hand-discard --control opponent --episodes 20 --policy rollout --samples 16 --seed 100
```

`--policy random` remains the default smoke mode. Tied estimated choices currently select the first candidate. CLI paths explicitly name generated files; rerunning with the same paths replaces their contents.

Worker `evaluate` accepts `observation`, `spec` and optional `{seed, samples, completionPolicy, maxDecisions}` as `options`, and returns `evaluation`. Worker `sample` accepts the observation/spec plus sampling `{seed, maxAttempts}` options and a new `targetSessionId`, returning an independently simulated session. Neither command reads an actual source session. Public spec comes from `describe` or `reset`.

## Dataset and split boundary

Each decision JSONL record contains permitted observation, every legal candidate's searched value/counts/uncertainty, selected action, teacher configuration/versions, and separate host metadata (`root_family`, root episode/config, card hash, planning seed). Seeds/configuration never enter observation or numeric features.

`root_family` hashes the physical deal/pool/rules/card identity, grouping the same underlying deal across modes, seats and visibility. Fixed injected decks group by the deck rather than a meaningless shuffle seed. Split by this family **before** expanding candidate or sampled-continuation records. Keep both-seat/related-game variants together, deduplicate repeated states, and do not feed metadata into the model.

The companion replay file records concrete actual actions and the true match reward. Join decisions to actual outcomes by family/episode/config for calibration. A single game's root decisions and thousands of simulated candidate outcomes are correlated, not independent games.

## Pilot and verification

- Sampler reconstruction tested at **802** decision roots across both modes, hidden/visible opponent configurations and private preparation stages. It reproduces the root observation and exact legal candidates without changing the real state.
- Tests verify physical copy accounting, unseen-world variation, deterministic planning, reordered input-object keys, and unchanged evaluations when the actual hidden deck/seed is altered without changing the observation.
- A constructed recycle scenario values the winning recovery at +1 and skip/finish at -1; a rollout guard yields an error rather than a manufactured outcome.
- Python exercises stateless root/preparation evaluation, sampled sessions, live-game isolation and grouping shared deal families across modes/seats.
- Full suites now contain 14 JS tests and eight Python integration tests, in addition to build/lint/original regressions.

Local pilot files in ignored `.ai-runs/`:

| Run | Games | Decision states | Candidate targets | Exact completed continuations |
| --- | --- | --- | --- | --- |
| Draft, player seat | 20 | 145 | 779 | 12,464 |
| Discard, opponent seat | 20 | 85 | 1,490 | 23,840 |
| Total | 40 | 230 | 2,269 | 36,304 |

Each used 16 samples per candidate and reported 15 wins / 5 losses against the original heuristic in its respective run. These share **20 underlying deal families**, not 40 independent deals. They are development pilots, not held-out strength evidence or a sufficient train/test corpus. No model is trained on them yet.

Next: generate a broader grouped corpus, establish a fixed held-out tournament/evaluation set, and fit/compare the first small residual value model. Refine belief/prior policies and deepen search only with separate evidence of gains.
