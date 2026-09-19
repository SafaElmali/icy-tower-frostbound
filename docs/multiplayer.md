# Multiplayer race

[← Back to README](../README.md)

- [How to race](#how-to-race)
- [Acceptance criteria](#acceptance-criteria)
- [Backend and deployment](#backend-and-deployment)
- [Verification](#verification)

## How to race

Open **Menu → Race a friend**, choose your name and climbing kit, create a private lobby, and share its invite. Guests choose their own name and kit before joining. Private races offer all existing hat and sweater colors; this does not change solo wardrobe unlocks. Your choice is saved in this browser and can be edited in the lobby before you ready up. Names are limited to 20 characters. The host chooses a finish floor from 5–100, a one-, two-, three-, or five-minute limit, and optional shoving. Everyone in the room readies up on the same static tower. Falls return you to the last five-floor checkpoint so you can keep racing. The default is floor 30 with a three-minute clock.

The goal or timer ends the race; higher verified floors win, and ties for the highest verified floor draw. Goal scores stop at the selected finish floor. Results use verified final scores instead of stale rival positions, and finished climbers rest on a ledge. All players can accept a rematch using the same lobby rules.

Frost bats and falling ice add obstacles throughout the shared course. Obstacles use the same appearance as normal mode, without ice landing guides, countdown bars, or bat spawn markers. Each five-floor band has its own seeded ice lane and bat path, so players at the same place and race time face the same obstacles. Ice first appears two seconds into the race and repeats every six seconds; bats begin preparing at four seconds and repeat every eight. Ice waits 1.1 seconds before falling and bats wait 0.85 seconds before crossing. Obstacles knock climbers back without ending the race.

A visible ice shield briefly protects you from both obstacles and shoves: 1.65 seconds after an obstacle hit, 1.6 seconds after checkpoint recovery, or 1.1 seconds after a shove. The shield appears around both your climber and protected rivals, and a small **Shielded** indicator confirms your protection. It disappears when protection ends or the climb finishes.

Keyboard and touch controls work. With shoves enabled, press **E** or the shove button while facing a nearby friend. Shoves have a 1.5-second cooldown and respawn protection. A short connection interruption retries automatically; leaving, reloading during a race, or losing contact for 15 seconds forfeits. Race results stay separate from solo rankings and progression. Rooms support 2–4 players and expire after an hour. A departure forfeits that player; remaining players continue until only one is left or the race ends.

Rivals appear as solid, fully colored climbers wearing their chosen kits, with names above them. Solo replay ghosts retain their translucent appearance. Each rival uses buffered 20 Hz WebRTC position updates, with smooth HTTP fallback when a direct connection cannot be established. No TURN relay is configured, so restricted networks can have more visible delay. The server verifies controls, checkpoint recoveries, and accepted shove events.

All players begin on one shared countdown. Reaching the goal opens a three-second result settlement window; race mode leaves saved solo replays unchanged.

## Acceptance criteria

| Feature              | Acceptance criteria                                                                                                                                                                                                                                                                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Private lobby        | Create a room and share a link with no player credentials in it. Four independent browsers can join. Simultaneous joins beyond the four-player cap are rejected.                                                                                                                                                                                                                    |
| Player identity      | Each member chooses a name (up to 20 characters), hat, and sweater. Profiles are shared with every member, editable only before readiness, and retained for rematches. Malformed cosmetics fall back to catalog defaults. Rival materials and outfits are independent from the local character and other rivals; solo replay ghosts stay translucent. |
| Host rules           | The host chooses an integer finish floor from 5–100, a one-, two-, three-, or five-minute limit, and whether shoving is enabled. The guest sees the same saved rules. Invalid settings and guest edits are rejected.                                                                                                                                                 |
| Ready and countdown  | All joined players must ready up (minimum two). Everyone receives the same seed and start time. Changing rules cancels readiness and a pending countdown; active-round rules are locked. Controls do not advance the simulation before the countdown ends.                                                                                                                                    |
| Fair course          | Both clients and the verifier use race rules version 6 with static platforms, including above floor 24, and deterministic bats and falling ice. Course bands, obstacle positions, warning times, and collisions use the same seed and simulation frames. Solo rules remain unchanged. |
| Obstacles and shields | Every five-floor band includes falling ice near its third floor and a bat crossing near its fifth. Obstacle hits knock the climber back; short visible protection prevents consecutive hits and shoves. Local and rival shields disappear at expiry or race completion. Stale rival packets cannot prolong protection indefinitely. |
| Fall recovery        | A fallen climber continues visibly downward during a brief recovery cue, then returns to the most recent five-floor checkpoint. Nearby ledges and the camera restore with the checkpoint. A short protection period prevents an immediate shove. Falling never submits a final result.                                                                               |
| Live rival           | Direct data-channel pose updates animate the rival continuously with buffered interpolation. HTTP room updates remain available when a direct connection is unavailable. Old poses, duplicate frames, and old-round packets cannot roll back the rival. A completed rival remains visible on a ledge.                                                                |
| Accurate score       | The local climb stops at the selected goal. A finish request includes its latest pose, and the server replaces its displayed floor with the replay-verified result. Results use verified floors rather than an older rival update.                                                                                                                                   |
| Draws and results    | Equal verified floors always produce a draw, even if their recordings arrive at different times. Goal scores clamp to the configured target. Finished players rest on a visible platform instead of freezing in mid-air.                                                                                                                                             |
| Optional shoves      | When enabled, a player can shove a nearby rival they are facing. Both players must have recent poses and be active and unprotected. The server enforces range, facing, a 1.5-second cooldown, and round membership. It issues a fixed impulse event, with no client-selected strength.                                                                               |
| Replay verification  | The server replays recorded controls, checkpoint recoveries, and accepted shove events using the same simulation. Wrong seeds or versions, malformed controls, excessive duration, input after the finish, forged shove IDs, wrong recipients, duplicate events, and events before the victim's known frame are rejected. Pose claims do not determine final height. |
| Controls and layout  | Keyboard and touch movement/jumping remain available. Shoving has its own control when enabled. Losing focus releases held inputs while the shared clock continues. Lobby, HUD, and results fit narrow screens.                                                                                                                                                      |
| Connection loss      | Temporary request failures retry without restarting the climb. Fifteen seconds without contact forfeits. Explicit departure is reported immediately. Reloading an active round forfeits; ordinary falls recover in the current round.                                                                                                                                |
| Rematch              | All players must agree. One new seed and countdown start in the same room with the saved rules. Old-round actions cannot affect the next round. Existing direct-connection signaling survives the rematch, while shove events reset.                                                                                                                                |
| Lifetime and privacy | Rooms expire after an hour and are swept hourly. Only authenticated members can access a room. Tokens are stored as hashes and excluded from public views. Rooms created with an incompatible older protocol return a clear request to create a new room.                                                                                                            |

## Backend and deployment

`netlify/functions/race.ts` uses strongly consistent, site-wide [Netlify Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/) with conditional writes. Each bounded room record includes membership, rules, readiness, connection signaling, shove events, and results. Compare-and-swap retries resolve simultaneous joins and updates. Public replies explicitly exclude token hashes and internal sequence and cooldown state.

The function accepts same-origin JSON POST requests, bounds request and signaling sizes, and limits request volume. Each pair negotiates independently: the lower player slot sends offers and the higher slot answers the matching generation. New offers discard stale answers for that pair. The application does not request camera or microphone access.

`npm run dev` installs a Vite middleware with the same HTTP handler and room service using a bounded memory store. Two local browsers share those rooms; restarting the development server clears them. Production uses Netlify Blobs. No new backend account or race storage environment variable is required on the linked Netlify site.

Direct rival poses use a 20 Hz WebRTC data channel and Google STUN. There is no TURN relay configured; networks that cannot connect directly use the HTTP fallback, which waits 500 ms after each response. Direct connections keep room heartbeats at one second. Buffered interpolation smooths both paths, though fallback movement carries more delay.

The immediate local simulation and direct rival updates suit private casual races. The server verifies results and authenticates shove events, but shove proximity depends on recent client-reported poses. Competitive ranked combat would need a server that continuously simulates all players and an explicit latency policy.

## Verification

Run affected tests with:

```sh
node --test tests/race-profile.test.ts tests/race-appearance.test.ts tests/race-client.test.ts tests/race-server.test.ts tests/race-simulation.test.ts tests/race-peer.test.ts tests/race-rival-shield.test.ts tests/tower-engine.test.ts tests/tower-ghost.test.ts tests/leaderboard.test.ts tests/tower-routes.test.ts tests/tower-input.test.ts
npm run typecheck
npm run build:netlify
```

The multiplayer checks cover independently connected clients, countdowns, configurable rules, checkpoint replay, tied finishes, terminal score synchronization, static high-floor courses, deterministic obstacle warnings and collisions, shield synchronization and expiry, signaling, authenticated shove events, malformed requests, stale rounds, rematches, disconnects, expiration, and real local Blobs storage. The Blobs emulator omits ETags on GET; its storage test reads the same ETag from a list response before conditional writes.

Manual checks: create a lobby, change the finish floor, join from another browser, ready all players, climb past floor 20 in a taller race, fall and recover, observe the moving rival, enable shoves in a fresh lobby, compare all result screens, and accept a rematch. Repeat at a narrow viewport and on separate networks.

Obstacle checks: watch ice fall and bats cross the tower without landing guides or spawn markers. Take a hit, confirm the local and rival shields, and verify the next obstacle or shove cannot knock you back during protection. Recover at a checkpoint and confirm its shield clears. End the race during protection and confirm shields disappear. Check that guides remain hidden and shields stay readable with reduced motion enabled.

Identity checks: join four browsers with distinct names and kits; confirm names and outfits on each screen, edit a kit before readiness, verify editing locks after readiness, and confirm all identities survive a rematch. Reload the pre-race screen to check browser persistence. Check long names and outfit controls on a narrow viewport.
