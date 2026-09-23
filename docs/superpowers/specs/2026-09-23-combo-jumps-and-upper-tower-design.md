# Combo jumps, Season 2 and the upper tower

Date: 2026-09-23. Status: approved for implementation.

## Evidence

A human-proxy bot (0.23–0.45 s reaction latency, no hazard foresight, 25% suboptimal choices) drove the real engine through 12 seeds using `jev-planner`'s landing search. A frame-perfect bot with hazard foresight provided an upper bound.

| Rules | Avg floor | Chain breaks | Best combo | Frenzy uptime | Peak multiplier |
| --- | ---: | ---: | ---: | ---: | ---: |
| v8 (proxy) | 131 | 5.2 (all from hazard hits) | 58 | 33% | 12× |
| v8 (perfect) | 219 | — | 159 | — | ~40× |
| v9 prototype (proxy) | 102 | 12.8 | 24 | 15% | 5.5× |

Standing jumps reach ~1.5 floors and full-speed jumps ~2.5, so under v8 any forward progress extends a combo. Sections stop changing at floor 75 while skilled runs pass floor 100. The last cosmetic unlocks sit at floor 50, score 5,000 and combo 15.

## A. Rules v9: combo jumps

- The engine records the floor of the last ledge landed on (`takeoffFloor`). A landing on a new highest floor that climbs **2 or more floors from takeoff** starts or extends the chain (3.8 s timer unchanged). A new-height landing that climbs one floor **ends the chain** and clears frenzy charge; its floors score base points (100 each).
- Wall jumps and stomps do not change takeoff; a multi-floor wall-assisted climb counts.
- Combo score multiplier `floor(combo / 5) + 1` is capped at **10×**.
- A `combo-short` event (not recorded in replays) drives a HUD caption.
- `CURRENT_RULES_VERSION = 9`. v1–8 replays, ghosts, challenge and daily links keep their rules. Races remain pinned at `RACE_RULES_VERSION = 7`.
- Frost pace is unchanged. Skilled simulated runs end lower because frenzy's jump boost is rarer; tune pace after playtests if needed.

## A2. Season 2 leaderboards

- v9+ verified runs are stored in `arcade-s2` / `party-s2`; v1–8 runs continue to use `arcade-v1` / `party-v1`.
- `GET /api/leaderboard?mode=arcade|party&season=current|legacy` (default `current`). POST responses include the season.
- Each mode tab offers a Season 2 / Legacy switch; toolbar text names the board.

## B. Upper tower and new unlocks (no simulation impact)

- Sections: floor 100 *The Glacier Vault*, 150 *The Stormcrown*, 200 *Starfall Summit* (palette + aurora strength only).
- Section title card when entering any section after the first, client-side, suppressed motion under reduced motion.
- New achievement metric `stomps` (best stomps in one run). New cosmetics: Glacier beanie (floor 100), Starfall beanie (floor 200), Storm knit (floor 150), Batbane knit (3 stomps), Frenzy stars (25× combo), Aurora stars (score 25,000).

## Out of scope

New meshes, new hazards, frost-pace tuning.

## Verification

Typecheck, lint, full `npm test`, a v8 replay-regression test, v9 engine tests, and a bot re-run on the final engine.
