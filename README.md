![Icy Tower — Frostbound cover: Harold jumping through a frozen cathedral with a colorful star trail](docs/images/frostbound-cover.png)

# Icy Tower — Frostbound

A playable 2.5D arcade tower climber built with Three.js. Build momentum, chain jumps, and climb a frozen cathedral before the rising frost catches you.

**[Play in your browser](https://icy-tower-frostbound.netlify.app)** · [Gameplay guide](docs/gameplay.md) · [Development guide](docs/development.md)

## Gameplay trailer

Wall jumps, Party double jumps, crumbling floors, falling icicles, frost bats, and a race with a friend — in 18 seconds.

https://github.com/user-attachments/assets/95bce11a-1ef0-41e0-ac6b-309b7eed7533

## Play

| Action | Keyboard |
| --- | --- |
| Move | A/D or ←/→ |
| Jump | Space, W, or ↑; release before jumping again |
| Pause | Escape or P |
| Begin / retry | Enter |

On touch screens, hold left/right with one thumb and tap **JUMP** with the other.

Run to jump higher, use wall jumps to recover, and land on new floors within 3.8 seconds to keep your combo. Automatic scrolling begins at floor 5 and speeds up as you climb. Watch for crumbling ledges, falling icicles, and frost bats; build a combo to trigger frenzy boosts.

## Modes and features

- **Classic:** chase higher floors, combos, and verified leaderboard scores.
- **Party:** lower gravity, spring platforms, and timed double jumps, with separate rankings.
- **Practice:** learn with guided tips and no automatic frost chase; runs are unranked.
- **Daily tower:** a shared Classic tower for each UTC date, with unlimited retries.
- **Race a friend:** private 2–4 player races with names, customizable climbers, bats, falling ice, checkpoint shields, configurable goals, and optional shoves.

Open **Menu** for modes, daily towers, skill goals, unlockable outfits, and leaderboards. Race your saved ghost or share a friend challenge after a run. Personal progress is stored in your browser.

Keyboard and touch controls support portrait and landscape layouts. Audio, quality, and reduced motion are under **Menu → Settings**. WebGL is required.

## Run locally

Requires **Node.js 22.13.0 or newer**.

```sh
npm install
npm run dev -- --port 5188
```

Open [localhost:5188](http://localhost:5188). Race rooms work locally; the leaderboard API runs on Netlify.

## Documentation

| Guide | Contents |
| --- | --- |
| [Gameplay](docs/gameplay.md) | Movement, hazards, difficulty, goals, outfits, and ghosts |
| [Leaderboards and sharing](docs/leaderboard-and-sharing.md) | Verified scores, replay compatibility, and friend challenges |
| [Multiplayer races](docs/multiplayer.md) | Lobby rules, networking, acceptance criteria, and testing |
| [Development](docs/development.md) | Setup, checks, art and audio, validation notes, and Netlify deployment |
| [SEO and GEO](docs/seo-geo.md) | Search metadata, structured data, crawl files, and AI-readable game guide |
| [Playtesting](docs/playtesting.md) | Human playtest protocol and local measurement exports |
| [Product analytics](docs/posthog-setup.md) | PostHog configuration, events, dashboards, and measurement limits |

Production builds send anonymous gameplay and feature events to the Frostbound PostHog project. Names, input recordings, and raw invitation links are excluded; the detailed playtest report remains local. Development capture is off by default. See the analytics guide for configuration and disabling capture.

An independent Icy Tower-inspired browser prototype with no original game assets or affiliation. See [asset credits](public/assets/ATTRIBUTION.md), [audio credits](public/audio/ATTRIBUTION.md), and [cover artwork details](docs/cover-prompt.md).

## Jev AI player (local development only)

Choose **Menu → Watch Jev play** to let TypeSafe's Jev choose landing routes in an
unranked Practice run. The game simulates candidate button sequences with its real
physics engine, then gives Jev the reachable floors, landing clearance, duration,
hazards, and recent landing outcomes. Jev selects a route; the game executes that
plan's takeoff, steering, and braking smoothly at frame rate.

The next request starts near the end of the current jump using the predicted
landing state. Before execution, the chosen destination is checked again against
the live game. Outdated answers are discarded and the game keeps moving while
requests are in flight. This is a hybrid controller: Jev chooses the route and code
handles precise movement timing. Pause with Escape or use **Stop watching** to
return to the title. Sessions are limited to 240 choices. AI runs do not award
personal records, skills, or outfits.

Jev is disabled by default. To enable it locally, add these values to the ignored
`.env.local`, then restart the development server:

```dotenv
JEV_ENABLED=true
TYPESAFE_API_KEY=your-typesafe-api-key
```

Set `JEV_ENABLED=false` or remove it to hide the menu entry and inspector and disable
its local API route. Only the literal value `true` enables it. The flag is honored
only by the development server in `development` mode; production builds and preview
servers always disable Jev, even if the flag and API key are present. No Jev Netlify
function is deployed. The API key stays server-side; never give it a `VITE_` prefix.

The server calls `jev-latest` through TypeSafe's [Choice API](https://docs.typesafe.ai/api).
Only candidate landing summaries, recent outcomes, and run progress go to TypeSafe.
Requests time out safely; missing credentials or service errors pause the AI run.

The **Jev live inspector** opens alongside the game when you choose **Watch Jev play**.
It shows live controls and position, landing probabilities, confidence, request/planning
timing, and a decision feed. The game has its own viewport; on phones the inspector
sits below it. Select a past decision while the run continues, then choose **Back to live**
to follow new answers. The last answer stays visible while the next request is pending.
Use the inspector controls to pause or stop the run. **Export trace** downloads the latest 30 choices as
JSON; it includes game state and model metadata, never the API credential.

Validation: `node --test tests/jev-player.test.ts tests/jev-planner.test.ts tests/jev-debug.test.ts tests/jev-development.test.ts`.
To run a live three-tower benchmark (uses API credits):
`node --env-file=.env.local scripts/evaluate-jev.ts current 20`.
Results are written to the ignored `outputs/jev-evaluation/` directory.
Live model choices and latency vary; this is an experimental AI player.
