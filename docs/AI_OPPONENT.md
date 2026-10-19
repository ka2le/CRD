# AI opponent

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

The creator requested search guided by calculated mechanics and a small learned correction. The decision environment/Gymnasium first slice is complete; keep this heuristic as a named baseline/completion policy. Next build observation-consistent hidden-world sampling and non-neural rollout search, then fit a residual evaluator on searched continuations and match outcomes. Terminal combat remains exact. The model should estimate unfinished-hand potential, draws, preparation and opponent adaptation; card value is contextual. No trained evaluator or search opponent has been added yet.
