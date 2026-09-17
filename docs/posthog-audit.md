# PostHog instrumentation audit

Audited 2026-09-17 against commit `0b84fec` in `SafaElmali/icy-tower-frostbound`.

Implementation follow-up: the findings below describe the pre-integration baseline. PostHog instrumentation has since been added across solo play, multiplayer, onboarding, progression, sharing, leaderboards, and reliability, with server result capture and updated dashboards. See [current setup and limitations](posthog-setup.md). The live project was subsequently connected and contained legacy `game_*` events and charts; those were outside the original source-only audit.

## Finding and scope

**This checkout has no PostHog SDK, initialization, capture calls, or delivery pipeline.** The existing playtest tracker only writes local records. All events proposed below are missing from repository-managed PostHog instrumentation; four have local measurement equivalents.

Reviewed application routes, game controls and lifecycle, feature dialogs, the local tracker and its tests, multiplayer client/server transitions, leaderboard submission, and build/deployment configuration. Searched hidden project files as well as application source, excluding dependencies, build outputs, Git internals, and secret environment files. No PostHog or tag-manager installation was found in the reviewed configuration.

This is a source audit. A live PostHog project, ingestion history, deployed browser network traffic, and hosting-side script injection were not inspected. Absence in this checkout does not establish absence from every deployed environment. No production tracking was enabled or application behavior changed.

## Prioritized findings

| Priority | Finding | Evidence | Consequence |
| --- | --- | --- | --- |
| P0 | No PostHog integration | `package.json`; `app/layout.tsx`; `vite.config.ts`; `next.config.ts`; `netlify.toml` | No repository-managed acquisition, activation, retention, or conversion reporting in PostHog. |
| P1 | Existing measurements never leave the browser | `lib/playtest-analytics.ts:1`, `:80`, `:120`; `docs/playtesting.md` | The local report cannot aggregate players centrally. Exporting JSON is the only implemented collection mechanism. |
| P1 | Multiplayer is entirely unmeasured | `components/race-game.tsx:122`, `:181`, `:238`, `:375`, `:582`; `lib/race-server.ts` | Cannot distinguish room creation, invite conversion, readiness drop-off, actual starts, verified finishes, forfeits, or rematches. |
| P1 | Acquisition and onboarding lack semantic events | `app/how-to-play/page.tsx`; `app/game.tsx:227`, `:406`, `:633`, `:1077` | Cannot measure visit-to-play conversion or which movement lesson blocks activation. |
| P1 | Outcome properties are incomplete | `app/game.tsx:694`; `lib/playtest-analytics.ts:8` | Finished records contain floor, best combo, wall rebounds, and gems, but omit score, simulation duration, death evidence, and gameplay summaries. Abandonments contain no performance snapshot. |
| P1 | Rules cohorts are indistinguishable | `lib/playtest-analytics.ts:3`; `app/game.tsx:308`; `lib/tower-engine.ts:19`; `lib/friend-challenge.ts` | Every run defaults to `tower-action-v1`, while current rules are version 8 and friend links support earlier rules. Feature version alone cannot compare these runs reliably. Record actual `e.rulesVersion`. |
| P1 | Start origin is missing | `app/game.tsx:289`, `:596`, `:784`; `lib/game-tools.ts` | UI, keyboard, and WebMCP starts all use `startRun`. The documented “player-started” denominator can include tool-driven starts, and retries cannot be separated from restarts or first starts. |
| P1 | Sharing and leaderboard funnels have no outcome tracking | `components/friend-challenge.tsx:14`; `app/game.tsx:1546`; `components/leaderboard.tsx:40`, `:61`; `netlify/functions/leaderboard.ts` | A button click cannot establish a successful copy, completed share operation, or verified and saved score. |
| P1 | Loading and recovery failures are unmeasured | `app/game.tsx:542`, `:559`, `:774`; `components/race-game.tsx:532` | Failure to load or recover WebGL cannot be separated from lack of interest. Caught failures primarily become UI messages or console output. |
| P2 | Progress, cosmetics, settings, and feature discovery lack tracking | `app/game.tsx:329`, `:737`, `:1309`, `:1442`; feature components | Cannot assess feature adoption, unlock-to-equip conversion, or preference changes. |
| P2 | Local goal rate measures newly earned persistent goals | `app/game.tsx:237` | Only IDs absent from saved skill progress are measured. Returning players who repeat a skill receive no new completion. This is appropriate for unlocks, but is not a repeated per-run skill-success rate. |
| P2 | Local sessions and retention have limited interpretation | `lib/playtest-analytics.ts:33`, `:85`; `docs/playtesting.md` | Local storage is capped at 300 runs; grouping splits modes and versions; next-day return follows the first UTC day per installation/group. It is not population retention. Existing documentation correctly describes these limitations. |

