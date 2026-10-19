# UI and animation design

Added 2026-10-18 with the table redesign. Rules logic is unchanged. This file describes how the player-facing table is laid out and animated.

## Principles

- The cards carry the information. The UI adds only what the cards can't show: whose turn it is, totals, health, timing and progress.
- Use symbols, colour, position and motion before labels. Primary actions may use one word; the rest is icons.
- Teaching is opt-in: long-press or right-click any card to inspect it, and Menu → How to play opens a visual timing sheet.
- Mobile portrait comes first, and every layout fits the screen with no page scroll.

## Visual language

- Class colours come from the card icons: Critter `--critter` (green), Robot `--robot` (cyan), Dragon `--dragon` (ember). Shield is light blue, preparation specials violet, damage red.
- Side colours: you are gold (`--player`), the opponent is rose (`--opponent`). Each HUD rail has a side-coloured tab, and the side that is acting glows.
- Every card frame is tinted by its class, with a gradient for multi-class cards (`getCardAccents` in `card/cardMeta.js`).
- Icons are the card art's silhouette PNGs, used as CSS masks (`ui/GameIcon.jsx`) so they can be tinted. The extra UI glyphs (menu, swords, skip and so on) are inline SVG.
- Printed card icons scale with the card through container query units (`cqw`), like ink on a physical card.

## Table layout (`App.jsx`, `App.css`)

The table is a 5-row grid: opponent rail, opponent hand, centre, your hand, your rail (the dock). Which centre is used depends on the phase:

| Layout | When | Centre | Hands |
| --- | --- | --- | --- |
| `draft` | Draft picking | `PackArea` fit grid (3+2 on phones, 1×5 on wide screens) | Both hands are rows with empty slots that show the picks left |
| `focus` | 5 Hand Discard passes, and preparation in both modes | Your hand as a large fit grid | Opponent hand is a row |
| `battle` | Battle | `BattleArena` strip | Both hands are fit grids that share the space equally |

Card size is computed, not set by breakpoints (`hooks/useFitLayout.js`):

- `computeGridFit` picks the column count that gives the largest card for N cards in a box; on a tie it prefers more columns.
- `computeRowFit` sizes a row for 5 slots and overlaps extra cards like a held hand. All card icons sit on the left edge, so they stay visible when cards overlap.

## HUD

- **Rails** (`hud/SideRail.jsx`): stat totals (class icon + count, dimmed at 0) and average damage per round. In battle the average is replaced by a 21-segment health bar, a shield badge, hit numbers and blocked numbers.
- **Opponent rail:** a thinking indicator while the AI picks, progress pips (5 packs or 2 redraws), and the menu.
- **Dock:** the deck pile, the discard pile (tap to browse it in a sheet), and the primary action: Redraw N / Keep, or Battle.
- **Pack:** the card the AI is about to take gets a rose reticle once the deal has landed. On desktop, hovering a pack card shows the change in your average damage per round.

## Animations

- **Shuffle** (`board/ShuffleIntro.jsx`): a riffle in the centre at each new game, after which the deck settles into its pile. Timing lives in `hooks/dealTiming.js`, and game flow waits for it (the AI's first pick is delayed until the deal has landed).
- **Deal:** cards enter from the deck pile face down and flip face up, staggered (`enterFrom` on `CardButton`, using WAAPI).
- **Zone changes** (for example the hand moving from the dock to the centre, or into battle): cards FLIP from their last on-screen rect (`card/cardRects.js`).
- **Flights** (`animation/CardMotionContext.jsx`): picks and discards arc, scale to the destination card size, and can flip. Draft masks and suppression keep their earlier behaviour.
- **Discard mode:** marked cards tilt and tint red. On submit they fly to the pile, and replacements deal in from the deck.
- **Battle:** each action card's hourglasses fill as rounds pass and fire when full. The firing card lunges and shows its burst value, a class-coloured damage orb flies to the enemy health bar, and the segments flash before draining. A lane strip shows which classes fire this round. Fast-forward (2.5×) and skip are available. At the end the defeated hand greys out and a result banner appears (the eye button dismisses it so you can look at the board).

`--impact-ms` (derived from the round interval) keeps the orbs, health drain and hit numbers in sync at any speed.
