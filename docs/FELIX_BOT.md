# FelixBot

Felix is a Draft opponent in the Opponent menu. Dan remains the default; Discard uses David. Returning to Draft restores a selected Felix.

Felix240k uses its numeric effects WDL network for **all five draft picks**. Each legal card is evaluated against the possible opponent replies, choosing the maximum of the worst reply values. This retains the existing4/20 equal-hand comparison contract. Inputs describe public card effects rather than card IDs, names or hidden future cards. Actual preparation still uses the analytic two-order planner and private commitment, without Dan’s empirical six-card lookup. Unsupported pools retain the named Dan fallback.

The 123,684-parameter model was trained on237,000 games from a242,000-game dataset, with2,500 validation and2,500 prediction-test games. All five actual equal-hand prefixes were supervised by eventual WDL; validation selected epoch4. Checkpoint: `457c44a5a52de7cb85dd6f0317f9fa4fe4cb9faeb80bec3e999b97e03e15d326`. Adoption of this checkpoint on picks1–5 was explicitly requested on2026-11-01.

In3,000 paired head-to-head games against the previous Felix80k policy, this configuration scored51.67% counting draws as half (1457W/186D/1357L). The adjusted95% family interval was49.93–53.40%, so a strength advantage remains uncertain. Observed mean decision time including preparation was58.4ms per bot per game versus215.3ms, about3.7times faster; draft-only20.5vs179.1ms. These timings compare encountered states in one-worker head-to-head games with shared deterministic public preparation memoization, not identical decision inputs or browser transport performance.

Current game rules remain Abilities-main,69 Regular cards, two shields per shield card, shield costs1/1/0 and one stat per base Robot card. Adoption changes the Felix model and draft routing; it does not change rules, other bots or actual private preparation.
