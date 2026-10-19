# Larger draft evaluator and search self-play

2026-10-19 follow-up to `AI_DRAFT_EXPERIMENT.md`. The creator requested substantially more data, about 100k parameters, and measuring whether the network helps search against base search. Preparation remains the existing heuristic; digital combat/rules/browser behavior stay unchanged.

## Future packs are unknown

The real match deck is shuffled with an episode seed. Search does not receive that seed or deck. `sampleHeadlessWorld(observation, spec, planningOptions)` receives only the seat's permitted observation, the sorted public physical-card catalog and an independent planning seed. It excludes exposed cards and samples a hypothetical unseen order without replacement. Every candidate is tested against the same hypothetical orders for a paired comparison, then results are averaged over independently sampled worlds. Future simulated picks see packs only as they become visible in their simulated game.

Reusing a planning seed reproduces a calculation; it does not recreate the real match shuffle. Different real deals use different actual episode seeds. Current draft picks/previously exposed packs legitimately constrain which cards can appear later. This is Monte Carlo expectation, not prediction of the actual next pack. A regression reverses the actual future deck and changes its private seed while preserving the public draft position, and requires **identical** search results. It also verifies different planning seeds produce different hypothetical next packs. Earlier host forks preserve actual hidden decks and remain unsuitable for fair search.

## Every evaluation contributes

`python/collect_draft.py` stores **one row per candidate evaluation**, including alternatives that were not chosen. Each row contains a 220-number public-information vector, W/D/L counts over the sampled continuations, its root group/family, and an optional one-hot actual searched-game result if that candidate was chosen. Metadata/group IDs never enter the network. Rows are stored in compressed numeric NPZ shards; no need to repeat the full observation JSON for every candidate.

Each individual simulated combat evaluation contributes once to the W/D/L counts. Training cross-entropy against counts gives exactly the same loss/gradient as expanding every count into a separate one-hot example with repeated identical inputs. This equivalence has a regression test. Counts compress repeated inputs; they do not discard simulations or make those simulations independent games.

Actual drafting uses the frozen base rollout search for both seats, with 12% exploratory picks on one seat and the other seat always using base search. Both opening pickers are covered; the exploring physical seat alternates by deal. Both seats' evaluations are saved. Default collection uses 32 samples/candidate and mixes 75% Wild / 25% Normal decks. Preparation is always heuristic. Complete shards are atomically written and reusable after interruption; mismatched settings are rejected.

Important distinction: each base search still completes its sampled worlds with the existing **heuristic** draft/preparation policy. It does not recursively invoke search at every simulated decision. Real played games now use search against search, and their actual results supply additional supervision for chosen actions. This learns from both the affordable all-candidate completion teacher and actual stronger-policy play; it is not a claim that every counterfactual label is a fully search-versus-search value.

## Architecture and training objective

`python/crd/value_net.py`: **220 → 256 → 160 → 3**, tanh hidden layers, softmax W/D/L output. A fitted regularized linear logit prior is added before softmax; neural output starts at zero. Total fitted parameters: **98,842**, including the linear prior. Inputs extend v1's 187 features with 27 public unseen-card counts and six own/opponent class stats. Public unseen counts come from total pool minus exposed cards, not from inspecting the real remaining deck.

This gives the model contextual inputs for Draw 2, copy/recycle/redraw, incomplete class combinations, opponent counters and remaining opportunities. Targets are match outcomes after real effects, rather than immediate damage deltas. It can value a currently inactive card for its sampled future potential. It does not yet receive a separately calculated post-pick combat profile or exact history posterior; definition counts/context must capture those relationships.

The objective is W/D/L cross-entropy. Each candidate has its sampled W/D/L counts; the chosen candidate additionally gets its actual searched-game one-hot outcome with fixed weight 8. This extra weight is an optimization choice, not eight independent games. Adam trains float32 weights; a cosine learning-rate schedule decays over a requested wall-clock window. All epochs run within that budget even if validation worsens; both the last checkpoint and best validation checkpoint are saved. Train-only normalization/prior fitting and family-disjoint train/validation/test apply before expansion. All numeric rows are retained, including repeated states with new independent planning samples. No test-based stopping or tournament tuning.

Creator follow-up: first finish/evaluate the two-hidden-layer model, then try four hidden layers at about 150k parameters **if the first model does not clearly improve search**. The configurable implementation supports `--hidden 280,192,128,64`, giving **149,650** fitted parameters on the same inputs. Both shallow/deep checkpoint formats load through the same evaluation API; tests cover parameter count, learning and roundtrip. Keep the same corpus, family split, objective and predeclared search prior when comparing depth. A later architectural decision informed by a tournament requires fresh confirmation deals before claiming promotion strength.

Win/draw/loss probabilities preserve information about outcome variability. Decision utility remains `P(win) - P(loss)`, equivalent to maximizing wins plus half draws. The model should prefer risk when it increases expected match score given both hands and future uncertainty, and security when that does better. No arbitrary risk penalty or bonus is added.

## How the net helps search

