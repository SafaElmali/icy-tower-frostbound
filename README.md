![Icy Tower — Frostbound cover: Harold jumping through a frozen cathedral with a colorful star trail](docs/images/frostbound-cover.png)

# Icy Tower — Frostbound

A playable 2.5D arcade tower climber. Three.js renders the scene; a fixed-step simulation owns movement, one-way ledges, momentum jumps, wall rebounds, full somersaults on fast jumps, crystals, combo chains, and the rising storm.

## Play

- A/D or left/right arrows: move
- Space, W, or up arrow: jump (press again for the next jump)
- Escape/P: pause
- Enter: begin/retry
- On phones and touch tablets: hold left/right with one thumb and tap JUMP with the other. Slide across the direction pad to turn; release JUMP before the next jump.

Run to jump higher. At high speed, Harold spreads his arms and legs into a star-shaped 360° spin and straightens before landing. Active combos leave a rotating, multicolored five-point star trail behind him. Land on new floors within 3.8 seconds to extend a combo. Arcade scrolling starts when you reach floor 5, making ledges descend even when you stand still. The pace increases every 30 seconds without a speed cap, so the rising frost eventually overtakes a slow climb. A small line below the score shows elapsed play time and the current pace level, including on short and touch screens. Pausing freezes the clock and pace progression. **Run details** also shows time and pace. The camera tracks downward falls to reveal recovery ledges, while the frost keeps advancing independently. Practice disables automatic scrolling; falling into the frost still ends the run. Personal records are saved on this browser.

While airborne beside a wall, release and tap JUMP to launch up and away, even with little horizontal speed. The push briefly resists the incoming direction so you can turn reliably above floor 90. Land or jump from the opposite wall before boosting from the same wall again. Fast automatic rebounds still work.

Every 10th floor has a wooden number plaque on its front edge. Every 50th floor is a full-width landing stage, providing room to land and build momentum before the next climb. Stages still scroll toward the frost like other floors.

The layout supports portrait and landscape, device safe areas, and scrolling menus on short screens. Rotating the device or leaving the game pauses the run and clears held controls. Touch devices start in Performance quality; change quality under **Menu → Settings**. Leaderboard dialogs adjust to the visible screen when the on-screen keyboard opens.

## Quick challenges

Each climb starts three fresh challenges: reach floor 30 with an unbroken combo, collect 10 crystals, and perform 5 wall jumps. Open **Skill goals → Expert challenges** to inspect these optional per-run challenges. The gameplay HUD features one progressive skill goal instead. The combo challenge starts with your first higher-floor landing; letting the 3.8-second timer expire before reaching floor 30 fails it for that run. Passing floor 30 in the air is not enough — land on floor 30 or higher. Wall jumps count fast airborne wall rebounds and controlled wall boosts, not ground-level wall impacts. Completed challenges stay complete until you start again. Challenges work in Classic, Party, and Practice and do not change scoring.

## Learning and replayability

The title screen keeps **Play** as its primary action. **Menu** holds modes, daily towers, guided practice, skill goals, outfits, and the leaderboard; audio, visual quality, and reduced motion sit under its collapsed **Settings** section. The featured skill goal appears during a climb and under **Run details** after finishing. The compact end screen shows the floor, score, combo, and retry action; the detailed report and sharing actions stay one click away.

