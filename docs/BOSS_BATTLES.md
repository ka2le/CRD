# Boss co-op exploration

Testing mode added 9 November 2026; public release verified 12 November 2026. Menu → Testing → Boss battle · Co-op.
Two humans share the screen: Player 1 bottom left, Player 2 bottom right, boss at
the top. All hands are open. Uses the current NC73 Regular cards and adopted
Abilities scoring. This is separate from the four-faction Monsters ruleset.

## Options and quick experiments

Open the top-right menu → **Boss options**, or tap the rules summary on setup.
This is an exploratory project: neither preset replaces the other, and their
individual rules can be mixed. Rule changes apply with **Apply rules & restart
deal**, returning to setup with the same shuffle seed and empty Pockets.
Closing without applying leaves the encounter unchanged. Test mode and animation
preferences take effect immediately.

| Preset | Draft per round | Boss collects | Team power |
|---|---|---|---|
| Separate 4-card packs (new default) | Each player picks one from their own four-card pack | Every leftover from both packs | Player 1 + Player 2 |
| Original shared draft | Both players pick from one five-card pack (Wildmouth: six) | Its printed filter | Higher + twice lower |

Both presets default to **five rounds and five drafted cards per player**. Four
refers to each separate pack's size, not the final hand. The rounds selector can
also try four rounds/four picks each. In separate drafts both packs are active:
either player can pick first, with no enforced order. A pick always goes to that
pack's owner. After a player uses their available picks, their pack locks; boss
absorption waits until both players finish. Shared drafts retain alternating
first picker. Absorption
and lower-power doubling are independent options. The four draft tools can each
be disabled; the reducer enforces disabled tools as well as the UI.

In both draft modes **each player has a reusable Pocket and one charge each of
Refresh, Swap and “2 now” per encounter**. Pocket appears as a tiny face-up reserve
beside the player's name, using the ordinary discard-pile presentation. An empty
reserve shows an empty card slot. Tap it to highlight eligible cards directly,
select one, then Accept in the bottom dock; Cancel leaves all cards unchanged.
The reserve remains visible but inactive during prep/results. The other three
tools share a compact icon strip between that player's pack and hand. Refresh only changes a card
in the shared pack or the initiating player's own separate pack. Swap still exchanges one card between the two
hands, as confirmed by the creator, but spends only the initiating player's
charge. Pocket exchanges pack cards during that player's turn or once both players
have finished picking, before absorption. After final absorption, it exchanges
cards with its owner's hand until Prepare is pressed. Swap remains usable during
preparation. Refresh remains pack-only; it never replaces hand cards.

Borrowed picks may be interleaved with the other player's pick and still skip
only the borrowing player's next round. “2 now” can also be used after the normal
pick while that pack still has leftovers and a later round can repay it.
Both players can use “2 now” in the same
round; each takes two picks and passes the next round, preserving final hand
sizes. Reload, undo and checkpoints preserve personal charges and outstanding
picks. Restart/new deals replenish both sets. Existing separate saves without
personal charge fields preserve their old remaining shared charges for both
players; restart the same deal for two fresh sets. Legacy shared-draft saves also
preserve spent shared charges when migrating to personal powers.

Before absorption, **Switch latests** exchanges the cards most recently
picked by the two players in the current round, without spending a Swap charge.
It is available in both draft modes, even with Swap disabled, and may be reversed.
Both players must have picked this round. With “2 now”, only the latest of the
borrower's picks is eligible. Pocket holds a separate reserve and does not change
the latest picks;
previous-round cards and post-absorption exchanges still require Swap. Reload and
test-mode undo retain the eligible cards.

With all-leftover collection, each boss keeps its starting engine but overrides
its printed filter. Its card and help show the current rule. An ordinary five-
round separate draft feeds 30 leftovers to the boss; Pocket and borrowed picks
affect leftovers normally. With separate packs plus boss filters, Wildmouth
takes one random leftover **per player's pack**. Unabsorbed cards enter Recycle;
Refresh removals and preparation discards still never feed the boss.

Replay controls are always available in Boss options; same-deal restart and prep
replay are also in the top-right menu, and prep replay is on the result screen:

- **Restart same deal** resets picks, tools and prep and begins drafting with
  the same boss, seed and rules, with empty Pockets.
- **Fresh deal** returns to setup with a new shuffle, preserving selected rules,
  boss and tool settings, with empty Pockets.