`python/evaluate_search.py` compares a frozen base-search opponent against: unchanged base search, search with the fitted linear prior, and search with the neural prior. Neural/linear variants use a predeclared **two virtual outcomes** per candidate:

```text
score = (sample_count * sampled_value + 2 * predicted_value) / (sample_count + 2)
```

This smooths noisy finite-sample estimates and breaks estimated ties using contextual learned value. It is a root-ranking prior, not yet a neural cutoff evaluator/deep tree. Candidate/opponent budgets are configurable separately. The primary comparison uses the same number of real simulations per candidate. No aggressive candidate pruning is introduced for rare specials.

Evaluation uses fresh deals, both physical seats and both first pickers. Planning seeds are assigned by public experiment game/turn indices on a separate stream and do not shift when private preparation lengths change. Identical game/turn streams pair variants; each action still gets its proper sampled consequences. Model dataset families are excluded. `python/compare_search.py` reports paired deal-level score differences and approximate 95% intervals. Heuristic opponents are secondary diagnostics; strength against frozen search is the criterion for neural usefulness.

## Commands and artifacts

All artifacts stay in ignored `.ai-runs/draft-v2/`. Existing NumPy environment is sufficient. The OpenBLAS setting avoids oversubscribing the CPU when several simulator processes run.

```powershell
$env:OPENBLAS_NUM_THREADS='1'
.ai-venv/Scripts/python.exe python/collect_draft.py .ai-runs/draft-v2/data --deals 4000 --workers 4 --chunk 20 --samples 32
.ai-venv/Scripts/python.exe python/train_value.py .ai-runs/draft-v2/data .ai-runs/draft-v2/model --epochs 1000 --seconds 600
.ai-venv/Scripts/python.exe python/evaluate_search.py .ai-runs/draft-v2/model/best.npz .ai-runs/draft-v2/base.json --policy base --deals 500
.ai-venv/Scripts/python.exe python/evaluate_search.py .ai-runs/draft-v2/model/best.npz .ai-runs/draft-v2/neural.json --policy neural --deals 500
.ai-venv/Scripts/python.exe python/evaluate_search.py .ai-runs/draft-v2/model/best.npz .ai-runs/draft-v2/linear.json --policy linear --deals 500
.ai-venv/Scripts/python.exe python/compare_search.py .ai-runs/draft-v2/base.json .ai-runs/draft-v2/neural.json --output .ai-runs/draft-v2/comparison.json

# Four-hidden-layer comparison and fresh confirmation deals:
.ai-venv/Scripts/python.exe python/train_value.py .ai-runs/draft-v2/data .ai-runs/draft-v2/deep-model --epochs 1000 --seconds 600 --hidden 280,192,128,64
.ai-venv/Scripts/python.exe python/evaluate_search.py .ai-runs/draft-v2/model/best.npz .ai-runs/draft-v2/confirm-base.json --policy base --deals 500 --seed 9000000 --planning-seed 51000000
.ai-venv/Scripts/python.exe python/evaluate_search.py .ai-runs/draft-v2/model/best.npz .ai-runs/draft-v2/confirm-shallow.json --policy neural --deals 500 --seed 9000000 --planning-seed 51000000
.ai-venv/Scripts/python.exe python/evaluate_search.py .ai-runs/draft-v2/deep-model/best.npz .ai-runs/draft-v2/confirm-deep.json --policy neural --deals 500 --seed 9000000 --planning-seed 51000000
.ai-venv/Scripts/python.exe python/compare_search.py .ai-runs/draft-v2/confirm-base.json .ai-runs/draft-v2/confirm-deep.json --output .ai-runs/draft-v2/confirm-deep-vs-base.json
.ai-venv/Scripts/python.exe python/compare_search.py .ai-runs/draft-v2/confirm-shallow.json .ai-runs/draft-v2/confirm-deep.json --output .ai-runs/draft-v2/confirm-deep-vs-shallow.json
```

Intended full corpus: 4,000 deal families / 8,000 played games / 80,000 root decisions / 360,000 candidate rows / 11,520,000 exact simulated outcomes, plus 80,000 actual searched-game decision/outcome associations. These associations are correlated within games/families. This is 50× v1 deal families, 25× its candidate rows and 100× its simulated completions. The first 40-deal probe checks implementation only; it is excluded from the full corpus and strength conclusions.

## Completed shallow run and first tournament

Collection finished in **768.2 seconds**. Integrity audit confirmed 4,000 families /80,000 roots /360,000 finite candidate vectors /11.52m outcomes, exactly one actual-return association per root and correct relative WDL signs per game. There are **8,558 Draw 2 rows**. Source actual-return associations: 38,605 wins, 2,790 draws, 38,605 losses (correlated across the ten decisions in each game).

Family-disjoint splits: 3,241 training /364 validation /395 test families; 291,690 /32,760 /35,550 candidate rows. The two-hidden-layer run trained **163 epochs in 602.4 seconds**, retaining **epoch 23** by validation mixed cross-entropy. Later passes overfit; best and last weights are both preserved. The frozen tournament copy hashes identically to the final best checkpoint.

