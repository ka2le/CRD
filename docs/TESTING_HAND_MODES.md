# Secret Card and 20Cards

Released on 2026-11-08. Both are experimental menu choices behind Testing. Normal Draft and Discard keep their existing rules. They offer RolfBot and same-screen play, plus Felix in NC Secret Card Draft and Sven in 20Cards. Online rooms retain their normal setup.

## Secret Card

The toggle appears only with Testing enabled and Draft selected. Each player receives a separate private five-card opening pack and picks one. Once both choices are locked, the four unpicked cards from each pack enter the public discard pile together. All eight are visible in the pile and available to either player's Recycle, alongside later normal draft discards. The two selected secret cards never enter that pile. Both secret choices occupy the first hand slot and have a crossed-eye marker. The opponent's secret card stays face down through drafting and preparation, including when Opponent cards is on; stats and inspection context exclude that hidden card. Battle reveals it.

An update from the earlier Secret Card rules redeals an old secret game on reload because its opening leftovers were not retained. Other saved modes remain compatible.

Once both players have selected their secret card, the ordinary alternating draft resumes at pack two. Regular rules produce five cards per hand; Monsters still produces six, with six-card public packs after the private five-card opening choices. Same-screen play uses private handoffs for the opening choices, then its usual public table; only the active seat's secret is visible during public drafting.

**Felix** reuses the unchanged FelixNC checkpoint `e9b03e264b3e486fa93fb8f7a084a62b683540d405c7a57bcf8ce85d632958af`. The opening is exactly its normal actor-first five-card call. Subsequent picks keep its secret alongside all its public cards, omit the rival's secret, and pad that missing enemy feature slot with zeros to satisfy the frozen equal-length encoder. This deliberately optimistic transfer requires no retraining. The bot never reads the hidden identity or actual draw order when selecting a pick. Native preparation uses the same 12,000-node/depth-eight bound, seeing only the rival's public drafted cards and a draw distribution derived from the public deck recipe. Other rule sets, including six-card Monsters, do not offer this adapter.

## 20Cards

The third hand-building mode appears beside Draft and Discard only while Testing is enabled. Deal twenty distinct cards to each player from one shuffled deck. Each player arranges fifteen of their own cards in three ordered lanes of five. Cards can be dragged using mouse or touch; tapping a card followed by a slot also works. Moving between filled lanes swaps cards. Replacing a filled slot from the pool returns its old card to the pool. A card can also return to the unused pool.

All three lanes must be full and contain unique cards before Lock all three is enabled. Each player's lock is final. Neither specials nor any draws activate during lineup selection. After both players lock, their five unselected cards each enter one public discard pile together. Both players can inspect and Recycle all ten; future lanes remain reserved. RolfBot builds its lanes using only its own twenty cards. Same-screen players arrange and lock their lineups behind private handoffs.

**Sven** evaluates all 15,504 five-card combinations from its own twenty cards. A subset/complement search finds the best disjoint pair under the current hand evaluator: maximize the weaker of the two hands first, then their combined score. It selects the best remaining five-card hand as the third lane and randomly permutes the three lanes into rounds one through three. This searches combinations rather than shuffled-deck rollouts; it does not activate specials or peek at their future draws while building lanes. The worker receives only its own twenty-card pool. The ranking is a hand-strength heuristic, not a certified match-win probability.

Sven uses bounded Sven preparation search in each actual round. Its unknown pool comes from the public deck recipe after subtracting its own twenty cards, its own observed draws/discards, the shared public discard pile and previously revealed battle cards. It never reads the opponent's twenty-card pool, reserved lanes, private preparation or actual deck order to select an action. Only after choosing a legal activation does the official resolver draw from the real shared deck. Normal digital, tabletop and Monster pools are supported, always with five cards per 20Cards lane.

After both locks, prepare and battle lane one, then lane two, and lane three if neither player has won twice. Each lane begins with exactly its original five assigned cards and fresh preparation flags. The shared discard pile persists across all rounds. Cards discarded by either player during preparation, including redraws and sacrifices, enter that same pile; Recycle removes its chosen card from the pile for both players. Played battle hands do not automatically enter the discard pile. Preparation draws come from the shared undealt deck and consume it across rounds. Draws, transformations, discards and choices in one round cannot alter another reserved lane. Opponent hands stay hidden until that round's battle, regardless of the Opponent cards setting. Unplayed lanes are never revealed.

Older 20Cards saves redeal once on this update because their previous round discards were not retained. New saves preserve the shared pile, including Recycle removals, through refresh and round transitions. Other saved modes remain compatible.

Two wins end the match immediately. If neither player reaches two wins after the third battle, the match draws. A win each followed by a drawn third battle therefore draws the match, as does one win and two draws. The result overlay distinguishes a round result from the completed match and offers the next round or Play again as appropriate. Refresh preserves lineups, locks, preparation and match progress. Preparation replay and Test deck editing are unavailable in 20Cards.

Turning Testing off clears Secret Card and returns 20Cards to ordinary NC Draft. A custom Monster recipe must have at least forty cards for either variant; undersized recipes revert to the default pool.

## Battle resolution

Monsters, Secret Card and each 20Cards round use the normal animated resolution: count stats and attacks, apply faction abilities and shields, then compare scores before showing the result. Fast forward and Skip to result work as in ordinary Draft. The menu's Battle animation setting applies to all modes and is on by default. Switching it off completes the current count immediately; switching it back on preserves that completed result, and subsequent battles animate again. Even a hand emptied by preparation receives an animated zero count. The animation repair preserves existing saved games and lineups.

## Implementation and checks

- `src/game/twentyCards.js`: lineup validation, placement, locks, round hands, bot allocation and scoring.
- `src/game/draftMode.js`: private opening packs and transition to ordinary drafting.
- `src/hooks/useGameSession.js`: settings gates, persistence, locked preparation and round progression.
- `src/game/localMultiplayer.js` and `src/network/roomGame.js`: same-screen ownership, private handoffs and mirrored lane/results state.
- `src/components/board/TwentyCardsBoard.jsx`: responsive lineup board, touch/mouse drag and tap placement.
- `scripts/testing-modes-tests.mjs`: private packs, alternating continuation, locks, delayed special activation, reserved hands, deck consumption, round scoring and both same-screen variants.
- `src/game/felixNcSecretBot.js`, `src/game/svenTwentyCards.js`, `src/game/testingBotPreparation.js`: frozen-model Secret adapter, exhaustive disjoint-pair lineup search and private-information preparation.
- `scripts/testing-bots-tests.mjs`: original-model opening parity, all five adapted pick stages, hidden-information invariance, independent pair optimum, randomized lane order, menu normalization, worker payloads and mandatory preparation.
