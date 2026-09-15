# Two-player race

A private, live race to floor 20. Both players get one attempt on the same Classic tower. Falling ends that player's climb. If neither reaches the goal, the highest verified floor wins when both climbs end or the 90-second clock expires. Equal floors draw. No collisions between players, accounts, ranked score submissions, or cosmetic progression are introduced by race mode.

## Acceptance criteria

| Feature | Acceptance criteria |
| --- | --- |
| Private room | Create a room and share a link. Two independent browsers can join. Simultaneous third-player joins are rejected. The link contains no player session token. |
| Ready and countdown | Both players must ready up. Both see the same server start time and seed. No controls advance the simulation before the countdown ends. A player may withdraw readiness before the start. |
| Fair course | Both clients use rules version 5 and an identical seed. Floors 1–20 contain no moving ledges, keeping the complete race course identical despite different climbing speeds. Gameplay stays independent of the rival's position. |
| Live opponent | Both players see the rival's floor and a translucent climber in the tower. Positions update over HTTP every 500 ms and interpolate between updates. Old packets cannot roll back a newer position or round. |
| Controls and layout | A/D or arrow keys move, Space/Up/W jump. Touch controls support simultaneous movement and jumping. Losing focus releases controls; the live clock continues. The lobby, HUD, and results fit mobile screens. |
| Verified result | Submitted controls reproduce the goal, fallen run, or timed run on the server. Wrong seeds, incompatible versions, pauses, malformed inputs, input beyond the finish, and recordings ahead of the match clock are rejected. Rival position claims cannot determine the winner. |
| Finishing order | The server's receipt time orders verified goal finishes. A two-second settlement window collects the other player's finish. Equal verified goal receipt times draw. A later simulation with fewer frames cannot override an earlier real finish. |
| Connection loss | Transient requests retry automatically without restarting the climb. Fifteen seconds without contact forfeits. Explicit departure is reported immediately. Reloading an active round forfeits instead of granting a new attempt. |
| Rematch | One player can request a rematch, and the other must accept. Both then receive one new seed and countdown in the same room. Old-round requests cannot leave, finish, ready, or restart the next round. |
| Lifetime and isolation | Rooms expire after an hour and are swept hourly on Netlify. Stored tokens are hashed, never returned to the rival. Only authenticated room members may read or update a room. Solo gameplay, saved replays, and rankings retain their rules. |

## Backend and deployment

`netlify/functions/race.ts` uses strongly consistent, site-wide [Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/) with conditional writes. The two-player room is one bounded record; concurrent joins, ready changes, and finishes use compare-and-swap retries. Public replies explicitly exclude token hashes and internal sequence state. No secrets are embedded in the invite URL.

The function accepts same-origin JSON POST requests, bounds request sizes and recording duration, and applies a rate limit large enough for two players behind the same IP. `race-cleanup.ts` removes expired room records hourly. No new environment variables are required when running on the linked Netlify site.

`npm run dev` installs a Vite middleware using the same HTTP handler and room service with a bounded memory store. Two local browsers share those rooms; a dev server restart clears them. Production always uses Netlify Blobs, never the memory adapter. Rooms have no chat, audio capture, matchmaking, or player collisions.

This polling transport prioritizes compatibility with the current hosting. It adds up to a polling interval plus network delay to the rival's visible position and to finish submission. Local movement remains immediate. Higher-stakes ranked play would need a dedicated real-time authoritative server and a different latency policy.

## Verification

Run affected tests with:

```sh
node --test tests/race-client.test.ts tests/race-server.test.ts tests/tower-engine.test.ts tests/tower-ghost.test.ts tests/leaderboard.test.ts tests/tower-routes.test.ts tests/tower-input.test.ts
npm run typecheck
npm run build:netlify
```

The multiplayer tests cover two independent clients completing a race, countdown timing, rival updates, verified results, simultaneous joins, rematches, disconnects, expiration, malformed requests, HTTP boundaries, and two service instances backed by the real local Blobs emulator. The emulator currently omits ETags on GET; that test takes the same ETag from its list response before exercising conditional writes.

Manual browser checks: create a room, open the link in a second tab/device, ready both, climb and observe the rival, finish or leave, compare the result, and accept a rematch. Repeat at a narrow viewport with touch controls. Network latency and separate physical mobile networks need field testing beyond local browser verification.
