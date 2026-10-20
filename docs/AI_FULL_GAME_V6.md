# v6: six hidden layers, both game modes, longer training

Requested 2026-10-20. This supersedes the draft-only learning scope. The creator wants more data from the best search playing itself, a roughly 200k network with six hidden layers, a higher decaying learning rate, longer training, then comparisons only against the existing 183k net and plain search.

## Run and current status

Active run: `.ai-runs/full-game-v6/`. At dispatch, data collection is running; **the new network has not finished training and has no strength result yet**. Read `status.json` for the live stage, `collection.log` for data progress, `model/progress.json` / `model/learning.jsonl` for training, and `summary.json` for final results. Do not confuse `full-game-v6-smoke` or `pilot-data` with strength evidence.

`python/run_full_game_experiment.py` runs collection, training and the requested tournaments sequentially in a hidden local process. Logs and failure state are saved. Original v5 and all older artifacts are preserved. Completed stages can be reused by rerunning the same command; a partial training directory is preserved and deliberately refuses overwrite. The immutable `plan.json` records settings, teacher hash and source hashes; changing source requires a fresh run plan. No cloud upload, publishing or browser-opponent changes.

```powershell
$env:OPENBLAS_NUM_THREADS='1'
.ai-venv/Scripts/python.exe python/run_full_game_experiment.py .ai-runs/full-game-v6
```

## Data and teacher

- 18,000 new physical deal families at seed 17,000,000 onward: cycle Draft / Draft / five-hand-discard = 12,000 draft families and 6,000 discard families. Draft uses both first pickers; discard has one game per family, avoiding duplicate games for an irrelevant first-picker setting. Total 30,000 actual self-play games.
- Both seats search every non-forced draft, discard and preparation decision. Preparation includes activation order, copy/recycle targets, skip/finish and newly acquired specials. Combat is exact automatic digital 21/50, with no choices. Tabletop is outside this run.
- Frozen v5 (`teacher-v5.npz`, SHA-256 `27eac3ab8b07f2b0d97a98d00f6ad3e34762fc43f74943520be574418cc71b80`) supplies a 2-virtual-sample neural prior to **both** draft players. No exploration moves. V5 has no discard-mode training; both discard players use the strongest non-neural preparation-search + prep-lookahead setup. V5 is deliberately unsupported for the entire discard mode, including preparation, rather than treating out-of-distribution inputs as trained coverage.
- 32 sampled worlds per legal candidate, every candidate retained; 10 ordinary local simulator workers, one BLAS thread each. Normal/Wild sampling stays 1:3.
- Each row retains rollout W/D/L counts separately from the actual selected action's searched-game outcome. Actual outcome weight increased from 8 to 32. **Counterfactual rollout hand building still uses Rules AI; preparation completion uses prep-lookahead.** Actual self-play searches every decision, but these dense labels are not full-search counterfactual completions. The model remains a root-action prior, not a recursively learned search cutoff.
- Stable physical-family train/validation/test splits keep seats, first pickers and related modes together. Fresh corpus only, no old weaker-teacher shards. Deal and planning seeds, hidden deck/order and UID identities are excluded from numeric inputs. Evaluation rejects overlap with either model's family exclusions.

## Model and training

New feature version `full-game-discard-prep-wdl-v4`: **424 inputs**. The first 388 retain the existing draft/preparation layout. Discard options encode discarded and retained card multisets, mode/action flags, remaining discard passes, visible enemy count/currentness, deck-count precision and pending replacements. Unknown draws remain unresolved. Old networks return unsupported for discard-mode decisions, which evaluation interprets as plain search.

Architecture **424 → 240 → 192 → 144 → 96 → 64 → 48 → 3**: **six hidden layers, 200,734 fitted parameters** including the linear W/D/L prior (same counting convention as v5).

Train fresh for **3,600 seconds of optimization plus validation**, four times v5's 900-second run. Cosine learning-rate decay is updated per minibatch from **0.001 to 0.00003**; weight decay 0.0003, batch 2,048, actual-outcome weight 32. Initialization and loading no longer consume the decay/training clock. Statistics and linear-prior fitting use bounded batches to avoid several full-corpus temporary arrays. Keep `best.npz`, `last.npz`, `initial.npz`, and snapshots every 20 epochs. Best checkpoint selection uses validation loss only. No test-set tuning or early stopping.

Training now records `epoch`, cumulative `optimizer_steps`, training cross-entropy, validation losses and separate draft/discard/preparation metrics. An **epoch** means a complete pass through the training rows; an **optimizer step** means one minibatch update. Previous best epoch 7/8 meant seven/eight passes, not seven/eight optimizer updates. Earlier continuing decreases in training loss alongside increasing validation loss indicated overfitting; a longer run alone does not guarantee improvement. Preserve the best validation checkpoint throughout the longer run.

## Only the requested comparisons

After training, use the validation-selected checkpoint with 16 sampled worlds + 2 virtual prior samples against equal-budget opponents, all using searched preparation and prep-lookahead:

1. New model + search versus frozen v5 + search, Draft: 750 unseen families, both seats and first pickers = 3,000 games.
2. New model + search versus strongest plain search, Draft: same 750 unseen families and 3,000 games.
3. New model + search versus strongest plain search, discard: 750 unseen families, both seats = 1,500 games. V5 has no discard-mode policy, so its fallback is exactly this opponent; do not waste a second identical tournament.

Evaluation seed 19,000,000, independent planning seed 101,000,000. Draws count one half. Reports include W/D/L and approximate 95% intervals clustered by physical deal. Read `draft-vs-v5.json`, `draft-vs-search.json`, `discard-vs-search.json`, then `summary.json`. No old-version sweep and no Rules AI tournament.

## Verified before the long run

- 23 Python tests pass, including new discard action separation, candidate permutation, UID/hidden-metadata invariance, old-model fallback, full-game evaluation, mixed-mode collection and family-disjoint splits.
- 17 JS headless tests pass, including observation/deck isolation and preparation afterstates.
- Complete small pipeline (12 families, brief training, all three tournament stages) finished successfully. This checks execution and output, not strength.
- Separate 30-family, 32-sample pilot finished: 50 games, 559 roots, 4,217 rows, 134,944 simulated outcomes in 13.5 seconds using 10 workers. Small pilots are insufficient for reliable full-run timing; discard and special-heavy hands vary substantially.