- **Replay prep** restores both hands, draw deck and shared discard pile from
  the start of preparation, resetting activations, mandatory discard debts,
  Ready flags, faction choices and the previous result. Reserved Pocket cards and
  Swap charges return to their values at the start of prep, with the original hands.
- **Choose boss** starts setup for any boss directly.
- **Test mode** enables navigation here in Boss options and up to 40 action undos,
  including across reload; it adds no persistent main-table badge or shortcuts.
  **Back to draft start** restores the opening packs. **Fill picks & jump
  to prep** preserves real picks, takes the first card for every remaining pick,
  and performs normal absorption. This shortcut is deterministic, not a bot.

Checkpoints restore the whole physical-card state and random cursor. They do not
merge cards into an existing state. Replaying a win restores the cleared-boss
progress that existed at that checkpoint. Test mode is saved and carried into
the next encounter; it is independent of the normal game's Testing setting.
Existing v1 saves without options retain the original shared/filter/doubling
rules; switching to the new preset is explicit. Prep replay also reconstructs
the original draft boundary for legacy saves without checkpoints.

UI corrections, 13 November: normal Abilities Main + New Cards Draft is the
reference for interactions and presentation. Pocket targets directly on the
table, with no preview sheet. Required discards use normal red discard markers.
After battle the center shows the shared Abilities ledger for Player 1, Player 2
and the boss, followed by the team sum. Each row uses the actual chosen faction
and complete final stats, typed/neutral damage, bonus, shield reduction and score.
The regular animation runner counts each participant in that order, with the
same fast-forward/skip controls. Turning Battle animation off shows final scores
immediately. Core boss effects animate the printed symbols on its portrait.
The eye opens those same full scores; rewind replays preparation. Narrow portrait
rows keep faction cells together and put the final formula underneath.

UI corrections, 9 November: cards retain their standard proportions with no
blurred artwork extension. The existing menu stays top right and the existing
physical deck/discard stacks appear in the bottom dock. Above the boss cards,
the regular Abilities resolution ledger stays visible during drafting/prep and updates immediately:
stats and damage per faction, neutral damage, ability bonus, opposing shield
reduction and final score. It uses the same ledger row and scoring as the normal
end animation, without running the count-up sequence during drafting.

Visual direction, corrected 9 November: stay close to the original game's UI.
Draft/hand areas remain borderless, but retain the normal buttons and Abilities
ledger styling rather than flattening those controls. The bottom player hands
use the original horizontal HandArea rows instead of card grids, with overlap
on narrow screens and a measured height cap in landscape. The bottom dock uses
the original SideRail styling: compact contextual guidance at the left, a boxed turn label
in the center, and deck/discard beside the action group at the right. Options groups retain spacing rather than extra fieldset boxes.

In short landscape screens, the boss ledger uses a second header line beneath
the boss name, leaving the boss card band at full height. Absorbed count and View
have been removed completely: the cards are already visible and can be held to
inspect. They now use all the width previously reserved for those controls.

Both hand labels show Player 1 / Player 2. The current player's name has a filled
highlight. The bottom row reuses the centered, boxed multiplayer turn label:
“Player 1’s Turn”, with no action instructions attached. Only one name is current:
separate drafts follow the next pending picker visually while either player can
still pick first. During prep, the selected hand owns the turn label. Latest-pick
exchange uses a swap icon and “Switch latests” directly beside Absorb in the dock,
never over the pack cards. See [the required UI conventions](UI.md).
Power buttons retain names for tooltips and assistive technology. A brief
“Round N” notice fades at each new round. There is no disabled “Pick a card”
button. Contextual targeting/discard guidance accompanies the current player in
the bottom rail. Card containers allow the normal activation stars and rings to
extend outside the cards, with padding to keep them inside the screen. Rules,
test status, undo and navigation belong in Boss options.

## Encounters

| Boss | Starting engine | Cards absorbed after every pack | Pack size |
|---|---|---|---:|
| Rootmaw | One ordinary attack of each faction | All cards with printed stat pips | 5 |
| Ironhide | Two stat pips of each faction | All typed, neutral and conditional attack cards | 5 |
| Wildmouth | One stat and one ordinary attack of each faction | One uniformly random leftover | 6 |
| Briarback | Two Critter stats, one Critter attack, two shield points | Cards with Critter stats or typed Critter attacks | 5 |

