# Two-player race

Create a private lobby, choose the finish floor and time limit, and share its invite. The default race is to floor 30 with a three-minute clock. Both players use the same static course and begin on one shared countdown. Falling returns a player to their last five-floor checkpoint after a short recovery; it does not end their race. The host can optionally enable shoving for an extra challenge.

Reaching the goal ends the climb and opens a three-second result settlement window. The higher verified floor wins, and equal verified floors always draw, including when both players reach the goal. Goal scores stop at the selected finish floor. If the clock expires first, the same height comparison applies. Race mode does not change solo rankings, progression, or saved replays.

## Acceptance criteria

| Feature              | Acceptance criteria                                                                                                                                                                                                                                                                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Private lobby        | Create a room and share a link with no player credentials in it. Two independent browsers can join. Simultaneous third-player joins are rejected.                                                                                                                                                                                                                    |
| Host rules           | The host chooses an integer finish floor from 5–100, a one-, two-, three-, or five-minute limit, and whether shoving is enabled. The guest sees the same saved rules. Invalid settings and guest edits are rejected.                                                                                                                                                 |
| Ready and countdown  | Both players must ready up. Both receive the same seed and start time. Changing rules cancels readiness and a pending countdown; active-round rules are locked. Controls do not advance the simulation before the countdown ends.                                                                                                                                    |
| Fair course          | Both clients and the verifier use rules version 5 with race-only static platforms, including above floor 24. The same seed produces the same complete course. Solo moving platforms and later solo rules remain unchanged.                                                                                                                                           |
| Fall recovery        | A fallen climber continues visibly downward during a brief recovery cue, then returns to the most recent five-floor checkpoint. Nearby ledges and the camera restore with the checkpoint. A short protection period prevents an immediate shove. Falling never submits a final result.                                                                               |
| Live rival           | Direct data-channel pose updates animate the rival continuously with buffered interpolation. HTTP room updates remain available when a direct connection is unavailable. Old poses, duplicate frames, and old-round packets cannot roll back the rival. A completed rival remains visible on a ledge.                                                                |
| Accurate score       | The local climb stops at the selected goal. A finish request includes its latest pose, and the server replaces its displayed floor with the replay-verified result. Results use verified floors rather than an older rival update.                                                                                                                                   |
| Draws and results    | Equal verified floors always produce a draw, even if their recordings arrive at different times. Goal scores clamp to the configured target. Finished players rest on a visible platform instead of freezing in mid-air.                                                                                                                                             |
| Optional shoves      | When enabled, a player can shove a nearby rival they are facing. Both players must have recent poses and be active and unprotected. The server enforces range, facing, a 1.5-second cooldown, and round membership. It issues a fixed impulse event, with no client-selected strength.                                                                               |
| Replay verification  | The server replays recorded controls, checkpoint recoveries, and accepted shove events using the same simulation. Wrong seeds or versions, malformed controls, excessive duration, input after the finish, forged shove IDs, wrong recipients, duplicate events, and events before the victim's known frame are rejected. Pose claims do not determine final height. |
| Controls and layout  | Keyboard and touch movement/jumping remain available. Shoving has its own control when enabled. Losing focus releases held inputs while the shared clock continues. Lobby, HUD, and results fit narrow screens.                                                                                                                                                      |
| Connection loss      | Temporary request failures retry without restarting the climb. Fifteen seconds without contact forfeits. Explicit departure is reported immediately. Reloading an active round forfeits; ordinary falls recover in the current round.                                                                                                                                |
| Rematch              | Both players must agree. One new seed and countdown start in the same room with the saved rules. Old-round actions cannot affect the next round. Existing direct-connection signaling survives the rematch, while shove events reset.                                                                                                                                |
| Lifetime and privacy | Rooms expire after an hour and are swept hourly. Only authenticated members can access a room. Tokens are stored as hashes and excluded from public views. Rooms created with an incompatible older protocol return a clear request to create a new room.                                                                                                            |

## Backend and deployment

`netlify/functions/race.ts` uses strongly consistent, site-wide [Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/) with conditional writes. Each bounded room record includes membership, rules, readiness, connection signaling, shove events, and results. Compare-and-swap retries resolve simultaneous joins and updates. Public replies explicitly exclude token hashes and internal sequence and cooldown state.

The function accepts same-origin JSON POST requests, bounds request and signaling sizes, and limits request volume. Only the host sends connection offers; only the guest answers the matching generation. A new host offer discards a stale answer. The application does not request camera or microphone access.

`npm run dev` installs a Vite middleware with the same HTTP handler and room service using a bounded memory store. Two local browsers share those rooms; restarting the development server clears them. Production uses Netlify Blobs. No new backend account or race storage environment variable is required on the linked Netlify site.

Direct rival poses use a 20 Hz WebRTC data channel and Google STUN. There is no TURN relay configured; networks that cannot connect directly use the HTTP fallback, which waits 500 ms after each response. Direct connections keep room heartbeats at one second. Buffered interpolation smooths both paths, though fallback movement carries more delay.

The immediate local simulation and direct rival updates suit private casual races. The server verifies results and authenticates shove events, but shove proximity depends on recent client-reported poses. Competitive ranked combat would need a server that continuously simulates both players and an explicit latency policy.

## Verification

Run affected tests with:

```sh
node --test tests/race-client.test.ts tests/race-server.test.ts tests/race-simulation.test.ts tests/race-peer.test.ts tests/tower-engine.test.ts tests/tower-ghost.test.ts tests/leaderboard.test.ts tests/tower-routes.test.ts tests/tower-input.test.ts
npm run typecheck
npm run build:netlify
```

The multiplayer checks cover independently connected clients, countdowns, configurable rules, checkpoint replay, tied finishes, terminal score synchronization, static high-floor courses, signaling, authenticated shove events, malformed requests, stale rounds, rematches, disconnects, expiration, and real local Blobs storage. The Blobs emulator omits ETags on GET; its storage test reads the same ETag from a list response before conditional writes.

Manual checks: create a lobby, change the finish floor, join from another browser, ready both players, climb past floor 20 in a taller race, fall and recover, observe the moving rival, enable shoves in a fresh lobby, compare both result screens, and accept a rematch. Repeat at a narrow viewport and on separate networks.
