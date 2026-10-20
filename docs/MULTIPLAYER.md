# Online rooms

Implemented 2026-10-20. Cloudflare relay and GitHub Pages frontend are deployed with Turnstile configured.

## Player flow

Normal visits immediately open the existing AI game. No room is created, relay connection opened, bot check loaded or startup choice shown. Menu → Online room is optional. Every visitor can create their own room; friends do not need Cloudflare accounts or the site owner online.

The host enters a name, passes Turnstile and creates a room. They can keep playing AI while waiting. An invitation contains the ordinary game URL plus a fragment containing the room ID and relay address, never a seat token. Joining requests host approval. After accepting, the host selects Play together to deal a fresh game with their current Draft/Discard, Wild Deck and Battle/Threshold/Abilities settings. Each browser sees its own hand at the bottom. The host controls shared settings/new games; either player can finish preparation independently, and battle starts after both are ready. Both choose their own tabletop faction. The host can return to AI without closing the room. Guest departure does not close the room; host departure does.

## Ownership and persistence

- `src/network/RoomClient.js`: browser-owned room journal, WebSocket reconnection, host transitions, guest pending actions and acknowledgements.
- `src/network/roomGame.js`: validated seat actions over the existing browser reducer and shared game functions; logical redraw/pack transitions complete atomically, independent of animations. Guest actions are applied to a mirrored view and converted back to host coordinates. Per-seat preparation UI/selection is kept separate.
- `src/hooks/useRoom.js`: React subscription/lifecycle adapter.
- `src/hooks/useGameSession.js`: existing AI session, with room-managed state/input when a two-player match is active; AI effects stop during human matches.
- `src/components/overlay/RoomSheet.jsx`: create/join/share/approve, connection notices and switching AI/human.
- `relay/worker.js`: transport and bounded membership, no game simulation or saved game state.

`crd-local-game-v1` stores the solo AI session. `crd-room-v1` stores the room ID, relay address, random seat token, host-coordinate full game snapshot (including shuffled deck), revision, bounded duplicate-action IDs and a guest's unconfirmed action. Both players save snapshots. Refresh automatically reconnects the same accepted seat. Host storage must succeed before confirming or broadcasting an accepted action. Repeated guest action IDs are acknowledged without reapplying. Stale actions are rejected with a retry notice instead of silently changing a new table. A game-rules fingerprint detects incompatible builds; updating rules preserves room identity but requires a fresh compatible match. Single live socket per seat prevents two host tabs running simultaneously.

The host remains the game authority. If the host is offline the guest waits; the host's saved snapshot resumes after refresh/reconnection. Losing host browser storage is not automatic failover in this first version. Tokens are browser-local, with no accounts or cross-device recovery. The complete state is available to both trusted clients, although the UI may hide opponent cards. localStorage failures are reported for room actions rather than confirming unsaved changes. Battle presentation may replay after refresh; accepted game decisions and deck order are preserved.

## Relay and abuse bounds

Cloudflare Worker plus one SQLite-backed Durable Object per room. The service stores hashed host/guest tokens, names, at most one pending applicant and a fixed expiry. Hibernating WebSockets push events without polling. Tokens travel in the WebSocket handshake subprotocol, never invitation URLs. Membership survives disconnects; rooms expire **24 hours after creation** (fixed lifetime, not renewed indefinitely), with automatic storage deletion. Pending requests expire after two minutes.

The production entry routes require server-verified Turnstile (action and hostname checks). Explicit allowed origins restrict browser use; origin checks alone are not authentication or bot protection. Random 80-bit room IDs and 256-bit seat tokens, host-only approval, guest/host message permissions, strict game-action envelopes, bounded HTTP bodies (4 KiB), WebSocket messages (192 KiB), per-socket message/byte limits, per-IP entry/connect limits, and a global daily room-creation ceiling bound resource use. Edge IP limits are approximate/local to Cloudflare locations. Rejected requests can still consume free quota; distributed abuse can still cause temporary unavailability. Stay on Workers Free for hard service limits rather than paid overages. No claim of DDoS immunity.

