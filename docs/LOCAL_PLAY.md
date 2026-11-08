The Opponent dropdown includes **2 players · same screen** in Draft and Discard.
Tap either player's name to rename them; names persist across games.

Draft keeps P1's name and hand at the bottom and P2's at the top throughout,
with a brief, non-blocking notice for the active player. Card previews use that
player's hand. Play continues immediately, without a confirmation.
Discard and preparation keep
the table visible with both hands face down during a handoff; tap the eye beside
the active player's name to reveal their hand. The other hand and its statistics
stay hidden. Show all switches to open hands without private handoffs; Hide
restores private play. Reloading restores privacy for private turns, while a
public draft resumes immediately.

Both discard selections lock before either redraw resolves. The turn order
minimizes passing: P1 discard 1, P2 discard 1, P2 discard 2, P1 discard
2, P1 preparation, P2 preparation. Consecutive steps for the same player keep
their cards visible. Only a change of holder needs a reveal (or reloading a
private turn). Players with no preparation choices are skipped. Preparation is
sequential: each player chooses their own actions and faction, then presses
Ready. Previously committed choices stay hidden until battle. A player with no
available preparation or faction choice is automatically ready. Battle starts
as soon as both players are ready, with no additional confirmations.

The installed PWA supports local and AI play offline after its first complete
online installation. Production builds precache every playable asset, including
AI workers and local fonts. Online rooms still require connectivity. Updates
activate only after their complete offline download succeeds. Reloading
loads the latest installed build even while another game tab remains open. Those
open games keep running their loaded code, and their older cached AI workers stay
available offline until the older pages close. A navigation with no other open
game pages clears superseded caches. Browser storage must remain available.

If an older installed version keeps showing an outdated menu, open
`https://ka2le.github.io/CRD/?update=1` while online. This explicit recovery link
reloads that page after the new offline build installs, preserving the saved game
and leaving other game windows alone.

Verify with `npm run build`, `npm run lint`, and
`node --test scripts/pwa-tests.mjs scripts/local-multiplayer-tests.mjs scripts/play-menu-tests.mjs scripts/room-tests.mjs`.
For production-browser checks, serve a Pages build (`GITHUB_PAGES=true`) with
`vite preview --host 127.0.0.1 --port 4175` using the same environment variable,
then run `node scripts/offline-local-browser-smoke.mjs` with Playwright installed.
`CRD_PLAYWRIGHT_MODULE`, `CRD_BROWSER_EXECUTABLE` and `CRD_URL` can override the
tooling module, browser executable and preview URL. The smoke test clears the
HTTP cache, disables networking, opens a new page, starts an unused AI worker,
plays both human modes, checks privacy/reload and fetches every cached resource.
Its report and screenshots go to the ignored `.ai-runs/offline-local-browser/`.