## Proposed event contract

Names below are proposals, not existing PostHog events. P1 is the initial measurement release; P2 is deeper product diagnosis. `$pageview` is the SDK event; the other names are application events.

Common properties: `schema_version`, `app_version` or build identifier, `environment`, and `surface` (`solo`, `race`, `guide`). Run events also include `run_id`, `mode` (`arcade`, `party`, `practice`), `run_context` (`normal`, `daily`, `friend_challenge`, `multiplayer`), actual `rules_version`, `feature_version`, and `input_type`. Keep the existing coarse-pointer classification separately named `device_proxy`; it is not an exact mobile-device detector.

Use anonymous browser identity for this accountless game. Do not use leaderboard names, race bearer tokens, or per-run IDs as person identity. Keep development and automated play distinguishable with `environment` and `start_source`.

### Acquisition, readiness, and runs

| Priority | Event | Trigger / insertion point | Additional properties |
| --- | --- | --- | --- |
| P1 | `$pageview` | One initialization/navigation mechanism covering `/`, `/race`, `/how-to-play` | Sanitized route, allowlisted acquisition properties, incoming link type |
| P1 | `game_load_started` | Start of game initialization in each game surface | `load_id` |
| P1 | `game_ready` | Assets loaded and graphics usable; once per load | `load_id`, `load_duration_ms`, quality |
| P1 | `game_load_failed` | Import or world-load rejection | `load_id`, stage, bounded error code, elapsed time |
| P1 | `run_started` | Successful `startRun`, shared by every entry path | `start_source` (button, keyboard, game_tool), `start_reason` (first, retry, restart), previous run ID, session run ordinal, ghost enabled, guidance enabled; daily date or challenge targets when applicable |
| P1 | `run_finished` | Solo `over` event branch | Score, floor, best combo, gems, wall rebounds, `active_duration_s` from engine time, elapsed duration, failure kind, personal-best flags, action counters, quick-challenge results |
| P1 | `run_abandoned` | Active run replaced, returned to title, or page exited | Reason, current performance, active duration; preserve the tracker’s terminal-state guard |
| P2 | `run_paused`, `run_resumed` | Actual status changes, including blur, visibility, graphics recovery, dialogs, and tools | Reason, current floor, active time, pause duration on resume |
| P2 | `run_results_viewed` | Results presentation; distinguish compact results from expanded details | `view` (summary, details), run ID |
| P2 | `navigation_selected` | Guide play/race/source links and in-game race entry | Destination and source surface |

Do not count selecting a mode as starting a run: the mode selector invokes `engine.start` to prepare a ready-state preview. Instrument the established player-start path, not every engine reset. A replay uses `run_started` with `start_reason=retry`; a separate retry event is unnecessary for the initial funnel.

### Onboarding and progression

