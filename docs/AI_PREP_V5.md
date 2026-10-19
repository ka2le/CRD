# v5: searching and learning pre-battle preparation

Creator request (2026-10-19): let the AI decide preparation itself (which special to activate next, copy/recycle targets, skip, finish; re-decided after every activation, e.g. Draw 2 pulls a Recycle, then recycle before copying) and train a new ~180k network on draft + preparation decisions. Earlier models (v1–v4) searched draft picks only; preparation was always the Rules AI heuristic.

## What changed

- **Preparation search.** Every preparation decision with more than one legal option is a searched root (`evaluate` already supported preparation observations; collection/evaluation now use it). Order is chosen implicitly: each step picks one action, the state updates, the next step is searched again.
- **`prep-lookahead` completion policy** (`src/game/rolloutSearch.js`, `choosePrepLookaheadAction`). Inside each sampled world, rollouts play hand building with the heuristic but try every legal preparation option (heuristic continuation) and keep the best for the acting seat. It is perfect-information *within the sample* (sampled deck order, sampled enemy preparation) — standard for sampled-world search, never used as a live decision policy. Cost ≈ +40% per search; changes the chosen draft pick in ~20% of decisions because prep cards are no longer valued as if the heuristic would misplay them.
- **Afterstate features** (`src/game/preparationFeatures.js`, worker command `preparation-features`). Stateless, from the acting seat's observation only: hand after the action (copy/recycle resolved, draws left unresolved with a pending count), its combat profile, remaining unused specials, own recycle pile.
- **v3 feature layout** `draft-prep-afterstate-wdl-v3` (388 inputs): the unchanged 220 draft features plus a 168-wide preparation block (flag, action type, source, target, afterstate hand/combat/remaining/pile, pending draws, deck count). Draft rows have a zero block, so old draft-only shards can be zero-padded (`load_shards` does this and records `mixed_teachers`).
- **Network** 388→256→192→128→64→3 W/D/L + linear prior = **183,250 parameters**.
- Tooling: `collect_draft.py --prep-search --completion prep-lookahead --only-offsets a:b`; `evaluate_search.py --prep-policy search --completion prep-lookahead --opponent-prep-policy/--opponent-completion --deal-range a:b`; `merge_eval.py`; `train_value.py --weight-decay`; `compare_search.py` refuses to pair different opponent preparation/completion settings.

## Data and training

`.ai-runs/draft-v5/data`: 6,000 new deals (seeds 3000000–3005999), 12,000 games, 151,037 searched roots (31,037 preparation), 831,136 candidate rows (291,136 preparation), 26.6M simulated outcomes, 32 samples/candidate, both seats searched, 12% exploration on one seat, no neural policy in actual play. Offsets 0–3180 ran in the cloud workspace, 3200–5980 on the creator's computer; shard 5980 recomputed on both was bit-identical. Only the new data (one consistent teacher) was used; v2/v3 draft data used the weaker heuristic-completion teacher.

Training from scratch, lr 0.0003, weight decay 1e-4, 900 s cap: best validation epoch 7 of 165, then overfitting (same pattern as v3/v4). A first lr 0.0006 attempt was stopped early (best epoch 4, slightly worse; kept in `model-lr6e-4-stopped`). Test split: teacher top-choice 74.6% overall, **86.2% on preparation decisions** (linear prior 79.2%), preparation regret 0.041.

## Strength (16 samples per candidate, prior 2, both seats/starters, fresh deals)

Against plain search (base search, heuristic preparation; 500 deals / 2,000 games, seed 9000000, paired with `draft-v2/confirm-*`):

| Candidate | Score | Gain vs plain (paired 95%) |
|---|---|---|
| Plain search (self-play reference) | 50.65% | — |
| v3 150k net, old search | 53.75% | +3.10 |
| Search + preparation search | 53.25% | +2.60 [+1.70, +3.50] |
| + prep-lookahead completion (new search, no net) | 56.07% | +5.42 [+3.36, +7.49] |
| **New 183k net + new search** | **58.60%** | **+7.95 [+5.81, +10.09]** |

Paired: net on top of the new search +2.53pp [+1.34, +3.71]; new net+search vs v3 setup +4.85pp [+2.84, +6.86].

Head-to-head:
- New net+search vs the same search without the net (both with preparation search + lookahead), 500 deals: 1007/54/939 = **51.7%** [49.8, 53.6] — positive but within noise at 2,000 games.
- New net+search vs v3 150k net with its old search, 500 deals (seed 12000000): 1143/43/814 = **58.2%** [56.1, 60.4].
- Against the Rules AI heuristic, 1,000 deals (seed 13000000): 3416/53/531 = **86.1%** (v3 80.7%, plain search 79.9%; paired +5.3pp vs v3).

Latency (single-threaded worker, Python IPC included): plain search median 21 ms / p95 33 ms per searched decision; new search median 34 ms / p95 ~145 ms (early draft picks are slowest). About 13 searched decisions per side per game.

## Notes

- The biggest single gain is preparation itself: the heuristic forgoes a sure win in ~7% of non-trivial preparation decisions (wrong recycle target, activating Draw-all when skipping wins).
- Browser Search AI still uses heuristic preparation and the old completion; porting preparation search + `prep-lookahead` to the Web Worker is the obvious next step. The network is not wired into the browser.
- Results: `.ai-runs/draft-v5-eval/` (`summary.json`).
