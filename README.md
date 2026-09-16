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
- **Race a friend:** private two-player races with checkpoints, configurable goals, and optional shoves.

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
| [Two-player races](docs/multiplayer.md) | Lobby rules, networking, acceptance criteria, and testing |
| [Development](docs/development.md) | Setup, checks, art and audio, validation notes, and Netlify deployment |
| [SEO and GEO](docs/seo-geo.md) | Search metadata, structured data, crawl files, and AI-readable game guide |
| [Playtesting](docs/playtesting.md) | Human playtest protocol and local measurement exports |

An independent Icy Tower-inspired browser prototype with no original game assets or affiliation. See [asset credits](public/assets/ATTRIBUTION.md), [audio credits](public/audio/ATTRIBUTION.md), and [cover artwork details](docs/cover-prompt.md).