| Priority | Event | Trigger / insertion point | Additional properties |
| --- | --- | --- | --- |
| P1 | `guidance_step_shown` | Transition to a new visible guidance cue | Step ID, run active time, guidance attempt ID |
| P1 | `guidance_step_completed` | Newly completed move/jump/momentum step in `saveGuidance` | Step ID, elapsed active time since shown, attempt ID |
| P1 | `guidance_skipped` | Transition to skipped in the guidance profile | Current step, attempt ID |
| P1 | `guided_practice_started` | Successful `guidedPractice` start | Entry surface; same run ID as its `run_started` |
| P1 | `skill_goal_completed` | Existing `saveSkills` new-completion branch | Goal ID; explicitly means first persistent unlock |
| P2 | `skill_goal_selected` | Successful selection from `SkillGoalProgression` | Previous/new goal IDs |
| P2 | `quick_challenge_resolved` | First transition from active to complete/failed/missed | Challenge ID, outcome, floor; deduplicate per run |
| P2 | `floor_milestone_reached` | First crossing of a small fixed milestone set | Milestone; emit once per run |
| P2 | `cosmetic_unlocked` | Existing `earned` calculation in the progression branch | Item ID, slot, unlocking criterion |
| P2 | `cosmetic_equipped` | `equip` after normalization changes the equipped item | Slot, previous/new item IDs |

Use existing engine action counters (`hits`, `dodges`, `stomps`, `frenzies`) in run summaries. If warning recognition is an experiment, add bounded first-exposure events by hazard kind; do not stream every jump, land, gem, position, frame, or race poll into PostHog. The game’s `GameEvent` union represents simulation/audio effects, not an analytics schema.

### Daily towers, challenges, and sharing

| Priority | Event | Trigger / insertion point | Additional properties |
| --- | --- | --- | --- |
| P1 | `shared_link_opened` | Parse incoming daily/challenge/race query once | Link type, valid/invalid/mixed result, bounded reason; supported rules version when valid |
| P1 | `share_dialog_opened` | Friend challenge, daily share, or race invitation becomes visible | Share type, source, run ID if applicable |
| P1 | `share_attempted` | Native share or clipboard operation starts | Share type, method, operation ID |
| P1 | `share_completed` | Share/clipboard promise resolves | Same operation ID, method |
| P1 | `share_cancelled`, `share_failed` | Native cancellation or operation failure | Same operation ID, bounded reason; identify fallback attempts separately |
| P2 | `daily_tower_selected` | Select dated/today tower | Daily date, selection source |
| P2 | `challenge_exited` | Leave daily/friend context | Context type, current status |
| P2 | `challenge_result` | Finished friend challenge | Floor target, score target, separate floor-beaten and score-beaten booleans |
| P2 | `daily_best_improved` | `updateDailyProgress` improves the dated record | Date, previous/new performance |
| P2 | `ghost_result` | Finish a run with a ghost | Target floor, beaten flag; store new-ghost/recording-unavailable flags on `run_finished` |

Native share completion means the browser reports completion; copying a link means copying succeeded. Neither proves delivery, recipient engagement, or an invite conversion. Existing solo challenge URLs have no unique sender/share attribution ID, so link opening alone cannot attribute a recipient to one particular share. Add an opaque attribution mechanism only if that funnel is required. Do not send raw challenge payloads, invite URLs, or clipboard contents as event properties.

### Leaderboards

| Priority | Event | Trigger / insertion point | Additional properties |
| --- | --- | --- | --- |
| P1 | `leaderboard_viewed` | Dialog/tab becomes visible | Ranked mode, entry source, submission eligible |
| P1 | `leaderboard_loaded`, `leaderboard_load_failed` | Current load request resolves/fails | Mode, request ID, latency, result count or error code; omit intentionally superseded/unmounted requests |
| P1 | `score_submission_started` | Valid form submission sends its request | Run ID, submission attempt ID, ranked mode |
| P1 | `score_submission_succeeded`, `score_submission_failed` | Client submission response or timeout | Attempt ID, rank/top-50 flag or error category/status, latency |
| P1 | `score_verified` | Server has verified and persisted the submission | Submission correlation ID, mode, verified score/floor, rank; one authoritative event |
| P2 | `leaderboard_refreshed` | Explicit refresh/retry click | Mode, reason |

