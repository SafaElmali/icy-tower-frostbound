import test from 'node:test';
import assert from 'node:assert/strict';
import { RaceAnalyticsTransitions } from '../lib/race-analytics.ts';
import {
  DEFAULT_RACE_SETTINGS,
  RACE_RULES_VERSION,
  type RaceView,
} from '../lib/race-protocol.ts';

const view = (): RaceView => ({
  id: 'private-room',
  revision: 1,
  round: 1,
  seed: 1,
  rulesVersion: RACE_RULES_VERSION,
  settings: DEFAULT_RACE_SETTINGS,
  signals: {},
  bumps: [],
  phase: 'waiting',
  startAt: null,
  deadline: null,
  expiresAt: 100,
  serverNow: 0,
  you: 'host',
  players: [
    {
      slot: 'host',
      ready: false,
      lastSeen: 0,
      pose: null,
      result: null,
      rematch: false,
    },
  ],
  winner: null,
  reason: null,
});

void test('polls and round resets cannot duplicate starts, results, invitations or readiness', () => {
  const tracker = new RaceAnalyticsTransitions();
  const room = view();
  assert.deepEqual(
    tracker.receive(room).map((e) => e.name),
    ['share_dialog_opened'],
  );
  assert.deepEqual(tracker.receive(room), []);
  room.players[0].ready = true;
  assert.deepEqual(tracker.receive(room), [
    { name: 'race_ready_changed', properties: { ready: true } },
  ]);
  assert.deepEqual(tracker.receive(room), []);
  assert.equal(tracker.started(1), true);
  assert.equal(tracker.started(1), false);
  room.phase = 'finished';
  const events = tracker.receive(room);
  assert.equal(events[0].name, 'race_results_viewed');
  assert.ok(!JSON.stringify(events).includes('private-room'));
  assert.deepEqual(tracker.receive(room), []);
  assert.equal(tracker.rematch(1), true);
  assert.equal(tracker.rematch(1), false);
  room.round = 2;
  room.phase = 'waiting';
  room.players[0].ready = false;
  assert.deepEqual(
    tracker.receive(room).map((e) => e.name),
    ['share_dialog_opened'],
  );
  assert.equal(tracker.started(2), true);
});

void test('repeated failed polls emit one loss and restored captures outage duration and retries', () => {
  const tracker = new RaceAnalyticsTransitions();
  assert.equal(tracker.restored(0), null);
  assert.equal(tracker.lost(0), true);
  assert.equal(tracker.lost(1000), false);
  assert.equal(tracker.lost(2000), false);
  assert.deepEqual(tracker.restored(3000), {
    outage_duration_ms: 3000,
    retry_count: 3,
  });
  assert.equal(tracker.restored(4000), null);
  assert.equal(tracker.lost(5000), true);
  assert.deepEqual(tracker.restored(5100), {
    outage_duration_ms: 100,
    retry_count: 1,
  });
  assert.equal(tracker.transport('live'), true);
  assert.equal(tracker.transport('live'), false);
  assert.equal(tracker.transport('fallback'), true);
});
