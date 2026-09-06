# Icy Tower — Frostbound

A playable 2.5D arcade tower climber. Three.js renders the scene; a fixed-step simulation owns movement, one-way ledges, momentum jumps, wall rebounds, crystals, combo chains, and the rising storm.

## Play

- A/D or left/right arrows: move
- Space, W, or up arrow: jump (press again for the next jump)
- Escape/P: pause
- Enter: begin/retry
- Touch controls appear on narrow screens

Run to jump higher. Land on new floors within 3.8 seconds to extend a combo. Arcade's storm begins after 10 seconds. Practice removes the timed chase; falling behind the camera still ends the run. Personal records are saved on this browser.

## Development

`npm install`, then `npm run dev -- --port 5188`.

`npm test` checks jump height, landings, wall rebounds, buffering, coyote time, pause, frost, restart, frame-rate independence, and a simulated 35-floor climb through five generated layouts.

`npm run typecheck`, `npm run lint`, and `npm run build` validate source and production output.

## Art and sound

- `public/assets/cathedral.png`: original AI-generated cathedral environment art.
- `public/assets/climber.glb`: custom Blender expedition climber with separate limb pivots, modeled clothing, fleece, goggles, boots, backpack, and ice axe.
- `scripts/climber.blend`: editable Blender source.
- `scripts/build-climber.py`: rebuilds the character asset with Blender 5.2.
- Ledges and architectural geometry use physically based materials with procedural surface detail. Static meshes are batched by material.
- Wind, ambient tones, movement, and crystal sounds are synthesized locally. No audio service is required.

This is an independent Icy Tower-inspired browser prototype, with no original game assets or affiliation. It is not a commercial AAA release. High quality enables bloom and soft shadows; performance quality reduces rendering cost. WebGL is required.

## Validation notes

The gameplay simulation is covered by automated tests. The GLB is checked for a valid 1.6-metre upright model and named animation pivots, and its Blender render is inspected. Browser visual and interactive QA have not been performed. Optional WebMCP actions are feature-detected; no supported WebMCP runtime was available to verify registration here.