A submission outside the top 50 is still a successful verified submission. Keep that separate from rejection. Do not capture player names, request bodies, outfits as arbitrary objects, or input replay data. Client success and server verification are separate facts; do not combine their counts as conversions.

### Multiplayer

| Priority | Event | Trigger / insertion point | Additional properties |
| --- | --- | --- | --- |
| P1 | `race_connection_attempted` | `connect` starts | Create/join/restore operation, attempt ID |
| P1 | `race_room_created`, `race_room_joined`, `race_connection_failed` | Operation outcome | Attempt ID, role, latency, bounded error code; restore flag |
| P1 | `race_ready_changed` | Acknowledged ready/unready transition | Role, ready state, round |
| P1 | `race_started` | `!wasStarted && local.started` in the animation loop | Analytics room ID, round, target floor, time limit, bumping, role |
| P1 | `race_finished` | Authoritative persisted transition to finished | Analytics room ID, round, winner/draw, result reason, verified result summaries |
| P1 | `race_left` | Explicit leave/page exit | Phase, role, round, reason; server forfeit result remains authoritative |
| P1 | `race_rematch_requested` | Acknowledged rematch request | Analytics room ID, prior round, role |
| P1 | `race_connection_lost`, `race_connection_restored` | Transition into/out of connection trouble | Phase, error category, outage duration, retry count |
| P2 | `race_settings_changed` | Acknowledged `configure` operation | Previous/new target floor, duration, bumping |
| P2 | `race_transport_changed` | Peer-state transition | Peer/HTTP transport, state, phase |
| P2 | `race_respawned` | Actual respawn transition | Checkpoint floor, respawn ordinal |
| P2 | `race_action_failed` | Ready/configure/rematch operation fails | Action, status, bounded reason |

Keep race events separate from solo `run_finished`: a race fall can respawn at a checkpoint and is not a final race result. Summarize shove attempts/acceptances per round rather than emitting every pose or polling operation.

`receive` runs repeatedly for the same room. Deduplicate transitions by analytics room ID, round, and event kind, adding player role for player-specific events. On the server, `RaceServer` retries conditional writes; any authoritative tracking must happen only after `result.modified`, not inside a speculative mutation. For reliable delivery across a server crash between persistence and capture, use a persisted event/outbox strategy with stable event IDs. A client-only result-view event cannot substitute for authoritative finish counting.

### Discovery, settings, and reliability

| Priority | Event | Trigger / insertion point | Additional properties |
| --- | --- | --- | --- |
| P2 | `feature_panel_opened` | Menu/help/goals/outfits/daily/settings/playtest panel opens | Panel and entry source; use one consistent event |
| P2 | `mode_selected` | Ready-state mode actually changes | Previous/new mode |
| P2 | `setting_changed` | User changes sound/music/motion/quality | Setting, previous/new value, source=user; distinguish system/recovery changes |
| P2 | `fullscreen_changed`, `fullscreen_failed` | Browser confirms change or rejects request | Actual state or bounded failure reason |
| P1 | `graphics_context_lost`, `graphics_context_restored`, `graphics_failed` | Existing `GraphicsRecovery` callbacks on both surfaces | Load/run ID, phase, recovery duration, quality fallback |
| P2 | `local_storage_unavailable` | First read/write failure per subsystem/visit | Subsystem, operation; no stored values |
| P2 | `playtest_report_exported`, `playtest_report_cleared` | Report operations | Record count only; never upload the exported report implicitly |

## Integration and measurement requirements

