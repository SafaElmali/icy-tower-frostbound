import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_PLAYTEST_RUNS, PLAYTEST_STORAGE_KEY, PlaytestAnalytics } from '../lib/playtest-analytics.ts';
const memory = () => { const data = new Map<string, string>(); return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } }; };
const context = { mode: 'arcade', device: 'desktop' as const, featureVersion: 'test' };
const result = { floor: 5, bestCombo: 3, wallRebounds: 1, gems: 2 };
void test('session replay includes unfinished starts, deduplicates finishes/goals and persists across reloads', () => {
  let now = Date.UTC(2026, 8, 15, 12); const storage = memory(); const tracker = new PlaytestAnalytics(storage, () => now);
  const first = tracker.beginRun(context); tracker.completeGoal(first, 'floor-5'); tracker.completeGoal(first, 'floor-5');
  tracker.finishRun(first, result); now += 1000; tracker.finishRun(first, { ...result, floor: 100 });
  const reload = new PlaytestAnalytics(storage, () => now); reload.beginRun(context);
  let report = reload.getReport().summary[0];
  assert.equal(report.replayRate, 1); assert.equal(report.sessions, 1); assert.equal(report.finishedRuns, 1); assert.equal(report.goalCompletionRate, .5);
  assert.equal(JSON.parse(reload.exportJSON()).runs[0].result.floor, 5);
  now += 30 * 60 * 1000; reload.beginRun(context); report = reload.getReport().summary[0];
  assert.equal(report.sessions, 2); assert.equal(report.replayRate, .5);
});
void test('next-day acquisition return uses UTC and waits for the entire next day before declaring absence', () => {
  let now = Date.UTC(2026, 8, 15, 23, 59); const tracker = new PlaytestAnalytics(memory(), () => now); tracker.beginRun(context);
  now = Date.UTC(2026, 8, 16, 23, 59); assert.equal(tracker.getReport().summary[0].nextDayReturn, 'pending');
  now = Date.UTC(2026, 8, 17); assert.equal(tracker.getReport().summary[0].nextDayReturn, 'did not return');
  now = Date.UTC(2026, 8, 16); tracker.beginRun(context); assert.equal(tracker.getReport().summary[0].nextDayReturn, 'returned');
});
void test('device, mode and feature version are separate cohorts; abandonments are not deaths', () => {
  const tracker = new PlaytestAnalytics(memory()); const id = tracker.beginRun(context); tracker.abandonRun(id, 'restart'); tracker.finishRun(id, result);
  tracker.beginRun({ ...context, device: 'mobile' }); tracker.beginRun({ ...context, mode: 'daily' }); tracker.beginRun({ ...context, featureVersion: 'baseline' });
  const groups = tracker.getReport().summary; assert.equal(groups.length, 4); assert.ok(groups.every(row => row.runs === 1));
  assert.equal(groups[0].finishedRuns, 0); assert.equal(groups[0].abandonedRuns, 1);
});
void test('bounded records flag unavailable acquisition history; malformed or denied storage does not break gameplay', () => {
  const storage = memory(); storage.setItem(PLAYTEST_STORAGE_KEY, '{broken'); const tracker = new PlaytestAnalytics(storage);
  for (let i = 0; i <= MAX_PLAYTEST_RUNS; i++) tracker.beginRun(context);
  assert.equal(tracker.getReport().discardedRuns, 1); assert.equal(tracker.getReport().summary[0].runs, MAX_PLAYTEST_RUNS);
  assert.equal(tracker.getReport().summary[0].nextDayReturn, 'history truncated');
  tracker.clear(); assert.deepEqual(tracker.getReport().summary, []);
  const denied = new PlaytestAnalytics({ getItem() { throw new Error(); }, setItem() { throw new Error(); }, removeItem() { throw new Error(); } });
  denied.beginRun(context); assert.equal(denied.getReport().persistent, false); assert.equal(denied.getReport().summary[0].runs, 1);
});
