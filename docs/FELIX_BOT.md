# FelixBot

Felix is a separate Draft opponent in the Opponent menu. Dan remains the default. Discard uses David; returning to Draft restores a selected Felix.

| Draft pick | Felix | Dan |
|---|---|---|
| 1 | Shared current-rule Sven winning-hand presence list | Same list |
| 2–4 | Numeric effects WDL network | Card-count WDL network |
| 5 | Analytic opponent-first prepared responses | Opponent-first responses with current empirical six-card shortcut |
| Actual preparation | Analytic two-order plans and private commitment | Two-order plans with current empirical six-card shortcut |

Felix has its own module, model and policy version so it can develop independently. Both neural policies retain the same 4/20 equal-size hand comparisons: minimize over opponent replies, then maximize the candidate's WDL value. Only picks2–4 call Felix's net.

`src/game/felixEffects.js` translates official card definitions into physical bundles of numeric stats, attacks, shields and semantic preparation operations. `felixHandEvaluator.js` evaluates those effects; learned inputs contain no card IDs, names or identity embeddings. Explicit current-engine semantics and numeric rule parameters supply derived combat features. Unsupported game pools use the named Dan fallback.

The current 123,684-parameter model was trained from a fresh seed on the 80,000-game current-rule Felix self-play corpus: 79,000 training families, 500 validation families and 500 prediction-test families. Picks 2–4 supply 237,000 actual equal-hand prefix pairs for training. Validation selected epoch 2, checkpoint `a4bed80abcb4a5b813c3d860355c8ff33814e8c066575e910648e70df1cf3760`, from study `crd-felix-current80k-train-sven500-20261028-v1`. Model adoption was creator-requested on 2026-10-28. The opening and preparation policies retain their existing behavior.

The first 500 fresh games against the production-budget Sven yielded 255 wins, 30 draws and 215 losses: 54.0% wins plus half draws, with a 95% whole-family bootstrap interval of 50.1–57.9%. This is an initial matchup estimate. The prior 40k model scored 49.9% on different deals, so that difference does not establish a paired training gain. The repeated prediction-test set is a diagnostic comparison.

Opening source: SimpleLLM `crd-sven-opening2000-v13-20261027-v1`. The estimator exactly follows the original Dan list: presence once per card type per original drafted five-card hand, before preparation, scored as `P(present | win) / P(present)`. Copy retains its drafted identity. Draws and losses remain visible in the data. This measures association with winning hands, rather than a causal card value. These games cannot also be fresh held-out evaluation of this opening.

The real game remains v13 with69 Regular cards, two shields per shield card, shield costs1/1/0 and one stat per base Robot card. The earlier shield3/baseRobot2 balance test was isolated and is not adopted.

Evidence and preserved before-state: SimpleLLM `runs/experiments/CRD Search/archive/crd-felix-native-adoption-20261027-v1`. Explicit historical Dan v6 retains `data/dan-opening.json`; the current bots share `data/draft-opening-priority.json`. Live preparation uses a cryptographic private coin when needed. Frozen tests use separately seeded streams.
