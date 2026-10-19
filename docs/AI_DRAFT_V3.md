# Continued training of the four-hidden-layer evaluator

Creator follow-up2026-10-19: create more data and keep training the four-layer model. This run continues the completed v2 four-layer checkpoint, not a new random initialization. `AI_DRAFT_V2.md` preserves the previous data, training and strength evidence.

## Current run

- Preserve the149,650-parameter architecture:220→280→192→128→64→3 W/D/L.
- Freeze v2's best model as `.ai-runs/draft-v3/teacher-v2.npz`, SHA256 `86eca8b3e3361d70005ef6760990b9535b2f6229010cc13903f46d5d3ae9d81a`.
- Generate8,000 new physical deal families at actual seeds2000000–2007999,32 sampled outcomes/candidate, both first pickers,75% Wild/25% Normal.
- Mix actual-play policies per seat/game:50% base search,50% frozen v2 neural-prior search. One seat retains12% exploratory picks. Thus real games include base/base, base/neural and neural/neural; the non-exploring opponent always searches. Preparation stays heuristic.
- New data:16,000 games /160,000 draft roots /720,000 candidate rows /23.04m simulated outcomes. With v2:12,000 families /1.08m rows /34.56m outcomes. The tiny probe directory is implementation-only and excluded.
- Continue best v2 weights on old **training** data mixed with new training data for a requested1,200-second window at a lower initial learning rate0.0002. Existing validation/test families remain held out by their stable physical-family hash.
- Evaluate against the frozen previous **neural-assisted** search, not only bare base search, using fresh seeds11000000–11000999, both seats/starters and equal16-sample budgets.

Search still uses observation-conditioned hypothetical futures; no real future deck/seed enters model inputs. Every candidate evaluation contributes its W/D/L counts. Counterfactual continuations remain heuristic; actual-play returns now include the frozen learned opponent. The distinction from a recursively searched counterfactual teacher remains important.

## Continuing weights safely

`train_value.py --warm-start` loads the existing weights, normalization and fitted linear prior without changing the initial function. Adam moments are initialized afresh because the earlier best checkpoint stores weights, not its optimizer state. Hidden widths are inherited unless explicitly checked with `--hidden`. The starting weights are saved as `initial.npz`; `best.npz` follows validation cross-entropy, and `last.npz` preserves the final training weights. Initial-checkpoint metrics are reported alongside final metrics.

`--add-data` mixes complete shard directories. Family splitting stays stable across all sources, so old held-out families never enter training. Root groups are namespaced per source to prevent numeric-ID collisions. Family identities are stored as compact metadata indices in RAM, never inputs; duplicate directory arguments and incompatible signatures are rejected. All old source-model exclusion identities are retained for future tournaments, even when continuing on a new-only dataset.

Collection records the frozen model hash and policy mixture in its manifest; changing the teacher while resuming is rejected. Default no-model collection retains v2 shard identity compatibility. Existing datasets/checkpoints are preserved.

## Commands

```powershell
$env:OPENBLAS_NUM_THREADS='1'
.ai-venv/Scripts/python.exe python/collect_draft.py .ai-runs/draft-v3/data --deals 8000 --workers 4 --chunk 20 --samples 32 --seed 2000000 --planning-seed 22000000 --exploration-seed 32000000 --model .ai-runs/draft-v3/teacher-v2.npz
.ai-venv/Scripts/python.exe python/train_value.py .ai-runs/draft-v2/data .ai-runs/draft-v3/model --add-data .ai-runs/draft-v3/data --warm-start .ai-runs/draft-v3/teacher-v2.npz --epochs 1000 --seconds 1200 --learning-rate .0002
.ai-venv/Scripts/python.exe python/evaluate_search.py .ai-runs/draft-v3/teacher-v2.npz .ai-runs/draft-v3/reference-v2.json --opponent-model .ai-runs/draft-v3/teacher-v2.npz --policy neural --deals 1000 --seed 11000000 --planning-seed 61000000 --workers 2
.ai-venv/Scripts/python.exe python/evaluate_search.py .ai-runs/draft-v3/model/best.npz .ai-runs/draft-v3/challenger.json --opponent-model .ai-runs/draft-v3/teacher-v2.npz --policy neural --deals 1000 --seed 11000000 --planning-seed 61000000
.ai-venv/Scripts/python.exe python/compare_search.py .ai-runs/draft-v3/reference-v2.json .ai-runs/draft-v3/challenger.json --output .ai-runs/draft-v3/comparison.json
```

Equal-budget comparison is paired by physical deal, seat, starter and planning RNG. The comparison rejects different opponent models/priors and incomplete pairs. Learning on more data does not by itself establish a stronger challenger; preserve the previous frozen policy until results justify a change. Browser/rules/publishing remain outside this training run.

## Progress recorded during the run

New collection completed in1,543.7 seconds: all8,000 families /720,000 candidate rows /23.04m simulations. Combined split:9,555 training families (859,950 rows),1,218 validation (109,620),1,227 test (110,430). Initial checkpoint verification confirms every weight, normalization array and linear coefficient is exactly equal to the frozen v2 source; only host exclusion metadata expands to12,000 families.

The1,200-second continuation is active, retaining the best validation checkpoint (epoch8 at latest check). The frozen v2 reference has completed4,000 games on1,000 new deals:1,959 wins /132 draws /1,909 losses, score50.625%,2.88m exact completions. This is v2 against itself with paired independent planning streams, not evidence of a new-model gain. The v3 challenger tournament is queued after full training completes; results will be added when available.

## Second continuation, run 2 (2026-10-19 evening)

Warm-started from v3 `best.npz` with the same data/settings (lr 0.0002, 1,200 s) plus new `--snapshot-every 5` in `train_value.py`; 176 epochs into `.ai-runs/draft-v4/model/`. Validation cross-entropy never improved on the starting weights (0.6527 → 0.726 at the end; `best.npz` = start), the same overfitting seen in run 1 after epoch 8. Top-choice agreement with the search teacher crept up 75.1% → ~76.2% and regret 0.058 → 0.053, but play strength did not move:

Score vs plain search (500 deals / 2,000 games, seed 9000000, paired with `draft-v2/confirm-*`): run1 best 53.75%, run1 last (e84) 53.42%, run2 e20 53.55%, e60 53.45%, e100 53.40%, last (e176) 53.57%; 100k shallow 53.05%, v2 deep 53.50%. Every gain over plain search sits at +2.75..+3.1pp with ±1pp intervals that overlap completely. Curves: `.ai-runs/eval-final/training-curves.png`; numbers `.ai-runs/eval-final/curve/winrate-curve.json`.

Conclusion: more epochs on this dataset are exhausted. Next gains need different data (e.g. labels from neural-assisted continuations rather than heuristic rollouts, or more families), regularization, or a larger search budget, not more training time.