- **Guided practice** starts an unranked climb with contextual movement, jump, and momentum tips. Ordinary climbs also teach first-time players. Completed steps and Skip tips persist locally; **Menu → How to play → Replay guidance in Practice** starts the lessons again. Ranked physics remain consistent. A four-second cue announces automatic frost scrolling at floor five.
- **Skill goals** feature one achievable target during a climb. Eleven milestones progress from floor five, one crystal, and one airborne wall rebound to combined skills and longer climbs. Completed goals persist across runs; partial counters belong to the current attempt. Select any unlocked goal in the progression dialog. All three modes can teach these skills.
- **Run details** explains a recorded walk off a ledge, a fall into the frost, or frost reaching a ledge, with a practical next-run tip. Ambiguous endings receive general advice. The retry button appears immediately after the headline stats, and Enter retries without another menu.
- **Personal progress** keeps independent highest-floor, combo, and wall-rebound records for each mode. **Run details** compares with the records from before the run. A small wall plaque marks the previous highest floor and briefly celebrates passing it.
- **Route choices** begin at floor 12 and recur every 12 floors, excluding sections that overlap full-width stages. Wide pale steps offer a forgiving climb; a running jump can reach a narrow gold-topped crystal shortcut. Signs on takeoff platforms show both choices. Rules version 5 pins the new layouts; earlier leaderboard recordings and friend links retain their original layouts and physics. Live ghost racing uses the current rules.
- **Daily tower** gives everyone one Classic tower per UTC date with unlimited retries. Daily links pin their date and rules, so old links remain playable after midnight. The best completed attempt is saved per tower, with up to 90 daily records stored in this browser. Daily runs can also be submitted to the existing Classic board; there is no separate online daily ranking.
- **Tower sections** change architecture, windows, and lighting at floors 25, 50, and 75, progressing from warm stone to icy blue, violet, and aurora. Existing geometry is reused without loading new areas or changing collisions.
- **Combo feedback** adds distinct musical phrases and captions at 3, 5, 10, and 15. Each milestone sounds once per chain; large jumps announce the highest crossing. Muted play retains captions. **Menu → Settings → Reduce motion** suppresses shake, spins, particles, and trails; the system preference applies until explicitly overridden.
- **Playtest measurements**, under **Menu → How to play**, records starts, completed goals, finishes, and abandoned climbs on this browser only. The report separates modes, device categories, and feature versions; includes session replay and next-day return; and exports JSON. Records are capped at 300 runs. There is no automatic upload or population dashboard. See [the playtest protocol](docs/playtesting.md) for recruitment, predefined evaluation criteria, and combining participant exports. Human participant sessions remain to be conducted.

## Unlockable outfits

Open **Menu → Outfits** to change your look. Equip a hat, sweater, and star-trail palette independently; colors update on the climber immediately. The outfit picker shows the same 3D character walking and gently turning, with stars that update as you equip items. Its preview can be paused independently and stays visible while the collection scrolls. The original blue beanie, green knit, and rainbow stars are always available.

| Achievement | Reward |
| --- | --- |
| Reach floor 10 | Frost beanie |
| Reach floor 50 | Summit beanie |
| Score 1,000 in one run | Berry knit |
| Score 5,000 in one run | Aurora knit |
| Land a 5× combo | Glacier stars |
| Land a 15× combo | Sunset stars |

Classic, Party, and Practice all earn rewards as soon as milestones are reached. Personal bests count across sessions, and existing saved floor/score records earn their corresponding rewards. Progress and equipped items are stored on this browser; clearing browser storage resets them. If storage is unavailable, the wardrobe works for the current session. Trails still require an airborne combo of at least 2×.

New leaderboard entries save the outfit equipped when submitted and show its three badges beside the name. Older entries use the original outfit. Cosmetic IDs are checked against the catalog, but unlock ownership is device-local and client-reported; cosmetics do not affect server-verified scores or ranking.

## Party mode

Choose **Party** from the mode selector before starting. Lower gravity gives jumps more airtime. Every fifth floor is a pink spring platform that automatically launches you higher when you land; the full-width 50-floor stages remain normal landing spots. Pink crystals grant **8 seconds of double jumps**: release and press jump again in midair for one extra jump per landing. Collect another crystal to refresh the timer. The HUD shows the time remaining and whether a jump is ready; pausing freezes the timer. The same controls work on keyboard and touch.

Party keeps the rising frost and combo scoring, with its own online rankings and browser personal best. Classic retains the original physics and rankings. Practice remains unranked and now saves its personal best separately, too. Existing browser records remain under Classic.

## Race your ghost

Finish an arcade climb to create a translucent blue replay of Harold. On subsequent arcade runs, the ghost repeats that climb alongside you on the same generated tower, including jumps and spins. The HUD shows your height lead in metres and celebrates passing its best floor. Pauses freeze the race, and the ghost never affects collisions, crystals, or scoring.

Your highest completed arcade climb under the current rules becomes the next ghost; score, then shorter duration, break floor ties. One ghost is saved locally in this browser (or kept for the session if storage is unavailable). Practice and abandoned runs do not replace it. Old personal records have no recording, so complete a new run to create your first ghost. Ghosts from earlier physics versions are retired from racing when the rules change; finish a new Classic run to record a compatible ghost. Personal records stay saved. Recordings share the leaderboard limits of 30 minutes and 12,000 input changes; longer runs remain playable but cannot create a ghost.

## Leaderboard

