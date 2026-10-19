# First draft-only search and learning experiment

Follow-up: `AI_DRAFT_V2.md` is the active larger-data/~100k-parameter experiment, judged primarily against base search. This document preserves the first prototype and its results.

Implemented 2026-10-19 following the creator's scope reduction: **learn/search draft picks first; use the current heuristic for all preparation**. Both sides still activate real specials, including acquired/copy/recycle chains. Combat uses the unchanged exact digital 21/50 rules. No need to learn combat arithmetic or preparation order for this milestone. Browser AI remains heuristic.

## Run it

Use the existing `.ai-venv` (NumPy is sufficient; no new dependencies or PyTorch installation):

```powershell
.ai-venv/Scripts/python.exe python/draft_experiment.py --deals 80 --samples 8 --dataset .ai-runs/draft-v1/targets.jsonl --output .ai-runs/draft-v1/collection.json
.ai-venv/Scripts/python.exe python/train_draft.py .ai-runs/draft-v1/targets.jsonl --model .ai-runs/draft-v1/model.npz --report .ai-runs/draft-v1/training.json --epochs 200
.ai-venv/Scripts/python.exe python/draft_experiment.py --deals 100 --seed 50000 --planning-seed 9000000 --samples 16 --policy rollout --output .ai-runs/draft-v1/eval-rollout.json
.ai-venv/Scripts/python.exe python/draft_experiment.py --deals 100 --seed 50000 --policy neural --model .ai-runs/draft-v1/model.npz --output .ai-runs/draft-v1/eval-neural.json
.ai-venv/Scripts/python.exe python/draft_experiment.py --deals 100 --seed 50000 --policy linear --model .ai-runs/draft-v1/model.npz --output .ai-runs/draft-v1/eval-linear.json
.ai-venv/Scripts/python.exe python/draft_experiment.py --deals 100 --seed 50000 --planning-seed 9000000 --samples 16 --policy hybrid --model .ai-runs/draft-v1/model.npz --output .ai-runs/draft-v1/eval-hybrid.json
```

`--policy random` and `--opponent random|heuristic|rollout` allow additional comparisons. Default Wild Deck; `--normal-deck` selects Normal. Paths are explicit and overwritten on rerun. `.ai-runs` is ignored local data/models/reports; commands recreate them. A model tournament rejects any physical deal family from its source dataset, including the dataset's validation/test groups.

Every deal plays four games: candidate in each physical seat, crossed with each opening picker. These games are correlated; reported approximate 95% score intervals cluster by deal. Deal seed, exploration RNG and planning RNG are separate streams. The report preserves semantic actions/configuration/outcomes for replay. Data collection mixes heuristic self-play, random draft self-play and rollout draft self-play by deal; both seats receive all-action teacher labels. Its aggregate WDL is **not** a tournament strength result.

## Model and data contract

`python/crd/draft_model.py` implements a 64-hidden-unit tanh MLP residual over a fitted regularized linear prior, trained by supervised outcome regression with Adam. Output is `tanh(linear(features) + neural_residual(features))`; the output correction starts at zero. The linear prior is fitted to rollout outcome labels, **not** the old hand heuristic or an exact mathematical outcome formula. NumPy keeps this first small model runnable with the dependencies already installed. This is an action-value prototype, not yet a state-value cutoff in a deep tree.

Inputs: normalized definition counts for our hand, known enemy hand, public row, discard pile and proposed pick; engine-derived partial-hand damage/shield cycles; draft progress, relative first-picker and pool setting. No physical UIDs, true deck, seed, replay metadata or teacher values enter inference. Histories are summarized into current known cards/piles; richer history/belief features remain future work. Card/rules/feature/teacher signatures are checked on use. Physical family hashing groups seat/first-picker variants before expanding candidate labels; duplicate numeric information states are removed globally. This experiment has its own `draft-decision-v1` dataset format; earlier general `gym_smoke.py` pilot records are not silently mixed into it.

