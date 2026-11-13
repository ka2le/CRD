# UI and animation design

## Required workflow and current conventions

Read this guide at the start of every repository task. Before UI edits, inspect the
referenced live component and stylesheet; carry the same design into other modes.
When the user corrects UI, update this section in the same change with the general
convention, an example, and the source that future work should reuse. Reconcile
older descriptions elsewhere in the docs. Explicit newer user requests take priority.

- **Boss totals are part of the rows (13 November 2026, latest correction).**
  One small damage box spans both player rows and contains only the combined team
  total; align the boss total beneath it in the same column. Keep this structure
  on desktop, portrait and landscape. Retain each participant's calculation, but
  do not reserve an empty formula line for an unmodified boss score. Example:
  player scores 3 and 0 share a `3` damage box; the boss's `8` is aligned below.
  There is no separate Team equation underneath. Pocket is immediate: tap Pocket,
  then a highlighted card to commit; keep Cancel in the dock without an Accept
  step. Source: creator's two annotated follow-up screenshots and explicit Pocket
  correction, 13 November. Reuse `boss/BossScores.jsx`, `BossScores.css` and
  `BossBattle.jsx`; verify `scripts/boss-test-prep-browser-smoke.mjs` and
  `scripts/boss-pocket-browser-smoke.mjs`.
- **Boss cards get the available space (13 November 2026).** Keep result ledgers
  compact, with formulas beside the faction cells when they fit. On desktop and
  phone landscape, place the boss portrait/acquired cards beside the result
  panel, with both player hands below. In short landscape, put player identity,
  faction/damage and Pocket beside each hand. Narrow hands use the shared fitted
  card grid so available height reveals every card without overlap; wide hands
  retain a single row. Example: a five-card portrait hand can use 3 + 2, rather
  than covering neighboring artwork. Final totals grow in normal layout, leaving
  the equals sign unobscured. Remove the top boss-name/progress heading and corner
  question-mark button; **Boss rules** belongs inside the existing menu. Keep the
  menu clear of all cards. Source: creator's annotated landscape/portrait images
  and follow-up in the 13 November mobile Boss UI task; implementation in
  `boss/BossBattle.jsx`, `BossBattle.css`, `menu/ScreenMenu.jsx`; responsive checks
  in `scripts/boss-responsive-browser-smoke.mjs`. This supersedes the earlier
  Boss-only overlapping-row preference and second-header-line placement.
- **Normal NC Draft is the reference flow for Boss mode (13 November 2026).**
  Reuse Abilities Main + New Cards components and interactions. Pocket is a tiny
  face-up `Pile` beside its owner's name, with an empty slot before reserving a
  card. Tapping it immediately highlights eligible pack/hand targets; select a
  card to exchange immediately, or Cancel from the dock. Do not add a preview
  sheet and a second “Choose a card” step. The reserve remains visible, inactive,
  after its exchange window closes. Source: `board/Pile.jsx`, `BossBattle.jsx`.
- **Faction selection follows the cards.** As in `App.jsx` and
  `useGameSession.js`, highlight eligible cards after specials; one eligible
  faction selects directly and multiple factions open `FactionChoices`.
  Boss keeps those shared choices in a reserved band above the relevant hand,
  so both players can prepare independently without covering either hand.
  Neutral/empty hands get all legal choices. A single Main type / Choose faction
  control replaces the duplicate tiny faction-icon strip. Required discards use
  `HandArea`'s red discard markers, matching normal preparation.
- **Show every participant's Abilities breakdown at the result.** Player 1,
  Player 2 and the boss each get the regular `TabletopResolution` ledger row:
  faction stats and damage, neutral damage, committed faction, bonus, shields
  and final damage. Merge the team total into a box spanning the two player rows.
  Use actual committed scores,
  including pooled team shields against the boss; never reselect a faction for
  display. Reuse the regular count-up runner in Player 1 / Player 2 / boss order,
  with fast-forward, skip and the existing Battle animation preference.
  Example: Robot damage `2 + 3 − 4 = 1`, followed by the other player's
  row and the boss row. Sources: `battle/TabletopResolution.jsx`,
  `boss/BossScores.jsx`, `game/tabletopResolution.js`. Check
  `scripts/boss-draft-parity-browser-smoke.mjs` at desktop, portrait and landscape.
- **Reuse established UI.** Match existing multiplayer/player-bar controls before
  introducing a new layout or explanation. Keep cards unobscured by action controls.
- **Turn identity is compact and centered.** Use the boxed multiplayer rail label
  (`.side-rail__turn`, `src/App.css`; markup in `src/components/hud/SideRail.jsx`)
  in the bottom row for same-screen co-op, with just **Name’s Turn**. Example:
  **Player 2’s Turn**. Put required targeting/discard guidance separately; do not
  append “pick a card” or other instructions to the turn label.
