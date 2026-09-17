import { pathToFileURL } from 'node:url';

export const DASHBOARD_NAME = 'Frostbound — Players, Skills & Multiplayer';
type Property = { key: string; value: string[] | number; operator: string; type: 'event' };
type EventNode = { kind: 'EventsNode'; event: string; name: string; properties: Property[]; math?: string };
type Query = Record<string, unknown>;
export type Chart = { name: string; description: string; query: Query };
const property = (key: string, value: string[] | number, operator = 'exact'): Property => ({ key, value, operator, type: 'event' });
const production = [property('environment', ['production']), property('app', ['frostbound'])];
const human = [property('start_source', ['button', 'keyboard'])];
const event = (name: string, properties: Property[] = []): EventNode => ({ kind: 'EventsNode', event: name, name, properties });
const soloEvent = (name: string, properties: Property[] = []) => event(name, [...human, ...properties]);
const base = { dateRange: { date_from: '-30d' }, properties: production, filterTestAccounts: true };
const chart = (name: string, description: string, source: Query): Chart => ({ name: name === 'Daily player retention' ? '7-day player retention' : name === 'Race participation' ? 'Race participation' : `Frostbound — ${name}`, description, query: { kind: 'InsightVizNode', source } });
const trends = (series: EventNode[], extra: Query = {}): Query => ({ ...base, kind: 'TrendsQuery', interval: 'day', series: series.map(node => ({ ...node, math: 'total' })), trendsFilter: { display: 'ActionsLineGraph' }, ...extra });
const funnel = (series: EventNode[]): Query => ({ ...base, kind: 'FunnelsQuery', series, funnelsFilter: { funnelOrderType: 'ordered', funnelVizType: 'steps', funnelWindowInterval: 1, funnelWindowIntervalUnit: 'hour' } });

// Query nodes follow PostHog's public query schema; names are the stable setup keys.
export const CHARTS: Chart[] = [
  chart('Solo activation', 'Anonymous people: solo visit → ready → human-started run within one hour. This is visit activation, not first-ever player activation.', funnel([
    event('$pageview', [property('surface', ['solo'])]), event('game_ready', [property('surface', ['solo'])]), soloEvent('run_started'),
  ])),
  chart('Second run conversion', 'Human first run → second run within one hour. visit_run_ordinal resets on full page load; this measures replay in one page lifetime, not a PostHog session.', funnel([
    soloEvent('run_started', [property('visit_run_ordinal', 1)]), soloEvent('run_started', [property('visit_run_ordinal', 2)]),
  ])),
  chart('Run outcomes by mode', 'Event totals for human starts, finishes and abandonments. Abrupt process termination can leave starts without terminal events.', trends([
    soloEvent('run_started'), soloEvent('run_finished'), soloEvent('run_abandoned'),
  ], { breakdownFilter: { breakdowns: [{ property: 'mode', type: 'event' }] } })),
  chart('Guidance progression', 'First persistent completion of move → jump → momentum within one hour, among human runs. Returning players may already have these steps completed.', funnel([
    soloEvent('guidance_step_shown', [property('step_id', ['move'])]),
    ...['move', 'jump', 'momentum'].map(step => soloEvent('guidance_step_completed', [property('step_id', [step])])),
  ])),
  chart('Guidance skips', 'Guidance skip event totals for human runs.', trends([soloEvent('guidance_skipped')])),
  chart('Sharing outcomes', 'Browser-reported native share and clipboard outcomes. A completion does not prove delivery. Native failure can be followed by a separate clipboard attempt.', trends([
    event('share_attempted'), event('share_completed'), event('share_cancelled'), event('share_failed'),
  ], { breakdownFilter: { breakdowns: [{ property: 'share_type', type: 'event' }] } })),
  chart('Leaderboard submission conversion', 'Same-browser conversion within one hour: view → valid submit → successful server response, including outside-top-50 scores. This is a person funnel, not per-attempt matching.', funnel([
    event('leaderboard_viewed'), event('score_submission_started'), event('score_submission_succeeded'),
  ])),
  chart('Verified scores', 'Authoritative accepted server verifications, deduplicated by replay identity. Includes accepted scores outside the top 50; disabled or opted-out clients do not emit this event.', trends([
    event('score_verified'),
  ], { breakdownFilter: { breakdowns: [{ property: 'mode', type: 'event' }] } })),
  chart('Race participation', 'Event totals across players. Create/join/ready/start are not a person funnel: hosts and guests are different people and ready can toggle repeatedly.', trends([
    event('race_room_created'), event('race_room_joined'), event('race_ready_changed'), event('race_started'), event('race_rematch_requested'),
  ])),
  chart('Authoritative race finishes', 'One server race_finished per persisted room/round result. Separate from per-player starts and falls/respawns.', trends([event('race_finished')])),
  chart('Reliability failures', 'Failures by event type. Includes all production clients; start_source is unavailable on loading, network and some shared UI events.', trends([
    event('game_load_failed'), event('graphics_failed'), event('graphics_context_lost'), event('leaderboard_load_failed'), event('score_submission_failed'), event('race_connection_failed'), event('race_connection_lost'),
  ])),
  chart('Daily player retention', 'Recurring human run-start cohorts over eight daily intervals (D0–D7), by anonymous browser identity. Recent cohorts are incomplete; cleared browser storage breaks continuity.', {
    ...base, kind: 'RetentionQuery', retentionFilter: {
      retentionType: 'retention_recurring', period: 'Day', totalIntervals: 8, retentionReference: 'total',
      targetEntity: { id: 'run_started', type: 'events', properties: human },
      returningEntity: { id: 'run_started', type: 'events', properties: human },
      timeWindowMode: 'strict_calendar_dates', dashboardDisplay: 'table_only',
    },
  }),
];

