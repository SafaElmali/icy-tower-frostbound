import test from 'node:test';
import assert from 'node:assert/strict';
import { CHARTS, DASHBOARD_NAME, setupPostHog } from '../scripts/setup-posthog.ts';

const config = { host: 'https://posthog.example', projectId: '42', apiKey: 'test-personal-key' };

void test('setup reads every page, preserves existing charts, and is idempotent on rerun', async () => {
  const dashboards: { id: number; name: string }[] = [];
  const insights = [{ id: 5, name: CHARTS[0].name, dashboards: [99] }];
  const writes: string[] = [], reads: string[] = [], output: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    assert.equal(url.origin, config.host);
    assert.equal(init?.redirect, 'error');
    if (init?.method === 'POST') {
      writes.push(url.pathname);
      const body = JSON.parse(typeof init.body === 'string' ? init.body : '{}');
      if (url.pathname.endsWith('/dashboards/')) {
        const dashboard = { id: 10, name: body.name }; dashboards.push(dashboard); return Response.json(dashboard, { status: 201 });
      }
      assert.deepEqual(body.dashboards, [10]);
      const insight = { id: insights.length + 10, name: body.name, dashboards: body.dashboards }; insights.push(insight); return Response.json(insight, { status: 201 });
    }
    reads.push(url.href);
    if (url.pathname.endsWith('/dashboards/')) return Response.json({ results: dashboards, next: null });
    if (!url.searchParams.has('offset')) return Response.json({ results: [], next: `${config.host}/api/projects/42/insights/?offset=100` });
    return Response.json({ results: insights, next: null });
  };
  await setupPostHog(config, false, { fetch: fetcher, log: line => output.push(line) });
  assert.equal(writes.length, 0, 'dry run must not mutate');
  assert.ok(reads.some(url => url.includes('offset=100')), 'must inspect later pages before creating');
  await setupPostHog(config, true, { fetch: fetcher, log: line => output.push(line) });
  assert.equal(dashboards[0].name, DASHBOARD_NAME);
  assert.equal(writes.length, CHARTS.length, 'one dashboard plus all missing charts');
  assert.equal(insights.filter(row => row.name === CHARTS[0].name).length, 1, 'existing chart on another dashboard is preserved');
  const before = writes.length;
  await setupPostHog(config, true, { fetch: fetcher, log: () => {} });
  assert.equal(writes.length, before, 'rerun must not create or overwrite anything');
  assert.ok(output.some(line => line.includes('left unchanged')));
});

void test('pagination cannot forward credentials to another origin or project', async () => {
  for (const next of ['https://attacker.example/api/projects/42/insights/', 'https://posthog.example/api/projects/99/insights/']) {
    const seen: string[] = [];
    const fetcher: typeof fetch = async input => {
      const requestUrl = input instanceof Request ? input.url : input.toString();
      seen.push(requestUrl);
      return Response.json({ results: [], next: requestUrl.includes('/insights/') ? next : null });
    };
    await assert.rejects(setupPostHog(config, true, { fetch: fetcher, log: () => {} }), /outside the configured project/);
    assert.ok(!seen.includes(next));
  }
});

void test('definitions separate people funnels from room outcomes and filter human run cohorts', () => {
  assert.equal(new Set(CHARTS.map(item => item.name)).size, CHARTS.length);
  for (const item of CHARTS) {
    assert.equal(item.query.kind, 'InsightVizNode');
    const source = item.query.source as { properties: unknown[]; series?: { event: string; properties: { key: string; value: unknown }[] }[]; kind: string };
    assert.deepEqual(source.properties, [{ key: 'environment', value: ['production'], type: 'event', operator: 'exact' }, { key: 'app', value: ['frostbound'], type: 'event', operator: 'exact' }]);
    if (source.kind === 'FunnelsQuery') assert.ok(!source.series?.some(node => node.event.startsWith('race_')));
    for (const node of source.series ?? []) if (node.event.startsWith('run_')) {
      assert.deepEqual(node.properties.find(prop => prop.key === 'start_source')?.value, ['button', 'keyboard']);
    }
  }
});