- **One current player, one highlighted name.** Emphasize only the named player's
  label beside their hand. Multiple players being allowed to act does not mean
  highlighting both as current. In separate-pack co-op, use the next pending
  picker as the visual turn cue while retaining either-player-first input. During
  prep, use the hand whose confirmation is currently selected.
- **Related actions belong together in the dock.** Put a secondary action directly
  beside its primary action in one button group. The co-op latest-pick exchange is
  **swap icon + Switch latests**, immediately beside **Absorb**. Use the existing
  `SvgIcon name="swap"`. Keep the wording short; “picks” and “Free” do not belong
  on this button. Explain timing/cost in help if needed. Do not overlay it on the
  draft cards or absorption highlights. Keep the two buttons adjacent on phones;
  move other dock content to another row when space is tight.
- **Player-specific decisions stay with that player's hand.** Use the regular
  faction choices over the relevant hand, including neutral-only/zero damage;
  personal tools remain in that player's strip. Card stars and rings must remain
  visible outside the card and hand containers.
- **Review actual layout.** Check desktop, phone portrait and phone landscape,
  including initial/next turn, preparation, and the Absorb action group. Verify
  centered turn text, exactly one current-name highlight, adjacent related buttons,
  and unobscured cards. Examples live in `src/components/boss/BossBattle.jsx` and
  `BossBattle.css`; browser coverage is `scripts/boss-shared-ui-browser-smoke.mjs`.

Feedback incorporated 12 November 2026: a verbose left-aligned turn instruction,
simultaneous current-player highlights, and a “Switch latest picks · Free” overlay
on draft cards were rejected. The conventions above replace those presentations.

Normal play uses NC and the Regular deck. The Testing switch appears before the Battle section. Battle-rule choices, opponent-card visibility, Wild deck and Test deck appear only with Testing enabled. Turning Testing off restores the normal rules, redealing only if the effective setup changes. Older non-testing saved setups migrate to NC; new online rooms also use normal NC settings.

> Naming policy (2026-10-22): **Abilities = `abilities-main`** (formerly Abilities v2). The original is **Abilities Prototype** (`abilities-prototype`), hidden and excluded from balance testing unless explicitly requested. Generic tabletop requests mean main; Threshold must be named explicitly. Historical raw IDs/paths remain unchanged. See [ruleset naming policy](RULESET_NAMES.md).

2026-10-21: the top and bottom rails are now edge-to-edge bars (square ends, one border towards the table, safe-area padding inside); only the play zones keep the side inset and the 1500px max width. Tapping the deck opens the Collection (every card in the game); with Testing on it opens the Test deck, and both sheets show a Collection ⇄ Test deck switch (arrow keys or Tab flip). After a battle, the eye (watch the table) no longer greys out the loser's cards; with Testing on a rewind button (result panel and dock) replays the deal from the start of preparation with the same hands and deck order. Online rooms add emotes (see `MULTIPLAYER.md`).

2026-10-20: the toggle became a **Battle / Threshold / Abilities** selector; 2026-10-21 adds **Abilities v2**, Reconfigure markers (tooltip counts exchanged Robot stat pips / attack units), Dragon extra-stat markers and Critter tie eligibility (Abilities shows Adapt and Overwhelming as small markers in the score formula; Perfect Balance is the bonus term). 2026-10-19 addition: Menu → **Tabletop battle** is a persisted toggle for either Draft or Discard. Cards show the mode's power and no hourglasses. Rails show base power before battle; help and inspect explain the current rules. After preparation, eligible cards highlight when a main damage type needs commitment; a multi-class card offers its eligible types. Tabletop battle immediately shows both **base − shields + bonus = broken hearts** formulas in the result and central strip, without HP, timing lanes or playback controls. Zero shield/bonus terms disappear; bonus uses broken hearts instead of a star, and an unmodified score displays just its final damage. See `TABLETOP_MODE.md` for rules and approved special conversions.

Added 2026-10-18 with the table redesign. Rules logic is unchanged. This file describes how the player-facing table is laid out and animated.

## Principles

- The cards carry the information. The UI adds only what the cards can't show: whose turn it is, totals, health, timing and progress.
- Use symbols, colour, position and motion before labels. Use short verb labels for primary actions and existing icons for secondary controls. Add concise secondary labels where the current conventions or user request call for them.
- Teaching is opt-in: long-press or right-click any card to inspect it, and Menu → How to play opens a visual timing sheet.
- Mobile portrait comes first, and every layout fits the screen with no page scroll.

## Installed app

- The web app manifest requests `fullscreen` display for installed PWA launches. Browsers that do not support that display mode may fall back to their closest supported app window mode.

## Visual language