Open **Menu → Leaderboard** to see the all-time top 50 runs on the **Classic** or **Party** tab. After a completed Classic or Party run, choose **Submit score & leaderboard**, enter a public display name, and submit. Scores, floors, combos, and mode-specific physics are replayed and calculated on the server. The verified recording selects the board; Party scores cannot be submitted to Classic rankings. Legacy recordings remain valid under their original rules; version 4 recordings use uncapped pace and controlled wall jumps; version 5 also adds route choices. Practice runs do not qualify; ranked recordings support up to 30 minutes and 12,000 input changes. Ties favor the higher floor, then the faster run.

The leaderboard uses a Netlify Function and site-wide Netlify Blobs storage, so scores persist across deployments and are shared across devices. Conditional writes protect concurrent submissions, and identical recordings cannot be added twice while on the board. Replay validation prevents fabricated score totals; it is not a guarantee against automated play. No login is required, and display names are not reserved identities. The name field is remembered only on the player's device.

The online API runs on Netlify; the plain Vite preview serves only the game frontend. `npm test` includes real local Blobs persistence, replay verification, request validation, and concurrent-write coverage.

## Friend challenges

After a completed run that reaches at least floor 1, choose **Challenge a friend** to share or copy a “Beat my floor 87” link. The link contains that run's tower seed, layout/rules version, mode, floor, and score. Friends open it, choose **Accept challenge**, and climb the same tower; **Retry challenge** and Enter keep that layout and mode. The HUD and results show the targets, with floor and score wins tracked separately. Matching the floor is a tie; climb one higher to beat it.

Classic, Party, and Practice runs can be shared, and a challenge keeps its original mode and rules, including on retry and re-sharing. Older challenges retain capped pace and automatic rebounds; leaving a challenge restores the current rules. Choose **Leave challenge** on the title screen to return to random towers. Invalid or unsupported links show a message and allow a normal climb. If native sharing or clipboard access is unavailable, the share dialog has a selectable link for manual copying. Challenge targets are informal, editable link data; leaderboard submissions still require server replay verification.

## Development

`npm install`, then `npm run dev -- --port 5188`.

`npm test` checks jump height, landings, wall rebounds, buffering, coyote time, pause, frost, restart, downward camera tracking, recoverable falls, floor-triggered scrolling, uncapped 30-second acceleration, high-floor wall boosts, legacy rules compatibility, frame-rate independence, simultaneous touch and keyboard input, stage collisions, legacy and current leaderboard recordings, Party springs and gravity, timed double jumps, separate ranked storage, and a simulated 105-floor climb through five generated layouts.

`npm run typecheck`, `npm run lint`, and `npm run build` validate source and production output.

## Art and sound

- The cathedral interior is real 3D geometry: deep window bays, Gothic arches, masonry, side aisles, vault ribs, lanterns, and icicles. A fixed pool of architecture extends the tower as you climb. Perspective, drifting window light, light shafts, and snow provide depth and movement; no background image is used.
- `public/assets/harold.glb`: custom 3D recreation of the original Harold look: oversized blue beanie, green crown sweater, olive trousers, brown shoes, and a broad grin. Separate limb pivots support running, jumping, and star-shaped spins.
- `scripts/climber.blend`: editable Blender source.
- `scripts/build-climber.py`: rebuilds the character asset with Blender 5.2.
- Ledges and architectural geometry use physically based materials with procedural surface detail. Static meshes are batched by material.
- Wind, ambient tones, movement, and crystal sounds are synthesized locally. No audio service is required.

This is an independent Icy Tower-inspired browser prototype, with no original game assets or affiliation. It is not a commercial AAA release. High quality enables bloom and soft shadows; performance quality reduces rendering cost. WebGL is required.

## Validation notes

The gameplay simulation is covered by automated tests. The GLB is checked for a valid upright model and named animation pivots, and its Blender render is inspected. Motion checks cover full loops in both directions, extended limbs on the real model, takeoff speed, landing recovery, and paused animation. Trail checks cover emission, positioning behind the player, lifetime, pause, and reset. Interior checks cover bounded shared geometry and stable architecture through climbs, falls, and long runs. The replayability update was checked in a browser at desktop and phone viewport sizes for guided practice, pause/resume, daily selection and links, reload persistence, and the local measurements dialog. Gameplay mechanics and archived replay compatibility have automated coverage; real human playtesting remains pending. Optional WebMCP actions are feature-detected.

## Netlify

Play: https://icy-tower-frostbound.netlify.app

The public GitHub repository is connected to Netlify. Pushes to `main` automatically build and publish the game.

`npm run build:netlify` produces a static export in `dist/client`. `netlify.toml` configures that build for Netlify. From the linked project, publish it with `netlify deploy --prod --dir=dist/client`. The normal development command and Sites build remain available.
