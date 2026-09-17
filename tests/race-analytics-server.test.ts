import test from 'node:test';
import assert from 'node:assert/strict';
import { RaceService, type RaceStore } from '../lib/race-server.ts';
import { MemoryRaceStore } from '../lib/race-dev-server.ts';
import type { RaceAction, RaceView } from '../lib/race-protocol.ts';

const room = 'd'.repeat(32);
const host = '1'.repeat(64);
const guest = '2'.repeat(64);
const roomKey = `rooms/${room}`;

function harness(
  store: RaceStore,
  onFinished: (view: RaceView) => Promise<void>,
) {
  let now = Date.now();
  const service = new RaceService(
    store,
    () => now,
    () => 17,
    onFinished,
  );
  const act = (
    token: string,
    action: RaceAction['action'],
    extra: Partial<RaceAction> = {},
  ) => service.act({ action, room, round: 1, ...extra }, token);
  return {
    act,
    async start() {
      await act(host, 'create');
      await act(guest, 'join');
      await act(host, 'ready', { ready: true });
      await act(guest, 'ready', { ready: true });
      now += 4000;
    },
  };
}

void test('authoritative completion callback sees persisted forfeit once despite repeated leave and poll requests', async () => {
  const store = new MemoryRaceStore();
  const results: RaceView[] = [];
  const h = harness(store, async (view) => {
    const stored = await store.getWithMetadata(roomKey);
    assert.equal(stored?.data.finished, true);
    assert.equal(stored?.data.revision, view.revision);
    results.push(view);
  });
  await h.start();
  assert.equal(results.length, 0);
  const finished = await h.act(host, 'leave');
  assert.equal(finished.phase, 'finished');
  assert.equal(results.length, 1);
  assert.equal(results[0].reason, 'forfeit');
  assert.equal(results[0].winner, 'guest');
  assert.equal(
    results[0].players.find((player) => player.slot === 'host')?.result?.kind,
    'forfeit',
  );
  await h.act(guest, 'poll');
  await h.act(host, 'leave');
  await h.act(guest, 'poll');
  assert.equal(results.length, 1);
});

void test('failed conditional writes retry without emitting speculative completion', async () => {
  const memory = new MemoryRaceStore();
  let completionWrites = 0;
  let callbacks = 0;
  let callbackSawCommittedResult = false;
  const store: RaceStore = {
    getWithMetadata: (key) => memory.getWithMetadata(key),
    setJSON: async (key, value, options) => {
      if (value.finished && ++completionWrites === 1) {
        assert.equal(callbacks, 0);
        assert.equal((await memory.getWithMetadata(key))?.data.finished, false);
        return { modified: false };
      }
      return memory.setJSON(key, value, options);
    },
  };
  const h = harness(store, async () => {
    callbacks++;
    callbackSawCommittedResult =
      (await memory.getWithMetadata(roomKey))?.data.finished === true;
  });
  await h.start();
  const result = await h.act(host, 'leave');
  assert.equal(result.phase, 'finished');
  assert.equal(completionWrites, 2);
  assert.equal(callbacks, 1);
  assert.equal(callbackSawCommittedResult, true);
});

void test('analytics callback rejection does not reject or roll back a committed room result', async () => {
  const store = new MemoryRaceStore();
  let callbacks = 0;
  const h = harness(store, async () => {
    callbacks++;
    throw new Error('Analytics temporarily unavailable');
  });
  await h.start();
  const result = await h.act(host, 'leave');
  assert.equal(result.phase, 'finished');
  assert.equal(result.winner, 'guest');
  assert.equal((await store.getWithMetadata(roomKey))?.data.finished, true);
  const polled = await h.act(guest, 'poll');
  assert.equal(polled.phase, 'finished');
  assert.equal(callbacks, 1);
});
