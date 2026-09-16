# Development guide

[← Back to README](../README.md)

Local setup, validation, assets, and deployment. The game uses Three.js rendering with a fixed-step gameplay simulation.

- [Development](#development)
- [Art and sound](#art-and-sound)
- [Validation notes](#validation-notes)
- [Netlify](#netlify)

## Development

Requires Node.js 22.13.0 or newer.

```sh
npm install
npm run dev -- --port 5188
```

Open [localhost:5188](http://localhost:5188).

`npm test` checks jump height, landings, wall rebounds, buffering, coyote time, pause, frost, restart, downward camera tracking, recoverable falls, floor-triggered scrolling, uncapped 30-second acceleration, high-floor wall boosts, legacy rules compatibility, frame-rate independence, simultaneous touch and keyboard input, stage collisions, legacy and current leaderboard recordings, Party springs and gravity, timed double jumps, separate ranked storage, and a simulated 105-floor climb through five generated layouts.

Run source checks and build the production output:

```sh
npm run typecheck
npm run lint
npm run build
```

For race-specific checks, see [multiplayer verification](multiplayer.md#verification). For human testing, see the [playtest protocol](playtesting.md).

## Art and sound

- The cathedral interior is real 3D geometry: deep window bays, Gothic arches, masonry, side aisles, vault ribs, lanterns, and icicles. A fixed pool of architecture extends the tower as you climb. Perspective, drifting window light, light shafts, and snow provide depth and movement; no background image is used.
- [public/assets/harold.glb](../public/assets/harold.glb): custom 3D recreation of the original Harold look: oversized blue beanie, green crown sweater, olive trousers, brown shoes, and a broad grin. Separate limb pivots support running, jumping, and star-shaped spins.
- [scripts/climber.blend](../scripts/climber.blend): editable Blender source.
- [scripts/build-climber.py](../scripts/build-climber.py): rebuilds the character asset with Blender 5.2.
- Ledges and architectural geometry use physically based materials with procedural surface detail. Static meshes are batched by material.
- Movement, snow landings, glass pickups, ice hazards and wind use 23 locally bundled CC0 audio clips (about 755 KiB). Jump, landing, wall and pickup variations reduce repetition; combo melodies and frenzy rhythm remain synchronized synthesized cues. A bounded mixer controls overlapping effects, pause/mute/retry stop active effects, and synthesis is the immediate fallback while recordings load or if a file fails. See [public/audio/ATTRIBUTION.md](../public/audio/ATTRIBUTION.md) for sources and rebuilding instructions.
- Background music is **Black Diamond** by **Joth**, a CC0 143 BPM winter-themed drum-and-bass loop. The local MP3 streams quietly under gameplay, dips during warnings/rewards, and pauses/resumes with the game. **Menu → Settings → Background music** (or the race header's music button) can mute it independently of effects; **Sound** still mutes everything. Music credits and reproducible conversion details are in [public/audio/ATTRIBUTION.md](../public/audio/ATTRIBUTION.md) and [scripts/prepare-music.py](../scripts/prepare-music.py).

This is an independent Icy Tower-inspired browser prototype, with no original game assets or affiliation. It is not a commercial AAA release. High quality enables bloom and soft shadows; performance quality reduces rendering cost. WebGL is required.

## Validation notes

The gameplay simulation is covered by automated tests. The GLB is checked for a valid upright model and named animation pivots, and its Blender render is inspected. Motion checks cover full loops in both directions, extended limbs on the real model, takeoff speed, landing recovery, and paused animation. Trail checks cover emission, positioning behind the player, lifetime, pause, and reset. Interior checks cover bounded shared geometry and stable architecture through climbs, falls, and long runs. The replayability update was checked in a browser at desktop and phone viewport sizes for guided practice, pause/resume, daily selection and links, reload persistence, and the local measurements dialog. Gameplay mechanics and archived replay compatibility have automated coverage; real human playtesting remains pending. Optional WebMCP actions are feature-detected.

## Netlify

[Play the deployed game](https://icy-tower-frostbound.netlify.app).

The public GitHub repository is connected to Netlify. Pushes to `main` automatically build and publish the game.

`npm run build:netlify` produces a static export in `dist/client`. [netlify.toml](../netlify.toml) configures that build for Netlify. From the linked project, publish it with `netlify deploy --prod --dir=dist/client`. The normal development command and Sites build remain available.

See [asset attribution](../public/assets/ATTRIBUTION.md) and the [README cover prompt](cover-prompt.md) for additional art credits and provenance.
