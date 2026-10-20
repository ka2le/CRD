# Online rooms

Implemented 2026-10-20. Cloudflare relay and GitHub Pages frontend are deployed with Turnstile configured.

## Player flow

Normal visits immediately open the existing AI game. No room is created, relay connection opened, bot check loaded or startup choice shown. Menu → Online room is optional. Every visitor can create their own room; friends do not need Cloudflare accounts or the site owner online.

Press **Create a room** next to the menu, then **Copy invite** and send the link. A fun name such as AppleFireman is generated once and remembered on the device. The host keeps playing AI until a friend follows the invitation. The link handles joining, including the managed bot check; no required name form or Start button. The first guest joins an open room automatically and a fresh two-player game starts with the host's current Draft/Discard, Wild Deck and Battle/Threshold/Abilities settings.

Your editable name and room wins appear by your bottom hand; the opponent's name/status/wins appear at the top. Room controls next to the menu let players rename, copy the invitation and disconnect. Hosts can enable **Private room** to approve new arrivals, accept/decline requests, kick members, and seat an admitted viewer when player two is offline. Additional visitors request viewer access even in open rooms; viewers are read-only, with the host's table perspective. Up to eight viewers are allowed.

The host controls settings and rematches. Preparation is independent; battle begins after both players press Battle. Winner announcements use names while retaining Victory/Defeat for the respective player. Wins count once per completed match, persist across rematches/refreshes within the room, and follow the player-two seat to a replacement device. Ties add no wins.

A disconnected player-two seat can be continued from another device through the same invitation. It keeps the hand, deck, turn and score, and revokes the old device's access. A clean disconnect releases the seat immediately; a silent dropped connection takes up to about 65 seconds to become available. Private rooms require approval for the new device. A connected player cannot be displaced by following the invite. Leaving or kicking player two explicitly clears the match and returns the host to their saved AI game; the room stays open. Closing the host's room ends membership for everyone.

## Ownership and persistence

- `src/network/RoomClient.js`: browser-owned room journal, WebSocket reconnection, host transitions, guest pending actions and acknowledgements.
- `src/network/roomGame.js`: validated seat actions over the existing browser reducer and shared game functions; logical redraw/pack transitions complete atomically, independent of animations. Guest actions are applied to a mirrored view and converted back to host coordinates. Per-seat preparation UI/selection is kept separate.
- `src/hooks/useRoom.js`: React subscription/lifecycle adapter.
- `src/hooks/useGameSession.js`: existing AI session, with room-managed state/input when a two-player match is active; AI effects stop during human matches.
- `src/components/overlay/RoomSheet.jsx`: quick membership/privacy/share controls; `RoomEntry.jsx` handles automatic invitation/create entry and lazy Turnstile loading.
- `relay/worker.js`: transport and bounded membership, no game simulation or saved game state.

`crd-online-profile-v1` stores the remembered name and random player identity independently of rooms. `crd-local-game-v1` stores the solo AI session. `crd-room-v1` stores the room ID, relay address, random seat token, host-coordinate full game snapshot (including shuffled deck), revision, bounded duplicate-action IDs and a guest's unconfirmed action. Both players save snapshots. Refresh automatically reconnects the same accepted seat. Host storage must succeed before confirming or broadcasting an accepted action. Repeated guest action IDs are acknowledged without reapplying. Stale actions are rejected with a retry notice instead of silently changing a new table. A line-ending-independent game-rules fingerprint detects incompatible builds (presentation/network edits do not change it); updating rules preserves room identity but requires a fresh compatible match. Single live socket per seat prevents two host tabs running simultaneously.

The host remains the game authority. If the host is offline the guest waits; the host's saved snapshot resumes after refresh/reconnection. Losing host browser storage is not automatic failover in this first version. Host tokens remain browser-local, without accounts or cross-device host recovery. Player two uses the open-seat invitation takeover described above; an invitation therefore grants play access whenever that seat is offline in an open room. The complete state is available to both trusted clients, although the UI may hide opponent cards. localStorage failures are reported for room actions rather than confirming unsaved changes. Battle presentation may replay after refresh; accepted game decisions and deck order are preserved.

## Relay and abuse bounds

Cloudflare Worker plus one SQLite-backed Durable Object per room. The service stores hashed member tokens, names, player identities, privacy, at most eight viewers/four pending applicants, 32 revoked-token hashes and a fixed expiry. Hibernating WebSockets push game events without polling. Small 20-second heartbeat/pong messages detect silent drops; presence broadcasts occur on membership/status changes, not on each heartbeat. Tokens travel in the WebSocket handshake subprotocol, never invitation URLs. Membership survives disconnects; rooms expire **24 hours after creation** (fixed lifetime, not renewed indefinitely), with automatic storage deletion. Pending requests expire after two minutes.