Train/validation/test assignment uses a stable family hash (80/10/10 expected, actual group counts vary). Fit normalization and the linear prior on training only; select neural checkpoint by validation MSE; report test once. Early stopping can retain the original zero correction. The eight-sample teacher is noisy and completion-policy dependent: fitting it is not optimal-play supervision.

`neural` and `linear` choose draft actions directly without simulation. `rollout` compares exact completed outcomes, preferring the heuristic root action on estimated ties. Experimental `hybrid` adds `0.05 * neural_value` to sampled action values at the **same rollout budget**; it is a small root-ranking correction, not deeper search or a replacement leaf evaluator. Do not promote it without tournament evidence.

Worker `baseline` returns the existing acting-seat heuristic action without changing state. It lets both-seat Python orchestration use identical preparation behavior rather than rebuilding preparation rules in Python. Search remains stateless and observation-conditioned as in `AI_SEARCH.md`.

## First recorded results

Local run directory: `.ai-runs/draft-v1/`. Collection: 80 deals / 320 games / 3,200 draft states / 14,400 candidate targets / 115,200 exact continuations, eight samples per candidate. Collection took about 32 seconds on this machine. After deduplication: 1,544 train states in 60 families, 249 validation states in seven families, 316 test states in 13 families. Checkpoint selected epoch 5 of 200; small corpus overfits quickly.

On the reserved dataset test families, linear versus neural MSE: **0.2743 / 0.2726**; mean teacher regret: **0.2207 / 0.2025**; agreement with any highest-valued teacher action: **60.44% / 63.92%**. These are correlated/noisy action labels, not match win rates.

Frozen policies versus the original heuristic on **100 new deal families, 400 games each**, seeds 50000–50099:

| Draft policy | W / D / L | Score (W + half D) | Deal-clustered approximate 95% interval |
| --- | --- | --- | --- |
| Random | 68 / 9 / 323 | 18.13% | 14.13–22.12% |
| Linear evaluator | 216 / 14 / 170 | 55.75% | 47.60–63.90% |
| Neural evaluator | 216 / 8 / 176 | 55.00% | 46.94–63.06% |
| Rollout, 16 samples/candidate | 312 / 10 / 78 | 79.25% | 74.50–84.00% |
| Rollout + neural root correction, same samples | 315 / 11 / 74 | 80.13% | 75.31–84.94% |

Search is useful against this heuristic on unseen deals. The neural model runs and slightly improves held-out teacher rankings, but these match results do **not** show an advantage over the linear evaluator or clearly over the heuristic. No trained policy is promoted to the browser.

The hybrid's paired improvement over rollout is **+0.875 percentage points**, with a deal-clustered approximate 95% interval of **-3.02 to +4.77 points**. This does not establish a neural search gain. Both start with the same independent planning seed and use 16 samples per candidate. Planning offsets can diverge across games when draft choices lead to different preparation lengths; pairing is by actual deal, not guaranteed identical planning samples. Neither is tuned on these tournament outcomes.

Median draft latency in these local runs: standalone neural about 0.18 ms, linear 0.14 ms, 16-sample search 16.3 ms (95th percentile 24.1 ms). Timing includes Python policy/worker call where relevant, excludes the real game's step, and varies with machine load. These are desktop measurements, not mobile/browser benchmarks.

## Next useful work

Verification for this slice: all 14 JS headless tests and 11 Python tests pass, along with lint, production build, original regression smoke and `git diff --check`. Python adds checks for feature privacy/permutation behavior, same-deal grouping, integer-valued hybrid labels, learning a nonlinear synthetic target, zero-residual parity and saved-model roundtrip. Full recorded collection/training/tournaments also completed; no UI or publishing change was made.

Keep the draft-only contract. Increase independent training deals and label budgets; compare target stability and near-tie rankings. Broaden opponent coverage and reserve fresh evaluation seeds after any tuning. Use a neural cutoff to reduce search cost only once equal-budget comparisons justify it; the first network is a working training/inference pipeline, not evidence that neural search is stronger. Preparation search, discard training and deeper information-set search remain optional later work.