// Existing dashboard charts retain their established names and avoid duplicates on reruns.
const existingChart = (name: string, description: string, source: Query): Chart => ({ name, description, query: { kind: 'InsightVizNode', source } });
const aggregate = (math: string, math_property?: string) => ({ ...soloEvent('run_finished'), math, ...(math_property ? { math_property, name: math_property } : {}) });
const byMode = { breakdownFilter: { breakdowns: [{ property: 'mode', type: 'event' }] } };
CHARTS.push(
  existingChart('Daily active players', 'Daily unique anonymous browser identities starting human runs. New run_started schema only; excludes legacy game_run_started history.', trends([], { series: [{ ...soloEvent('run_started'), math: 'dau' }] })),
  existingChart('Runs by game mode', 'Human run-start counts by mode. New run_started schema only.', trends([soloEvent('run_started')], byMode)),
  existingChart('Start to finished run', 'Human run start → finished within one hour. Person funnel; steps need not be the same run. Abrupt exit can leave starts without terminal events.', funnel([soloEvent('run_started'), soloEvent('run_finished')])),
  existingChart('Average floor reached', 'Average highest floor on finished human runs, by mode. Excludes abandoned runs; new run_finished schema only.', trends([], { series: [aggregate('avg', 'floor')], ...byMode })),
  existingChart('Average run duration', 'Average active simulation seconds on finished human runs. Excludes pauses and abandoned runs; active_duration_s replaces legacy duration_seconds.', trends([], { series: [aggregate('avg', 'active_duration_s')], trendsFilter: { display: 'ActionsLineGraph', aggregationAxisFormat: 'duration' } })),
  existingChart('Movement actions in finished runs', 'Sum of wall rebounds, dodges, stomps and frenzies recorded in finished human run summaries. Action totals, not unique players; abandoned runs are excluded.', trends([], { series: ['wall_rebounds', 'dodges', 'stomps', 'frenzies'].map(key => aggregate('sum', key)) })),
  existingChart('Damage hits in finished runs', 'Sum of hits recorded in finished human run summaries. Measures damage, not hazard exposure or encounters; abandoned runs are excluded.', trends([], { series: [aggregate('sum', 'hits')] })),
  existingChart('How runs end', 'Finished human runs by failure_kind. New schema only; abandonments are separate in Run outcomes by mode.', trends([soloEvent('run_finished')], { breakdownFilter: { breakdowns: [{ property: 'failure_kind', type: 'event' }] }, trendsFilter: { display: 'ActionsPie' } })),
  existingChart('Play again after a run', 'Human run finished → another human run started within 30 minutes. Anonymous person funnel, not per-attempt matching.', { ...funnel([soloEvent('run_finished'), soloEvent('run_started')]), funnelsFilter: { funnelOrderType: 'ordered', funnelVizType: 'steps', funnelWindowInterval: 30, funnelWindowIntervalUnit: 'minute' } }),
);

type Existing = { id: number; name?: string; deleted?: boolean; dashboards?: number[] };
type Configuration = { host: string; projectId: string; apiKey: string };
type Dependencies = { fetch?: typeof fetch; log?: (line: string) => void };