`ALLOW_LOCAL_TESTING=true` bypasses Turnstile only when explicitly supplied to the local dev command. It is absent from production config. Never deploy that override. No snapshots/decks, uploads, chat history, accounts, rankings or replays are stored on the service.

## Owner setup and deployment

Current public relay address: `https://crimson-haze-8993.kalle-kindvall.workers.dev`. It is configured as the app default; `VITE_ROOM_RELAY_URL` can override at build time, and the room sheet has an advanced relay address field. Invitation links carry the chosen relay address.

Setup update: owner completed Wrangler authorization and installed `TURNSTILE_SECRET_KEY`; the public site key is configured. The earlier automatic-review credit error cleared on a later approved deployment attempt. Relay deployed successfully as version `7064e546-ac0d-4516-99ac-e027a7d797c9`. Production `/config` returns200 with the expected public key and `localTesting:false`; an invalid Turnstile challenge returns403 without creating a room. Sanitized frontend code commit `ee186f9` was published and Pages run `39462048472` succeeded. A production browser completed the normal automatic Turnstile flow, created a room, connected, and restored the same room/AI state after refresh. The disposable production test room was closed.

1. Sign up at <https://dash.cloudflare.com/sign-up> and keep the **Workers Free** plan. Worker `crimson-haze-8993` now runs the room relay. The deployment command updates its code and maintains its Durable Object binding and SQLite migration.
2. In Cloudflare → Turnstile, add a **Managed** widget named CRD for hostname `ka2le.github.io`; add `localhost` for development if desired. Use hostnames without a scheme or path. The site key is public: set `TURNSTILE_SITE_KEY` in `relay/wrangler.jsonc`. Do not commit the secret.
3. From this project directory, authenticate using `npm run relay:login`. Complete the browser authorization personally. No API token needs to be shared in chat.
4. Run `npm run relay:secret` and paste the **Turnstile secret key** into its terminal prompt. It is stored as a Worker secret, not in source or the frontend. This command targets `crimson-haze-8993`.
5. Run `npm run relay:deploy`. This publishes the Worker, creates the `ROOMS` Durable Object namespace and applies its `new_sqlite_classes` migration. Do not enable a paid plan for this project.
6. Verify room creation/approval from two browsers. Publish the frontend through the sanitized workflow in `PUBLISHING.md`; never push the private workspace history. Include `relay/` in the public snapshot along with the normal source. Both players must load a compatible frontend version.

## Local checks

`npm run dev` serves the game. In another terminal, `npm run relay:dev` starts the local room service on port 8787 with local-only Turnstile bypass. For a local room, set the advanced relay address to `http://localhost:8787`. Two browser profiles or `localhost:5173` and `127.0.0.1:5173` provide separate localStorage seats. Do not use two same-origin tabs to represent different players; they deliberately share a saved identity.

`npm run rooms:test` checks both seats and all mode/rules combinations, preparation/copy/redraw, faction selection and scoring symmetry, invalid actions, persisted deck/token recovery, duplicate IDs, storage failure, stale actions, and real local Durable Object approval/message/size/origin/close behavior through Miniflare. Existing tabletop/headless/opponent/test-deck/regression checks cover the preserved AI path. `npx wrangler deploy --config relay/wrangler.jsonc --dry-run` verifies the deployment bundle without publishing.

## Verification recorded 2026-10-20

9 room tests,18 tabletop,17 headless,10 opponent and4 test-deck tests pass, plus the original regression smoke, lint, GitHub Pages-base production build and Wrangler deployment dry-run. Browser checks used independent localhost/127.0.0.1 storage: create/approve, picks in both directions, refresh both seats without reapproval, guest discard/refill, host-only settings, and return to the preserved AI game. Disposable local test room closed. Compatible development dependency security updates were applied; npm audit reported zero vulnerabilities. Production authentication, Turnstile setup and publishing subsequently completed; see the setup update above.