The production entry routes require server-verified Turnstile (action and hostname checks). Explicit allowed origins restrict browser use; origin checks alone are not authentication or bot protection. Random 80-bit room IDs and 256-bit seat tokens, host-only admission/administration, guest/viewer/host message permissions, strict game-action envelopes, bounded HTTP bodies (4 KiB), WebSocket messages (192 KiB), per-socket message/byte limits, per-IP entry/connect limits, and a global daily room-creation ceiling bound resource use. Edge IP limits are approximate/local to Cloudflare locations. Rejected requests can still consume free quota; distributed abuse can still cause temporary unavailability. Stay on Workers Free for hard service limits rather than paid overages. No claim of DDoS immunity.

`ALLOW_LOCAL_TESTING=true` bypasses Turnstile only when explicitly supplied to the local dev command. It is absent from production config. Never deploy that override. No snapshots/decks, uploads, chat history, accounts, rankings or replays are stored on the service.

## Owner setup and deployment

Current public relay address: `https://crimson-haze-8993.kalle-kindvall.workers.dev`. It is configured as the app default; `VITE_ROOM_RELAY_URL` can override at build time, and the room sheet has an advanced relay address field. Invitation links carry the chosen relay address.

Setup update: owner completed Wrangler authorization and installed `TURNSTILE_SECRET_KEY`; the public site key is configured. Room protocol v2 relay deployed as version `b8861950-9e7d-4ce6-bb42-e53dad84aafd`. Production `/config` returns200 with protocol2, the expected public key and `localTesting:false`. Sanitized frontend commit `01c8d85` contains the smoother flow; Pages run `39473994331` passed. The published browser verified one-click Turnstile room creation, open-by-default controls, names and the same room/AI hand after refresh. The disposable production room was closed. A subsequent small frontend fix adds retry/error feedback for blocked or failed Turnstile checks. Production Turnstile currently permits the GitHub Pages hostname; a localhost-to-production relay test was blocked by hostname policy, while the full two-player/viewer/takeover flow passed against the local relay.

1. Sign up at <https://dash.cloudflare.com/sign-up> and keep the **Workers Free** plan. Worker `crimson-haze-8993` now runs the room relay. The deployment command updates its code and maintains its Durable Object binding and SQLite migration.
2. In Cloudflare → Turnstile, add a **Managed** widget named CRD for hostname `ka2le.github.io`; add `localhost` for development if desired. Use hostnames without a scheme or path. The site key is public: set `TURNSTILE_SITE_KEY` in `relay/wrangler.jsonc`. Do not commit the secret.
3. From this project directory, authenticate using `npm run relay:login`. Complete the browser authorization personally. No API token needs to be shared in chat.
4. Run `npm run relay:secret` and paste the **Turnstile secret key** into its terminal prompt. It is stored as a Worker secret, not in source or the frontend. This command targets `crimson-haze-8993`.
5. Run `npm run relay:deploy`. This publishes the Worker, creates the `ROOMS` Durable Object namespace and applies its `new_sqlite_classes` migration. Do not enable a paid plan for this project.
6. Verify room creation/approval from two browsers. Publish the frontend through the sanitized workflow in `PUBLISHING.md`; never push the private workspace history. Include `relay/` in the public snapshot along with the normal source. Both players must load a compatible frontend version.

## Local checks

`npm run dev` serves the game. In another terminal, `npm run relay:dev` starts the local room service on port 8787 with local-only Turnstile bypass. For a local room, set the advanced relay address to `http://localhost:8787`. Two browser profiles or `localhost:5173`, `127.0.0.1:5173`, `viewer.localhost:5173` and `phone.localhost:5173` provide separate localStorage seats. Do not use two same-origin tabs to represent different players; they deliberately share a saved identity.

`npm run rooms:test` checks both seats and all mode/rules combinations, preparation/copy/redraw, faction selection and scoring symmetry, invalid actions, persisted deck/token recovery, duplicate IDs, storage failure, stale actions, and real local Durable Object approval/message/size/origin/close behavior through Miniflare. Existing tabletop/headless/opponent/test-deck/regression checks cover the preserved AI path. `npx wrangler deploy --config relay/wrangler.jsonc --dry-run` verifies the deployment bundle without publishing.

## Verification recorded 2026-10-20

15 room tests pass, including all mode/rules combinations, public auto-admission, private approval, viewer permissions, kicking/promotion, offline-seat replacement/revoked credentials, remembered profiles, automatic match startup, exactly-once wins and saved-version migration. Existing 18 tabletop,17 headless,10 opponent and4 test-deck tests, original regression smoke, lint and Pages-base build also pass. Browser checks used separate host/guest/viewer/replacement-device origins: one-click create/link join, automatic match start, picks both ways, editable names, refresh recovery, approved read-only viewing and continuing the same player-two hand from another device. The old device returns to AI with a revoked-seat notice. Normal visits still start AI immediately.

Turnstile failure handling follows Cloudflare’s [client-side error callbacks](https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/): blocked checks show actionable feedback and Retry rather than leaving entry pending indefinitely.