Starting engines and difficulty are provisional, not balance-qualified. The four
creator-specified existing WebP images are referenced without modifying them.
The boss card prints its starting symbols and an absorption formula; tap it for
the explanation or hold to inspect. ∀ means every matching leftover; 1 ? means
one random leftover. Core symbols and acquired cards use the normal scorer,
including main-faction eligibility, Perfect Balance, Overwhelming and shields.

In the original preset, players alternate the first picker over five packs. After their picks, Absorb
resolves the boss filter; Next pack continues. Matching cards join its permanent
encounter engine, and the rest enter a shared Recycle pile. Mixed stats and
Critter Guard qualify as stat cards. Attacks include Bite, One of Each,
Specialist, Shield Is Damage and Discard for Damage. The Critter filter uses
printed Critter pips or a typed Critter attack, including Murder Rabbit.
Acquired preparation specials remain dormant on the boss; passive effects work.
Only original draft leftovers feed it, not refresh or preparation discards.

## Draft items

- Each player starts with an **empty Pocket**, a reusable reserve slot. During
  their pick turn, or after both players finish picking and before Absorb, choose
  a pack card to reserve. The existing Pocket card replaces it in the same pack
  position; if Pocket is empty, draw one replacement from the undealt deck.
  Pocket does not spend a pick, change the pack size or grant a combat-hand slot.
  Separate drafts can target only the owner's pack. The reserve is safe from
  absorption; a returned card becomes an ordinary pack card and can be picked or
  absorbed. Exchanges can be repeated while the timing window is open.
  After the final absorption and before Prepare, the same operation exchanges a
  card with the owner's hand. An empty Pocket still draws the replacement, keeping
  the hand size unchanged. Pocket closes during prep, and its held card remains
  outside combat. No cards are discarded by these exchanges. Reload, undo and
  checkpoints preserve the reserve and deck cursor. Legacy unused starting cards
  become reserves; spent legacy cards remain in their current hand/pile and do
  not become duplicate reserve cards. Restart/new encounters start empty.
- Refresh replaces one row card from the undealt deck. Select the
  card and Accept. It remains usable on leftovers after picking, but not during
  prep. The old card is set aside, unavailable to the boss or Recycle.
- Swap exchanges one selected drafted card from each player's hand.
  It remains available while picking, before and after absorption, including
  after final-round absorption and during prep, even if one hand is already
  Ready. A prep swap reopens both hands and clears both type choices. Actual
  prepared cards move with their used-special markers, so swapping cannot
  activate a used special again. Finish pending discards before swapping.
- “2 now” borrows that player's next pack's pick. It grants an extra
  pick now and skips their next round, preserving the selected four/five drafted
  cards per player. It can be used after the normal pick while leftovers remain;
  it is unavailable in the final round or prep. Pocket exchanges spend neither pick.

Charges reset each encounter. These are initial tools, not a campaign reward
system. There is no route map, inventory economy, solo or online mode yet.

## Preparation and outcome

Both hands prepare independently, with no first player or required turn order.
Either player can activate specials and choose a faction in their own lane.
The familiar large Accept/Ready button stays in the bottom-right corner.
Touching a hand or choosing its damage type directs that button to that hand;
a filled player-name highlight identifies the current confirmation context. This
focus does not block the other hand's actions. Cancel also stays in the bottom
rail. There are no per-player Ready checkboxes. Either Ready order works, and
battle resolves only when both hands are ready.

As in normal play, a hand with multiple eligible damage types must choose its
own type before locking. The action says Choose faction until a choice is made.
A sole eligible type is automatic. Eligible
ordinary highlighted cards select their single matching type directly after
specials. Cards with multiple eligible types open the regular game's
`FactionChoices` in a reserved band above that hand. Choose faction opens the
same controls, and Main type lets the player revise a choice before Ready.
Neutral-only, zero-damage and empty hands offer every legal faction directly.
There is no duplicate tiny faction-icon strip or popup covering the cards.
Each hand keeps its own choices, leaving the other hand usable. Changing one
hand invalidates only that hand's choice.

