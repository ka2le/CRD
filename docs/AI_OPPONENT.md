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

Strategy hooks and seeded decks support experiments. The Python smoke chooses random human-side actions against these heuristics; it does not train. Headless play currently skips preparation; see `AI_TRAINING.md`.

Preparation is private with no inter-player turn order; the AI must finish before combat. This is now enforced at Battle. The creator requested pile handling remain unchanged. Then improve whole-hand evaluation and interaction coverage before adding difficulty tiers/training.
