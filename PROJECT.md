# Critters Robots Dragons

The default game uses Abilities and the Regular 69-card deck, including seven ordinary Robot Attacks. Existing player preferences remain available. Draft defaults to DanBot; Discard defaults to DavidBot.

Each Shield card supplies two shield points. Critter and Robot lose one power per enemy shield point after bonuses; Dragon is immune. Shield is Damage adds power equal to your own shield points, while those shields still block. Perfect Balance remains +3.

The reference-card layouts are retained and show -1 / -1 / 0. See docs/TABLETOP_MODE.md and docs/CARD_LIBRARY.md for the current rules.

The browser uses optimized local WebP artwork. Full-resolution originals and private workspace notes are excluded from this public snapshot.


## Testing modes release (2026-11-08)

Testing includes Monsters, Secret Card Draft and 20Cards. Monsters adds the fourth faction, six-card hands and editable deck recipes. Secret Card uses private opening choices; 20Cards locks three five-card lanes before round preparation and requires two wins to win the match. These modes support the opponents listed in their menus and same-screen play; normal games and rooms keep NC. See `docs/MONSTERS.md` and `docs/TESTING_HAND_MODES.md`.


## Offline update repair (2026-11-08)

Reload now loads a fully installed update while other game tabs stay open. Existing games retain their cached AI workers offline. The explicit `?update=1` link recovers an old cached menu without clearing the saved game. See `docs/LOCAL_PLAY.md`.


**2026-11-09 — 20Cards lineup controls:** Larger adaptive card layout, fixed pool positions with placed-card silhouettes, double-tap placement/return, tap or drag round handles to swap rows, and main action-bar Lock in. Normal mode logic, cards and bot models unchanged.


## Automatic app updates (2026-11-09)

Ordinary online opens and refreshes load a fully installed update automatically, without a special URL. An update arriving during active play shows a menu dot and Update game instead of interrupting the game. Older installations migrate once; saved deals and offline play are preserved. See `docs/LOCAL_PLAY.md`.


## Boss co-op (release verified 2026-11-12)

Testing offers Boss battle · Co-op with two human players, separate drafts, personal Pocket/Refresh/Swap/2-now powers and independent preparation. Boss options retain both draft presets, configurable absorption and team scoring, same-deal restart, prep replay and test navigation. Pocket and Swap remain available through preparation. Normal NC rules and bot models are unchanged. See `docs/BOSS_BATTLES.md`.