- Draft turns appear in the middle of the existing player bars: **Your turn** in the bottom bar or **[opponent name]'s turn** in the top bar, with brass/rose styling and directional arrows where space allows. The acting side's bar has a stronger tinted edge and background. Between packs the bottom label says **Next pack**; viewers see the active player's name. The label uses no pack space, so draft cards keep their full fit area. Compact bars prioritize turn, faction totals, and controls; average damage is hidden where needed, and landscape names truncate to keep the center clear.

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
- **Score card** (`overlay/ScoreSheet.jsx`): four visible cards: two Threshold and two Abilities (`abilities-main`) layouts. Main cards show Win Ties, Perfect Balance+3, Dragon7+→one extra stat and shield tabs−1/−2/0. Prototype components and artwork remain in source but are not mounted. Cards fit a grid on desktop and a swipe carousel on phones. Digital combat is unaffected.
- **Pack:** the card the AI is about to take gets a rose reticle once the deal has landed. On desktop, hovering a pack card shows the change in your average damage per round.

## Animations

- **Abilities calculation bar:** the central resolution rows render at 1.45× scale, including numbers, icons, and spacing. Compact rows start below 1400px; controls move underneath at 800px. At 640px and below, scale drops to 1.2× and each player uses two lines: all faction/neutral cells together, then the formula underneath.

- **Shuffle** (`board/ShuffleIntro.jsx`): a riffle in the centre at each new game, after which the deck settles into its pile. Timing lives in `hooks/dealTiming.js`, and game flow waits for it (the AI's first pick is delayed until the deal has landed).
- **Deal:** cards enter from the deck pile face down and flip face up, staggered (`enterFrom` on `CardButton`, using WAAPI).
- **Zone changes** (for example the hand moving from the dock to the centre, or into battle): cards FLIP from their last on-screen rect (`card/cardRects.js`).
- **Flights** (`animation/CardMotionContext.jsx`): picks and discards arc, scale to the destination card size, and can flip. Draft masks and suppression keep their earlier behaviour.
- **Discard mode:** marked cards tilt and tint red. On submit they fly to the pile, and replacements deal in from the deck.
- **Battle:** each action card's hourglasses fill as rounds pass and fire when full. The firing card lunges and shows its burst value, a class-coloured damage orb flies to the enemy health bar, and the segments flash before draining. A lane strip shows which classes fire this round. Fast-forward (2.5×) and skip are available. At the end the defeated hand greys out and a result banner appears (the eye button dismisses it so you can look at the board).

`--impact-ms` (derived from the round interval) keeps the orbs, health drain and hit numbers in sync at any speed.

Tabletop 2× card print: `2 × star` (supplied `card icons/star.png`, served from the existing optimized icon asset). Replaces BONUS text; result-formula bonuses continue to use broken hearts.

Shortcut and Chameleon are tabletop-only collection/deck entries with the creator's optimized artwork. Shortcut prints forward arrow → star. Chameleon prints the three faction icons separated by slashes; tapping it during preparation opens FactionPicker with three large colored stat icons. Selecting one commits the whole hand's main faction, shows the chosen card frame and permits Battle. Copy-target mode takes precedence. The same picker handles tied multi-class cards. Dev previews: ?scenario=chameleon and ?scenario=shortcut&at=result.

## Online flow (2026-10-20)

Normal startup remains immediate AI play. Create a room/Invite sits next to the menu; invitation links join automatically with a remembered random editable name. Open rooms auto-seat the first guest and start the match. Names, online dots and room wins sit beside the two hands. In phone landscape (`max-height: 520px`) they sit inline before the stats rather than on their own row, so the rails stay at their unnamed height and the cards get the space. Room controls show members, requests, privacy, kick/seat-viewer and disconnect actions. Viewers need approval and cannot change gameplay. Results name the winner while retaining Victory/Defeat for the playing seats. See `MULTIPLAYER.md`.

Room controls use a globe connection icon, and the share button is labeled Invite. Online Discard allows both seats to choose concurrently: submitting locks your choice and shows Waiting until both players have submitted; neither hand refills early.

Online UI polish (2026-10-20, later): a single **Invite** button (person-plus icon) always does the same thing — create a room if needed and copy the link — with inline Copied feedback; there is no separate Create room label. A globe button with the online count (and a request badge) opens the Room sheet. Names show as plain text with a small pencil; tap to edit inline (Enter/leave saves, Esc cancels) both beside your hand and in the sheet. Room sheet sections: status, join requests, invite link card (Copy/Share), players, Ask before people join switch, Close/Leave room. Menu item: Play online (no room) / Room & players. Source: `src/components/hud/RoomButtons.jsx`, `hud/PlayerIdentity.jsx` (`NameEditor`), `overlay/RoomSheet.jsx`.
