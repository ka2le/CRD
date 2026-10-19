# UI and animation design

2026-10-19 addition: Menu → **Tabletop battle** is a persisted toggle for either Draft or Discard. Cards show the mode's power and no hourglasses. Rails show base power before battle; help and inspect explain the current rules. After preparation, eligible cards highlight when a main damage type needs commitment; a multi-class card offers its eligible types. Tabletop battle immediately shows both **base − shields + bonus = broken hearts** formulas in the result and central strip, without HP, timing lanes or playback controls. Zero shield/bonus terms disappear; bonus uses broken hearts instead of a star, and an unmodified score displays just its final damage. See `TABLETOP_MODE.md` for rules and approved special conversions.

Added 2026-10-18 with the table redesign. Rules logic is unchanged. This file describes how the player-facing table is laid out and animated.

## Principles

- The cards carry the information. The UI adds only what the cards can't show: whose turn it is, totals, health, timing and progress.
- Use symbols, colour, position and motion before labels. Primary actions may use one word; the rest is icons.
- Teaching is opt-in: long-press or right-click any card to inspect it, and Menu → How to play opens a visual timing sheet.
- Mobile portrait comes first, and every layout fits the screen with no page scroll.

## Installed app

- The web app manifest requests `fullscreen` display for installed PWA launches. Browsers that do not support that display mode may fall back to their closest supported app window mode.

## Visual language

- Style follows the app icon: "classy poker meets minimalist sci-fi meets fantasy battle". Midnight navy felt with a faint brass hex weave (`--hex`), champagne/brass ink (`--brass`), muted jewel tones, flat colour and real drop shadows instead of glows/bloom.
- Type: Cinzel (`--display`) for titles, result banner and primary buttons; Manrope (`--font`) for UI; DM Mono (`--mono`) for numbers.
- Class colours are muted jewel tones: Critter `--critter` (sage), Robot `--robot` (steel blue), Dragon `--dragon` (copper), each with a `-deep` variant matching the icon's card backs. Shield is pale blue, preparation specials lilac, damage oxblood red.
- Side colours: you are brass (`--player`), the opponent is dusty rose (`--opponent`). Each HUD rail has a thin side-coloured tab, and the acting side's rail gets a tinted edge (no glow).
- Cards are nearly square-cornered (`--card-round`, 3.5% of width) and borderless. A flat ring just outside the card (`.card__frame`) appears only for states: selected/focus (brass), discard (red), firing (class colour, gradient for multi-class via `getCardAccents` in `card/cardMeta.js`), targetable/ready (pulsing), AI-eyed (rose).
- Damage orbs are drawn as poker chips; buttons and panels use small radii (5-12px).
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
- **Score card** (`overlay/ScoreSheet.jsx`): Menu → Score card opens a reference sheet for tabletop scoring (Ledger and Hand of Three). They sit side by side on wide screens and in a swipe carousel with dots on phones. Cards are authored at 315×440 (63×88 mm) and scaled to fit. Bonuses are drawn as damage icons showing the total bonus from each power threshold (1+, 7+, 11+, 14+).
- **Pack:** the card the AI is about to take gets a rose reticle once the deal has landed. On desktop, hovering a pack card shows the change in your average damage per round.

## Animations

- **Shuffle** (`board/ShuffleIntro.jsx`): a riffle in the centre at each new game, after which the deck settles into its pile. Timing lives in `hooks/dealTiming.js`, and game flow waits for it (the AI's first pick is delayed until the deal has landed).
- **Deal:** cards enter from the deck pile face down and flip face up, staggered (`enterFrom` on `CardButton`, using WAAPI).
- **Zone changes** (for example the hand moving from the dock to the centre, or into battle): cards FLIP from their last on-screen rect (`card/cardRects.js`).
- **Flights** (`animation/CardMotionContext.jsx`): picks and discards arc, scale to the destination card size, and can flip. Draft masks and suppression keep their earlier behaviour.
- **Discard mode:** marked cards tilt and tint red. On submit they fly to the pile, and replacements deal in from the deck.
- **Battle:** each action card's hourglasses fill as rounds pass and fire when full. The firing card lunges and shows its burst value, a class-coloured damage orb flies to the enemy health bar, and the segments flash before draining. A lane strip shows which classes fire this round. Fast-forward (2.5×) and skip are available. At the end the defeated hand greys out and a result banner appears (the eye button dismisses it so you can look at the board).

`--impact-ms` (derived from the round interval) keeps the orbs, health drain and hit numbers in sync at any speed.