Draw, Copy, Recycle, redraw, draw/discard and sacrifices use the official prep
reducer. Shared deck/discard changes commit atomically for each action. Both
players can have pending discards simultaneously, with separate staged choices
and source baselines. Accepting/cancelling one hand leaves the other hand's
selection and Copy target intact. A player may Ready while the other still owes
discards; a hand cannot Ready with its own debt. Recycle removes its target for
both players, and stale actions cannot claim it again. Faction changes and hand
changes affect only that hand's choice. Ready locks only its own hand. Pending
debts survive reload; prep replay restores both initial hands and shared piles.

Swap uses two opposing horizontal arrows, distinct from the curved replay/undo
symbol, in both players' personal strips.

Each hero applies **all** boss shields at normal C1/R1/D0 costs. The team's
shields add together and reduce the boss's score once at its chosen faction's
normal cost. Calculate both heroes' complete scores, then:

**Team power = Player 1 score + Player 2 score**, plus the lower score only when
the doubling toggle is enabled (as in the original preset).

Compare with the boss score. Either Critter hero supplies the team's Critter
tiebreak; a Critter boss cancels it. Otherwise equal scores draw. The boss commits
its faction using the existing automatic selection convention. No boss AI or
preparation search is involved.

Victory marks that boss cleared; Next boss builds a fresh hand against the next
uncleared boss. All four cleared offers New run. Defeat/draw offers Try again.
Boss selection also allows testing any encounter directly. State, item charges,
random acquisition cursor, pending discards and results survive reload in
`crd-boss-run-v1`. Normal play remains separately saved, and invitations open the
normal room flow. Boss rules have their own save version and are excluded from
normal-match/room fingerprinting.

## Verification

- `npm run boss:test`: both presets, mixed filters, four/five-round physical
  ownership and budgets, own-pack tools, random reload determinism, shared prep,
  shields/ties, disabled tools, same-seed restart, full prep replay and undo/jumps.
- `node scripts/boss-battle-browser-smoke.mjs`: Testing entry, all four complete
  encounters, all tools, refresh/reload, Copy, mandatory discards, sacrifices,
  shared Recycle and exit, plus desktop and phone layout/image checks.
  Set `CRD_PLAYWRIGHT_MODULE` if Playwright is installed outside this project.
- Screenshots and browser receipt: `artifacts/ui/boss-battle/`.
- `node scripts/boss-shared-ui-browser-smoke.mjs`: both modes at desktop,
  portrait and landscape sizes; personal controls/charges, bottom-row turns and
  player highlights, free latest-pick exchange/reload/absorption boundary,
  neutral/zero-power faction prompts, either-hand Ready, and unclipped animated
  activation stars/rings. Screenshots/receipt: `artifacts/ui/boss-shared-parity/`.
- `node scripts/boss-options-browser-smoke.mjs`: both presets, options,
  separate-pack ownership, additive scoring, four-round variant, disabled tools,
  reload/restart/replay/undo/jumps and desktop/phone layout. Screenshots/receipt:
  `artifacts/ui/boss-options/`; original-preset regression evidence in `original/`.
- `node scripts/boss-prep-browser-smoke.mjs`: either hand first, independent
  Copy/discard staging, overlapping pending actions, reload/cancellation/shared
  Recycle, both Ready orders, physical uniqueness and exact replay at desktop,
  portrait and landscape sizes. Also checks Pocket closes during prep, Swap of a
  used special, independent charges and prep replay refunds. Latest evidence:
  `artifacts/ui/boss-late-powers/prep/`; draft/options regression:
  `artifacts/ui/boss-late-powers/options/`.
- `node scripts/boss-pocket-browser-smoke.mjs`: both draft modes at desktop,
  portrait and landscape sizes; empty/filled inline Pocket piles, direct targeting, replacement draws,
  reusable exchanges, normal-pick preservation, turn restrictions, pre-absorption
  exchanges, reload, final own-hand exchanges, physical-card conservation and
  Pocket closure at prep. Evidence: `artifacts/ui/boss-pocket-reserve/`.
- `node scripts/boss-draft-parity-browser-smoke.mjs`: both presets at five
  desktop/portrait/landscape sizes, direct single-type and multi-type card
  selection, neutral/empty hands, committed factions, every displayed stat and
  damage total, Robot bonus, Dragon extra stat, pooled shields, team sum, result
  sheet and replay. Current UI evidence for this and the Pocket/shared/prep
  suites: `artifacts/ui/boss-draft-parity/`.

This prototype does not change the normal NC deck/rules, models or research
archives and does not authorize new balance collection, fitting or deployment.