export async function setupPostHog(config: Configuration, apply = false, dependencies: Dependencies = {}) {
  const host = new URL(config.host);
  if (host.protocol !== 'https:' || host.username || host.password || host.search || host.hash || host.pathname !== '/') throw new Error('POSTHOG_MANAGEMENT_HOST must be an HTTPS origin without credentials or a path.');
  if (!/^\d+$/.test(config.projectId) || !config.apiKey) throw new Error('A numeric project ID and personal API key are required.');
  const prefix = `/api/projects/${config.projectId}/`;
  const fetcher = dependencies.fetch ?? fetch, log = dependencies.log ?? console.log;
  async function request(path: string, body?: unknown): Promise<unknown> {
    const url = new URL(path, host);
    if (url.origin !== host.origin || !url.pathname.startsWith(prefix) || url.username || url.password) throw new Error('Refusing a pagination URL outside the configured project.');
    let response: Response;
    try {
      response = await fetcher(url, { method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(30000), headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    } catch { throw new Error('PostHog request failed or timed out. Inspect the project before retrying --apply.'); }
    // Do not echo response bodies, credentials, or arbitrary server errors.
    if (!response.ok) throw new Error(`PostHog request failed with HTTP ${response.status}.`);
    try { return await response.json(); } catch { throw new Error('PostHog returned invalid JSON.'); }
  }
  async function list(resource: string): Promise<Existing[]> {
    let next: string | null = `${prefix}${resource}/?limit=100&include_dashboards=true`;
    const seen = new Set<string>(), results: Existing[] = [];
    while (next) {
      if (seen.has(next) || seen.size >= 1000) throw new Error('Pagination did not terminate; no further writes attempted.');
      seen.add(next);
      const page = await request(next) as { next?: string | null; results?: Existing[] };
      if (!Array.isArray(page.results) || (page.next != null && typeof page.next !== 'string')) throw new Error('Unexpected PostHog list response.');
      results.push(...page.results.filter(item => !item.deleted)); next = page.next ?? null;
    }
    return results;
  }
  const [dashboards, insights] = await Promise.all([list('dashboards'), list('insights')]);
  const matches = dashboards.filter(item => item.name === DASHBOARD_NAME);
  if (matches.length > 1) throw new Error('Multiple matching Frostbound dashboards exist; resolve the duplicate before applying.');
  let dashboard = matches[0];
  log(`${apply ? 'Apply' : 'Dry run'}: project ${config.projectId} at ${host.origin}`);
  if (!dashboard) {
    log(`CREATE dashboard: ${DASHBOARD_NAME}`);
    if (apply) {
      dashboard = await request(`${prefix}dashboards/`, { name: DASHBOARD_NAME, description: 'Frostbound production acquisition, gameplay, conversion and reliability. See each chart description for population and correlation limits.' }) as Existing;
      if (!Number.isInteger(dashboard.id)) throw new Error('Dashboard creation returned no ID. Inspect PostHog before retrying.');
    }
  } else log(`KEEP dashboard: ${DASHBOARD_NAME}`);
  for (const definition of CHARTS) {
    const existing = insights.filter(item => item.name === definition.name);
    if (existing.length) {
      log(`KEEP chart: ${definition.name}${existing.length > 1 ? ' (duplicate names already exist)' : ''}`);
      if (!dashboard || !existing.some(item => item.dashboards?.includes(dashboard.id))) log('  Existing chart is not attached to this dashboard; left unchanged. Attach it manually if desired.');
      continue;
    }
    log(`CREATE chart: ${definition.name}`);
    if (apply) {
      const created = await request(`${prefix}insights/`, { ...definition, dashboards: [dashboard!.id] }) as Existing;
      if (!Number.isInteger(created.id)) throw new Error('Insight creation returned no ID. Inspect PostHog before retrying.');
      insights.push({ ...created, name: definition.name });
    }
  }
  if (dashboard) log(`Dashboard: ${host.origin}/project/${config.projectId}/dashboard/${dashboard.id}`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--apply')) throw new Error('Usage: node --experimental-strip-types scripts/setup-posthog.ts [--apply]');
  const apply = args.includes('--apply');
  const host = process.env.POSTHOG_MANAGEMENT_HOST, projectId = process.env.POSTHOG_PROJECT_ID, apiKey = process.env.POSTHOG_PERSONAL_API_KEY;
  if (!host || !projectId || !apiKey) {
    if (apply) throw new Error('Set POSTHOG_MANAGEMENT_HOST, POSTHOG_PROJECT_ID and POSTHOG_PERSONAL_API_KEY before --apply.');
    console.log('Offline dry run: credentials are missing; no live project was inspected. Proposed dashboard and chart definitions:');
    console.log(JSON.stringify({ dashboard: DASHBOARD_NAME, charts: CHARTS }, null, 2));
    return;
  }
  await setupPostHog({ host, projectId, apiKey }, apply);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error instanceof Error ? error.message : 'PostHog setup failed.'); process.exitCode = 1; });
}
