# PostHog dashboard setup

`scripts/setup-posthog.ts` creates **Frostbound — Players, Skills & Multiplayer** and 21 charts only when their exact names are missing. It lists all pages of existing dashboards and insights before writing. Existing charts, queries, dashboard membership and user edits remain untouched. A matching chart on another dashboard is reported for manual attachment instead of duplicated.

## Live setup — 2026-09-17

Updated the existing [Frostbound dashboard](https://us.posthog.com/project/612024/dashboard/2101750) in Safa Personal Projects / Icy Tower — Frostbound. Reused and corrected 11 existing insights, added 10 missing insights, and verified all 21 saved queries execute successfully. The separate starter dashboard (2101742) was left unchanged. The project timezone is UTC.

At verification, production queries returned zero/empty results for the new event schema. Charts start filling after production rollout; these results do not verify production ingestion. Legacy `game_run_*` history is retained in PostHog but is not combined into the new `run_*` charts. The dashboard description records this migration boundary.

The old multiplayer person funnel mixed per-player events with authoritative per-room finishes. It is now **Race participation**, with room finish counts shown separately. The former movement-player and hazard-exposure charts now measure **Movement actions in finished runs** and **Damage hits in finished runs** from terminal summaries. These are totals in completed human runs, not unique skill users or hazard exposures. Existing average duration now uses active simulation seconds (`active_duration_s`), excluding pauses. Existing retention now explicitly uses recurring daily cohorts.

## Run

Use Node 22.13 or later. Supply the following environment variables through your shell or secret manager:

| Variable | Value |
| --- | --- |
| `POSTHOG_MANAGEMENT_HOST` | Your PostHog application origin, such as `https://us.posthog.com` or `https://eu.posthog.com`; use the application's host, not the ingestion host. |
| `POSTHOG_PROJECT_ID` | The numeric project ID for the Frostbound project. |
| `POSTHOG_PERSONAL_API_KEY` | A personal API key with dashboard and insight read/write scopes. Keep this out of source control and all `VITE_` variables. |

Read-only preview against the configured project:

```sh
node --experimental-strip-types scripts/setup-posthog.ts
```

If any credentials are missing, this prints the proposed definitions offline and explicitly reports that it has not inspected a live project. With credentials present, it lists which resources would be kept or created. Confirm the printed host and project ID are the intended project.

Create missing resources:

```sh
node --experimental-strip-types scripts/setup-posthog.ts --apply
```

Run one setup process at a time. The API has no atomic create-by-name operation; concurrent setup runs could create duplicates. The script does not retry writes automatically: after a timeout, inspect the project and rerun its dry run. Successfully created resources are detected on subsequent runs, allowing recovery after a partially completed setup. Existing duplicate dashboard names stop the script before any writes.

This setup does not configure ingestion, set hosting environment variables, or fabricate sample events. Charts can remain empty until the deployed application sends production events. No live setup or ingestion verification is implied by the presence of this script.

## Enable ingestion separately

Production browser builds use the confirmed public configuration in `lib/analytics-config.ts` for PostHog project **612024**, US ingestion. Localhost and development capture are disabled by default. Set `VITE_POSTHOG_ENABLED=false` to disable capture, or `true` to enable a development smoke test; `VITE_POSTHOG_KEY` and `VITE_POSTHOG_HOST` override the public token and HTTPS ingestion origin. `VITE_APP_ENV` labels events (defaults to production for a production build and development otherwise); `VITE_APP_VERSION` labels the build, with `0.1.0` as fallback. Rebuild the frontend after changing these values.

Netlify server capture is enabled by default in production/AWS runtime and uses the same public configuration. `POSTHOG_ENABLED`, `POSTHOG_KEY` and `POSTHOG_HOST` override defaults, falling back to corresponding `VITE_` variables. These must be available to the deployed functions, not only the frontend build. A personal management API key must never be used as an ingestion token or bundled into the browser.

The browser SDK uses anonymous identity with person profiles disabled. Autocapture, remote session recording, surveys and feature-flag fetching are disabled. Semantic event properties are explicitly allowlisted and automatic URLs are stripped to known routes. Existing PostHog capture opt-out is respected; score verification is only forwarded when the browser supplies an enabled anonymous identity.

Server delivery is best effort, bounded to one second. Stable event UUIDs deduplicate retries, but there is no durable outbox: a crash or network failure after score/room persistence can lose a verification/finish event. Charts measure observed outcomes and cannot prove complete accounting of all persisted results.

## Charts and interpretation

Every chart filters `environment=production` and `app=frostbound` and enables the project's test-account filter. Run and guidance series positively select `start_source` button/keyboard to exclude game-tool starts without dropping pageviews or loading events that have no start source. Loading, sharing, leaderboard and race events do not consistently carry start source, so those charts cannot claim to exclude all automated traffic. Configure project test-account rules for additional exclusions.

| Chart | Definition |
| --- | --- |
| Solo activation | Solo pageview → game ready → human run started, within one hour. This includes returning players. |
| Second run conversion | Run ordinal 1 → ordinal 2 within one hour. Ordinal resets on page load, not on a PostHog session boundary. |
| Run outcomes by mode | Starts, finishes and abandonments, broken down by mode. |
| Guidance progression | Move shown → move completed → jump completed → momentum completed, within one hour. Persistent completed steps do not repeat for returning players. |
| Guidance skips | Human-run guidance skip count. |
| Sharing outcomes | Attempts, completions, cancellations and failures by share type. Clipboard fallback is a separate attempt. |
| Leaderboard submission conversion | View → submission started → client submission succeeded, including scores outside the top 50. |
| Verified scores | Authoritative accepted server verifications, deduplicated by replay identity; separate from client success counts. |
| Race participation | Room created, joined, ready changes, starts and rematch requests. These are event totals across different players. |
| Authoritative race finishes | Server finish count per persisted room/round result. |
| Reliability failures | Loading, graphics, leaderboard submission/loading and race connection failures. |
| 7-day player retention | Recurring run-start cohorts over D0–D7; human production browser identities only. |
| Daily active players | Unique anonymous browsers starting human runs per day. |
| Runs by game mode | Human starts by mode. |
| Start to finished run | Person conversion within an hour, not matched by run ID. |
| Average floor reached | Mean highest floor on finished human runs by mode. |
| Average run duration | Mean active simulation seconds on finished human runs. |
| Movement actions in finished runs | Sum of wall rebounds, dodges, stomps and frenzies from finished human runs. |
| Damage hits in finished runs | Sum of hits from finished human runs; not hazard exposure. |
| How runs end | Finished human runs by failure kind. |
| Play again after a run | Finish → another human start within 30 minutes. |

Funnels count anonymous people, not attempts or rooms; two steps may come from different attempts in the conversion window. Sharing completion proves only browser-reported share/copy success, not recipient engagement. Server finish counts and per-player start counts have different denominators. Retention follows anonymous browser identity; clearing storage breaks continuity, and recent cohorts have incomplete return windows. These charts use the last 30 days and the project's timezone.

After applying, inspect each chart's query and actual received event properties in PostHog, exercise the browser flows, and confirm production environment values and timezones. Review chart definitions manually if event names or semantics change: rerunning setup deliberately does not overwrite existing charts.

## API references

The setup uses PostHog's documented [dashboard API](https://posthog.com/docs/api/dashboards) and [insight API](https://posthog.com/docs/api/insights), with `InsightVizNode` wrapping `TrendsQuery`, `FunnelsQuery` or `RetentionQuery`. Field names were checked against PostHog's public [query schema](https://github.com/PostHog/posthog/blob/master/frontend/src/queries/schema/schema-general.ts) and [query filter types](https://github.com/PostHog/posthog/blob/master/frontend/src/types.ts).
