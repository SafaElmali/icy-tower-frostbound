# Icy Tower — Frostbound

A playable 2.5D arcade tower climber. Three.js renders the scene; a fixed-step simulation owns movement, one-way ledges, momentum jumps, wall rebounds, full somersaults on fast jumps, crystals, combo chains, and the rising storm.

## Play

- A/D or left/right arrows: move
- Space, W, or up arrow: jump (press again for the next jump)
- Escape/P: pause
- Enter: begin/retry
- Touch controls appear on narrow screens

Run to jump higher. At high speed, Harold tucks into a forward 360° somersault and straightens before landing. Land on new floors within 3.8 seconds to extend a combo. Arcade scrolling starts when you reach floor 5, making ledges descend even when you stand still. The pace increases every 30 seconds, up to five increases. The camera tracks downward falls to reveal recovery ledges, while the frost keeps advancing independently. Practice disables automatic scrolling; falling into the frost still ends the run. Personal records are saved on this browser.

## Development

`npm install`, then `npm run dev -- --port 5188`.

`npm test` checks jump height, landings, wall rebounds, buffering, coyote time, pause, frost, restart, downward camera tracking, recoverable falls, floor-triggered scrolling, 30-second acceleration, frame-rate independence, and a simulated 35-floor climb through five generated layouts.

`npm run typecheck`, `npm run lint`, and `npm run build` validate source and production output.

## Art and sound

- `public/assets/cathedral.png`: original AI-generated cathedral environment art.
- `public/assets/harold.glb`: custom 3D recreation of the original Harold look: oversized blue beanie, green crown sweater, olive trousers, brown shoes, and a broad grin. Separate limb pivots support running, jumping, and tucked somersaults.
- `scripts/climber.blend`: editable Blender source.
- `scripts/build-climber.py`: rebuilds the character asset with Blender 5.2.
- Ledges and architectural geometry use physically based materials with procedural surface detail. Static meshes are batched by material.
- Wind, ambient tones, movement, and crystal sounds are synthesized locally. No audio service is required.

This is an independent Icy Tower-inspired browser prototype, with no original game assets or affiliation. It is not a commercial AAA release. High quality enables bloom and soft shadows; performance quality reduces rendering cost. WebGL is required.

## Validation notes

The gameplay simulation is covered by automated tests. The GLB is checked for a valid upright model and named animation pivots, and its Blender render is inspected. Motion checks cover full loops in both directions, takeoff speed, landing recovery, and paused animation. Browser visual and interactive QA have not been performed. Optional WebMCP actions are feature-detected; no supported WebMCP runtime was available to verify registration here.