1. Establish a client-only, singleton PostHog integration with the intended project token and regional host. This app uses Vinext/Vite and two deployment paths; verify environment-variable exposure against this build rather than assuming a conventional Next.js setup.
2. Provide a typed event wrapper with allowlisted properties and shared context. Analytics failure must not interrupt gameplay. Keep network capture out of simulation/replay code, including leaderboard replay verification and ghost simulation.
3. Choose exactly one pageview mechanism. Query replacements for a daily/challenge selection should not inflate visit counts. DOM autocapture can supplement UI exploration but does not provide semantic canvas-game outcomes. See [PostHog’s official autocapture documentation source](https://github.com/PostHog/posthog.com/blob/master/contents/docs/privacy/_snippets/autocapture-web.mdx).
4. Preserve one terminal solo outcome per run. Retain the existing finish/abandon idempotency and back/forward-cache handling. Treat abrupt process termination as an unknown outcome; no unload callback can guarantee observation. Reconcile stale open runs separately rather than inventing a death.
5. Separate active simulation time from elapsed wall time. Pauses/background time must not inflate active play duration. Distinguish deliberate pause, automatic pause, and graphics interruption.
6. Finalize end-of-run summaries after processing that frame’s skill/progression updates. Currently `finishRun` precedes `saveSkills` in the event loop; immediately copying its data to a terminal PostHog event could omit a goal completed on that final frame.
7. Preserve anonymous continuity across same-site routes. Session and retention definitions in the local report are custom; do not assume their IDs or calculations equal PostHog sessions. Derive replay and retention from documented cohorts and run starts, filtered to human production traffic.
8. Configure collection and opt-out behavior explicitly. The current source and playtest documentation promise local-only measurement; update that description if remote collection is introduced. PostHog exposes capture opt-in/out controls in its [official JavaScript documentation](https://github.com/PostHog/posthog.com/blob/master/contents/docs/libraries/js/index.mdx).
9. Strip sensitive or unnecessary values from custom properties and automatic URL/referrer collection. Never forward bearer tokens, WebRTC signaling/SDP, player names, arbitrary input, replay moves, or full exception/request payloads. Use bounded error codes and sanitized paths.
10. Define stable correlation identifiers for client/server conversions without placing secrets in analytics. A run ID is correlation, not identity. Do not claim cross-recipient attribution until an explicit link attribution mechanism exists.

## Verification plan

Completed for this audit: repository-wide instrumentation search; source-path review; `node --test tests/playtest-analytics.test.ts` — **4 passed, 0 failed**. These tests verify local bookkeeping only, not PostHog delivery.

Before calling an implementation complete:

- Exercise fresh visit → ready → first run → death → retry on keyboard and touch; require one start and one terminal event per run.
- Exercise menu abandonment, mid-run restart, pause/resume, backgrounding, full page exit, and back/forward-cache restoration. Confirm a restored run is not prematurely abandoned.
- Exercise Classic, Party, Practice, daily, and current/legacy friend challenges; verify actual rules version and context on every run event.
- Exercise guidance completion/skip/replay; new versus already-earned goals; final-frame progression; quick challenges; cosmetic unlock/equip; ghost and daily record outcomes.
- Exercise share success, cancellation, clipboard failure/unavailability, fallback, invalid incoming links, and mixed daily/challenge parameters. Verify operation correlation and no false completion.
- Exercise leaderboard refresh, tab switching, timeout, rejection, successful top-50 submission and successful non-top-50 submission. Verify server/client correlation and no duplicate conversion from retries.
- Use two browser contexts to create/join/ready/race/finish/rematch/leave; cover a respawn, expired/invalid invite, restore, network loss, HTTP fallback, and forfeit. Repeated polls must not multiply lifecycle events.
- Simulate world-load failure and WebGL context loss/recovery. Confirm analytics does not turn caught failures into uncaught gameplay errors.
- Check development/tool traffic filtering, denied storage, blocked analytics delivery, and selected opt-out behavior. Audit emitted payloads for tokens, names, raw links, and input recordings.
- Inspect browser requests and the intended PostHog project’s received events/properties. Verify deployed Netlify and Sites configurations independently if both remain supported.

Recommended initial dashboards: visit → ready → first run → second run; guidance step shown → completed/skip; human production D1/D7 return using run starts; leaderboard view → submission → verified score; shared-link visit → context run; race create → join → ready → start → authoritative finish → rematch. Segment by mode/context, actual rules version, input/device proxy, and build. Shared-link attribution remains limited as described above.
