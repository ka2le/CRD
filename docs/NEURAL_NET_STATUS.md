# Neural net testing: current state

Snapshot 2026-10-20. **V6 is collecting/training, not yet a measured stronger net.** Read `AI_FULL_GAME_V6.md` and `.ai-runs/full-game-v6/status.json`:18k fresh families across Draft and Discard,200,734 parameters/six hidden layers,one hour cosine-decay training, then only v5 and plain-search opponents. The complete tiny pipeline and23 Python/17 headless tests pass. Existing trained-network results below remain unchanged. Details are in `AI_DRAFT_EXPERIMENT.md` (v1), `AI_DRAFT_V2.md`, `AI_DRAFT_V3.md` (v3/v4) and `AI_PREP_V5.md` (v5).

## How the AI is built

The networks never play alone. Each decision is made by **search**: for every legal option the game is finished many times in sampled worlds (only information the deciding seat can actually see), and the option with the best average result wins. The network is a **prior**: its W/D/L prediction for each option counts as 2 extra "virtual" samples next to the 16 real ones per option. So "a better net" means "the search makes slightly better choices when its own samples are noisy".

All networks are small NumPy MLPs that predict win/draw/loss for one (position, option) pair, trained on the search's own evaluations (every simulated outcome counts) plus the real game result of the chosen option.

Completed trained models: **Draft mode only, digital 21/50 rules.** V6 expands the pipeline to draft picks, discard passes and every preparation decision in both modes. No completed discard-mode network or tabletop model exists yet.

## Versions

| Version | Network | Decisions it scores | Training data | Teacher (how options were scored) |
|---|---|---|---|---|
| v1 | 64 hidden units | draft picks | 80 deals | Rules AI finishes the game |
| v2 shallow | 98,842 params (220→256→160→3) | draft picks | 4,000 deals, 11.5M simulated outcomes | Rules AI finishes the game |
| v2 deep | 149,650 params (220→280→192→128→64→3) | draft picks | same | same |
| v3 | v2 deep, training continued | draft picks | +8,000 deals (12,000 total) | same; real games partly played by v2 |
| v4 | v3, continued 20 more min | draft picks | same | same |
| **v5 (current best)** | **183,250 params (388→256→192→128→64→3)** | **draft picks + every pre-battle step** | 6,000 new deals, 26.6M outcomes | Rules AI for hand building, but each pre-battle step tries every option ("prep-lookahead") |

## Results

All tournaments: fresh deals never used in training, both seats and both first pickers per deal, equal search budgets. "vs plain search" = 2,000 games against search without any network and with Rules AI pre-battle play; 50% = equal. Intervals are 95%.

| Player | vs plain search | vs Rules AI (Easy) |
|---|---|---|
| Plain search (playing itself) | 50.7% | 79.9% |
| v2 shallow (100k) | 53.1% | 80.7% |
| v2 deep (150k) | 53.5% | 80.6% |
| v3 | 53.8% | 80.7% |
| v4 checkpoints (epochs 20–176) | 53.4–53.6% | – |
| Search + pre-battle search, no net | 53.3% | – |
| Search + pre-battle search + prep-lookahead, no net | 56.1% | – |
| **v5 net + that search** | **58.6%** | **86.1%** |

Head-to-head:

- v3 vs v2 deep: 50.3%, no difference.
- v3 vs v2 shallow: 50.5%, no difference.
- v5 + search vs the same search without the net: 51.7% (49.8–53.6). Measured deal by deal against plain search instead, the net adds +2.5 pts (+1.3 to +3.7).
- v5 + search vs v3 with its old search: 58.2% (56.1–60.4).

## What we have learned

1. **Search does most of the work.** Each network on its own adds about +2.5 to +3 points on top of the search it is paired with. The biggest jump came from changing *what is searched*: searching pre-battle decisions gave +2.6 points, and scoring draft picks with better pre-battle play inside the rollouts gave another +2.8.
2. **Bigger networks and longer training did not help.** 100k vs 150k parameters, extra data and two rounds of continued training all landed within noise of each other. Validation loss is best after about 4–8 epochs and then gets worse (the net memorises the training games), while play strength stays flat.
3. **Label quality matters more than network size.** v5 leads v3 by +4.9 points. About half of that (+2.3) is the new search alone; the rest comes from the net, which was trained with a teacher that plays the pre-battle phase well. The old teacher undervalued Copy, Recycle and Draw cards during the draft. Going from 150k to 183k parameters was not what mattered.
4. **Pre-battle play is close to exactly solvable.** In draft both hands are open, so most pre-battle choices have a near-certain outcome. The Rules AI gives away a winning position in about 7% of non-trivial pre-battle decisions.
5. **The networks are cheap to run.** About 0.16 ms per 5-option batch in NumPy, so cost is not what keeps them out of the browser.

## In the game today

- **Search AI (Medium)** in the browser now uses the best **non-neural** setup: it searches draft picks, discard passes and every pre-battle step, with prep-lookahead rollouts (`OPPONENT_SELECTION.md`).
  - Draft: 89.3% vs Rules AI (was 86.0%), and 58.5% head-to-head against the previous Search AI.
  - Discard mode: about unchanged (68.5% vs 67.0%; 50.8% head-to-head).
- **Rules AI (Easy)** is unchanged.
- No network is wired into the browser yet.

## Open questions / next steps

- **Put v5 in the browser** as a "Hard" option. Each network evaluation is cheap in JS, but the 388 input features (including the after-move combat profile) have to be built in JS, and that needs a parity test against Python.
- **Better teacher next round.** Score options with rollouts that use the v5 net or search for hand building, not the Rules AI. This is the most promising next gain.
- **Regularisation or more distinct deals.** Overfitting starts within about 8 epochs at every size tried.
- **Coverage.**
  - Five-hand discard mode: search only, no net trained.
  - Tabletop scoring: not trained.
  - The opponent model inside rollouts is still the Rules AI.

## Where things are

- Code: `python/` (collection, training, evaluation, `tests/`), `src/game/rolloutSearch.js`, `src/game/preparationFeatures.js`, browser search in `src/game/searchAi.js`.
- Data, checkpoints and reports: `.ai-runs/draft-v1` … `draft-v5`, `.ai-runs/eval-final`, `.ai-runs/draft-v5-eval` (each has `summary.json` or `comparison.json`).
- Best network: `.ai-runs/draft-v5/model/best.npz` (SHA-256 `27eac3ab…71b80`).
