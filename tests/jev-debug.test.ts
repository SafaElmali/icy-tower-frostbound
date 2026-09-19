import assert from 'node:assert/strict';
import test from 'node:test';
import { parseJevDecision, type JevDebugRecord } from '../lib/jev-debug.ts';
import { JevPlayer, observeTower, type JevAction } from '../lib/jev-player.ts';
import { TowerEngine } from '../lib/tower-engine.ts';
import { createJevHandler } from '../lib/jev-server.ts';
const engine = () => {
  const e = new TowerEngine();
  e.start('practice');
  return e;
};
const flush = () => new Promise((resolve) => setImmediate(resolve));

void test('debug metadata preserves actual probabilities and strips unrelated upstream fields', async () => {
  const state = observeTower(engine());
  const handler = createJevHandler(
    () => 'secret',
    async () =>
      Response.json({
        model: 'jev-test',
        apiKey: 'secret',
        answers: {
          move: {
            type: 'choice',
            choice: 'plan0',
            confidence: 0.81,
            probabilities: { plan0: 0.9, plan1: 0.1, unoffered: 1 },
          },
        },
      }),
  );
  const result = await handler(
    new Request('http://localhost/.netlify/functions/jev', {
      method: 'POST',
      body: JSON.stringify(state),
    }),
  );
  assert.deepEqual(await result.json(), {
    action: 'plan0',
    model: 'jev-test',
    confidence: 0.81,
    probabilities: { plan0: 0.9, plan1: 0.1 },
  });
});

void test('missing or malformed diagnostics remain unavailable rather than invented', () => {
  const state = observeTower(engine());
  const decision = parseJevDecision(
    { action: 'plan0', confidence: 4, probabilities: { plan0: 0.4 } },
    state,
  );
  assert.equal(decision?.confidence, null);
  assert.deepEqual(decision?.probabilities, {});
  assert.equal(parseJevDecision({ action: 'plan5' }, state), null);
});

void test('trace keeps completed outcomes associated with the right prefetched decision', async () => {
  const e = engine();
  let records: JevDebugRecord[] = [];
  let resolve!: (action: JevAction) => void;
  const player = new JevPlayer(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
    () => {},
    (value) => {
      records = value;
    },
  );
  player.tick(e, 1 / 60);
  const firstSnapshot = records[0];
  assert.equal(firstSnapshot.status, 'pending');
  resolve('plan0');
  await flush();
  assert.equal(records[0].status, 'queued');
  for (let i = 0; i < 120; i++) player.tick(e, 1 / 60);
  assert.equal(records[0].status, 'landed');
  assert.equal(records[0].decision?.action, 'plan0');
  assert.ok(records[0].responseMs !== null);
  assert.equal(records[1].status, 'pending');
  assert.ok(records[1].forecastAhead > 0);
  assert.equal(firstSnapshot.status, 'pending'); // Views are immutable.
  player.stop();
  assert.equal(records[1].status, 'stopped');
});

void test('trace records expired responses and service failures explicitly', async () => {
  const e = engine();
  let records: JevDebugRecord[] = [];
  let resolve!: (action: JevAction) => void;
  const player = new JevPlayer(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
    () => {},
    (value) => {
      records = value;
    },
  );
  for (let i = 0; i < 180; i++) player.tick(e, 1 / 60);
  resolve('plan0');
  await flush();
  assert.equal(records[0].status, 'discarded');
  assert.match(records[0].detail, /age limit/);
  player.stop();
  const broken = new JevPlayer(
    async () => {
      throw new Error('offline');
    },
    () => {},
    (value) => {
      records = value;
    },
  );
  broken.tick(engine(), 1 / 60);
  await flush();
  assert.equal(records[0].status, 'error');
});

void test('live inspector reports executed controls and clears them when paused or stopped', async () => {
  const e = engine();
  const player = new JevPlayer(async () => 'plan0');
  player.tick(e, 1 / 60);
  assert.deepEqual(player.liveState(e).controls, {
    left: false,
    right: false,
    jump: false,
  });
  await flush();
  let sawJump = false;
  let sawSteering = false;
  for (let i = 0; i < 40; i++) {
    player.tick(e, 1 / 60);
    const live = player.liveState(e);
    sawJump ||= live.controls.jump;
    sawSteering ||= live.controls.left || live.controls.right;
    assert.equal(live.x, e.x);
    assert.equal(live.vy, e.vy);
    assert.equal(live.targetFloor, 2);
  }
  assert.ok(sawJump && sawSteering);
  const savedTime = e.time;
  player.liveState(e);
  assert.equal(e.time, savedTime);
  e.togglePause();
  assert.deepEqual(player.liveState(e).controls, {
    left: false,
    right: false,
    jump: false,
  });
  e.togglePause();
  player.stop();
  assert.deepEqual(player.liveState(e).controls, {
    left: false,
    right: false,
    jump: false,
  });
});