On the dataset's test families:

| Metric | Fitted linear prior | Two-hidden-layer net |
| --- | --- | --- |
| Teacher value MSE | 0.1873 | 0.1216 |
| Agreement with any highest-valued teacher pick | 61.30% | 72.23% |
| Mean regret against teacher's best pick | 0.1379 | 0.0662 |
| Actual searched-game outcome cross-entropy | 0.8048 | 0.7603 |
| Draw 2 value MSE (873 rows) | 0.1603 | 0.1133 |

Draw 2 error falls about29%; this is contextual outcome prediction against the declared teacher, not a claim of optimal card valuation.

First frozen-policy tournament: seeds8000000–8000499, independent planning stream41000000; **500 new physical deals /2,000 games per policy**, both seats/opening pickers, Wild Deck. Every arm uses16 samples per candidate and1.44m exact completions against the unchanged16-sample base-search opponent. Neural/linear priors each use the predeclared two virtual outcomes.

| Candidate | W / D / L | Score |
| --- | --- | --- |
| Base search | 972 /63 /965 | 50.175% |
| Search + linear prior | 1004 /67 /929 | 51.875% |
| Search + two-hidden-layer net | 1016 /60 /924 | 52.300% |

Paired deal-level score improvement: neural versus base **+2.125pp**, approximate95% interval **+1.012 to +3.238pp**. Linear versus base **+1.700pp**, interval **+0.490 to +2.910pp**. Neural versus linear **+0.425pp**, interval **-0.566 to +1.416pp**. Learned priors help search in this experiment; the neural component's extra strength over the cheaper linear prior is not established yet.

Because the gain is modest and the extra neural benefit is inconclusive, proceeded with the creator's four-hidden-layer comparison, using the same corpus/objective and another600-second window. Architecture **220→280→192→128→64→3**,149,650 parameters. A fresh confirmation tournament uses seeds9000000–9000499 /planning51000000 for base, shallow and deep arms. The fixed prior is not tuned on either tournament.

## Fresh confirmation: both depths against base search

Each arm plays2,000 games across the same500 new deals, crossed seats/first pickers, again using16 samples/candidate and1.44m completions per arm.

| Candidate | W / D / L | Score |
| --- | --- | --- |
| Base search | 982 /62 /956 | 50.650% |
| Search + two-hidden-layer net | 1034 /54 /912 | 53.050% |
| Search + four-hidden-layer net | 1040 /60 /900 | 53.500% |

Paired improvement versus the base reference: shallow **+2.400pp** (approx95% **+1.297 to +3.503pp**); deep **+2.850pp** (**+1.871 to +3.829pp**). Deep versus shallow is **+0.450pp**, interval **-0.376 to +1.276pp**. Both fixed neural policies help this base search on the tested Wild Deck configuration; additional depth is not established as better. This is not proof of optimal drafting, strength against every opponent/budget or superior depth across retraining seeds.

Both frozen test copies hash-identically match the final validation-selected checkpoints. The deep run completed **111 epochs in601.8 seconds**, retaining **epoch7**; the shallow run completed163 epochs in602.4 seconds, retaining epoch23. The remaining later passes primarily overfit. Neither test set was used to tune prior strength or choose epochs.

Deep versus shallow on the same held-out dataset families: teacher value MSE **0.1144 /0.1216**; actual searched-game outcome cross-entropy **0.7464 /0.7603**; Draw 2 value MSE **0.0936 /0.1133**. The fitted linear prior's Draw 2 MSE is0.1603: approximately42% reduction for deep,29% for shallow. Deep's teacher best-pick agreement is71.81%, versus72.23% for shallow; lower value error does not automatically imply stronger move ranking. Keep both checkpoints; the deeper model is a promising challenger, with no established playing-strength advantage over the smaller one yet.

Controlled numeric-inference microbenchmark (single NumPy/BLAS thread, warmed batch of5 candidate vectors, excludes feature construction/IPC/search): median0.110ms for shallow,0.156ms for deep; p950.208/0.292ms. Linear coefficients/normalization match exactly between the models. Parallel full-tournament latencies depend on CPU contention and should not be interpreted as controlled model-speed comparisons. No mobile/browser inference test or promotion yet; no rules/publishing changes.

Verification:15 JS headless tests,16 Python tests, lint, production build, original regression smoke and whitespace check pass. Focused tests cover actual-future deck/seed independence, public features, per-evaluation/count loss equivalence, outcome perspective/accounting, dataset split boundaries, resumed shards, checkpoint formats and both-depth nonlinear learning. Full collection, both long training runs and six2,000-game tournament arms completed. The 40-deal probe is excluded from these strength claims. Large model files/datasets/replays are local ignored artifacts; source/commands/results documentation persist in the workspace.

Next experiments should improve teacher calibration against actual searched opponents and increase independent deal coverage/initialization replication, or integrate a learned cutoff to save simulations. Do not equate additional training epochs or layers with stronger play. Test Normal Deck opponents and browser inference separately before broad deployment claims.
