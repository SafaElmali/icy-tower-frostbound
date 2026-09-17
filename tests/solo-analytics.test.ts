import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SoloAnalytics } from '../lib/solo-analytics.ts';
import { TowerEngine } from '../lib/tower-engine.ts';

function fixture() {
  const events: { name: string; props: Record<string, unknown> }[] = [];
  let clock = 1000,
    serial = 0;
  const tracker = new SoloAnalytics(
    (name, props) => events.push({ name, props }),
    () => `run-${++serial}`,
    () => clock,
  );
  const engine = new TowerEngine(123, true, 5);
  engine.start('arcade');
  return {
    events,
    tracker,
    engine,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

void test('one terminal outcome per run preserves rules, source, active time and final progression', () => {
  const { events, tracker, engine, advance } = fixture();
  tracker.start(engine, {
    start_source: 'game_tool',
    run_context: 'friend_challenge',
  });
  advance(65000);
  engine.time = 5;
  engine.floor = 8;
  tracker.event('skill_goal_completed', { goal_id: 'floor-5' });
  assert.equal(
    tracker.terminal(engine, 'finished', { skill_goals_completed: 1 }),
    true,
  );
  assert.equal(
    tracker.terminal(engine, 'abandoned', { reason: 'unload' }),
    false,
  );
  assert.equal(tracker.terminal(engine, 'finished'), false);
  const end = events.at(-1)!;
  assert.equal(end.name, 'run_finished');
  assert.equal(end.props.active_duration_s, 5);
  assert.equal(end.props.elapsed_duration_s, 65);
  assert.equal(end.props.rules_version, 5);
  assert.equal(end.props.start_source, 'game_tool');
  assert.equal(end.props.skill_goals_completed, 1);
  assert.deepEqual(
    events.map((e) => e.name),
    ['run_started', 'skill_goal_completed', 'run_finished'],
  );
});

void test('restart gets new ID and prior-run correlation; duplicate unload is ignored', () => {
  const { events, tracker, engine } = fixture();
  tracker.start(engine, { start_reason: 'first' });
  engine.time = 3;
  tracker.terminal(engine, 'abandoned', { reason: 'restart' });
  engine.start('party');
  tracker.start(engine, { start_reason: 'restart' });
  tracker.terminal(engine, 'abandoned', { reason: 'unload' });
  tracker.terminal(engine, 'abandoned', { reason: 'unload' });
  assert.equal(events.length, 4);
  assert.equal(events[2].props.previous_run_id, 'run-1');
  assert.equal(events[2].props.run_id, 'run-2');
  assert.equal(events[2].props.visit_run_ordinal, 2);
  assert.equal(events[1].props.active_duration_s, 3);
});

void test('pause transitions deduplicate and include pause time separately', () => {
  const { events, tracker, engine, advance } = fixture();
  tracker.start(engine, {});
  engine.togglePause();
  tracker.pause(engine, 'visibility');
  tracker.pause(engine, 'blur');
  advance(30000);
  engine.togglePause();
  tracker.pause(engine, 'button');
  tracker.pause(engine, 'button');
  assert.deepEqual(
    events.map((e) => e.name),
    ['run_started', 'run_paused', 'run_resumed'],
  );
  assert.equal(events[2].props.pause_duration_s, 30);
  assert.equal(events[2].props.active_duration_s, 0);
});

void test('progress milestones are bounded per run and reset on next run', () => {
  const { events, tracker, engine } = fixture();
  tracker.start(engine, {});
  engine.floor = 100;
  tracker.progress(engine);
  tracker.progress(engine);
  assert.equal(
    events.filter((e) => e.name === 'floor_milestone_reached').length,
    5,
  );
  tracker.terminal(engine, 'finished');
  engine.floor = 200;
  tracker.progress(engine);
  assert.equal(
    events.filter((e) => e.name === 'floor_milestone_reached').length,
    5,
  );
  engine.start('arcade');
  tracker.start(engine, {});
  engine.floor = 5;
  tracker.progress(engine);
  assert.equal(
    events.filter((e) => e.name === 'floor_milestone_reached').length,
    6,
  );
});
