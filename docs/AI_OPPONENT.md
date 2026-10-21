# AI opponent

Newest (2026-10-19 evening): preparation search + 183k draft/preparation network, 58.6% vs plain search and 86.1% vs this heuristic; see `AI_PREP_V5.md`. Earlier offline experiment (2026-10-19): draft-only rollout scores 79.25% against this heuristic on 100 unseen deals / 400 games; a first trained NumPy network and experimental search correction also run. See `AI_DRAFT_EXPERIMENT.md`. Preparation remains this existing policy. Browser opponent remains heuristic; neural gains are not established.

Reviewed 2026-10-18. Both browser modes use a hand-written heuristic AI. No trained model or difficulty selection exists.

## Implemented choices

- Draft: choose the highest-scoring available card for own hand.
- Discard: normally target two replacements per pass, favor a class plan, and preserve sufficiently strong estimated attacks.
- Copy/recycle: choose a high-scoring eligible target.
- Other supported preparation: complete available cards and acquired-special chains at Battle using `completeOpponentPreBattle`; no intermediate AI preparation is revealed.

Combat is automatic, so there are no combat-time AI decisions.

## Evaluation

`cardEvaluator.js` estimates average damage using shared stat/attack functions. It rewards damage improvements, matching class plans, double stats and selected copy/recycle utility. It penalizes off-plan combinations, empty attacks, shield-only choices and shield-based damage without shield.

This baseline does not evaluate the opposing hand for counterpicks, fully simulate combat races, model whole-hand doubling in its average estimator, or accurately represent every shield timing interaction. Offensive bias and limited draw utility are heuristic choices, not balance conclusions.

## Integration

Strategy hooks and seeded decks support experiments. Headless now exposes every drafting/discard/preparation choice for either seat, with this heuristic as the optional non-controlled policy. Browser and headless preparation share explicit actions/transitions. The Python Gymnasium wrapper has numeric features, dynamic candidates/masks and outcome rewards; random smokes do not train. See `AI_ENVIRONMENT.md` for the working interface and `AI_TRAINING.md` for the remaining plan.

Preparation is private with no inter-player turn order; the AI must finish before combat. This is now enforced at Battle. The creator requested pile handling remain unchanged. Then improve whole-hand evaluation and interaction coverage before adding difficulty tiers/training.

## Proposed next architecture - 2026-10-19

The environment and initial observation-conditioned root-rollout teacher now work. Python can compare every legal action using sampled continuations with this heuristic as a completion policy; browser play still uses the original heuristic. `AI_SEARCH.md` explains feasible-belief assumptions, paired uncertainty, baseline deltas and grouped labels. Next expand data/held-out evaluation and fit the residual model; no trained evaluator/browser search opponent exists yet. Final combat remains exact, and learned card value should remain contextual.

## Browser opponent selection (2026-10-19)

2026-10-21: the options are now **RolfBot (Easy)** (Rules AI), **IngaBot (Medium)** (shallow search) and **SvenBot (Hard)** (Search AI); see `OPPONENT_SELECTION.md`. Historical note: the menu had an Opponent dropdown: **Rules AI (Easy)**, the heuristic above, and **Search AI (Medium)**, a browser root-rollout search for draft picks and discard passes run in a Web Worker. Preparation stays on the Rules AI. In cloud benchmarks it scored about 86% (draft) and 66% (discard) against the Rules AI. See `OPPONENT_SELECTION.md`. The neural model is not wired in yet.
