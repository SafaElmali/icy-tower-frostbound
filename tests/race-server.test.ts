import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getStore, setEnvironmentContext } from '@netlify/blobs';
import { BlobsServer } from '@netlify/blobs/server';
import {
  RaceService,
  RaceError,
  verifyRaceFinish,
  type RaceStore,
} from '../lib/race-server.ts';
import { MemoryRaceStore } from '../lib/race-dev-server.ts';
import { createRaceHandler, MAX_RACE_BODY_BYTES } from '../lib/race-http.ts';
import {
  createRaceEngine,
  racePose,
  RACE_TARGET,
  RACE_DURATION_MS,
  RACE_DISCONNECT_MS,
  RACE_ROOM_TTL_MS,
  type RaceAction,
} from '../lib/race-protocol.ts';
import { freshControls } from '../lib/tower-engine.ts';

const room = 'a'.repeat(32),
  host = '1'.repeat(64),
  guest = '2'.repeat(64),
  stranger = '3'.repeat(64);
function harness(store: RaceStore = new MemoryRaceStore()) {
  let now = Date.now(),
    seed = 17;
  const service = new RaceService(
    store,
    () => now,
    () => seed++,
  );
  const act = (
    token: string,
    action: RaceAction['action'],
    extra: Partial<RaceAction> = {},
  ) => service.act({ action, room, round: 1, ...extra }, token);
  const both = async () => {
    await act(host, 'create');
    await act(guest, 'join');
    await act(host, 'ready', { ready: true });
    return act(guest, 'ready', { ready: true });
  };
  const travel = async (duration: number) => {
    const end = now + duration;
    while (now < end) {
      now = Math.min(now + 5000, end);
      await act(host, 'poll');
      await act(guest, 'poll');
    }
  };
  return {
    service,
    store,
    act,
    both,
    travel,
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
function climb(seed: number, goal = RACE_TARGET) {
  const engine = createRaceEngine(seed);
  let target = engine.platforms[1],
    wasJump = false;
  for (
    let frame = 0;
    frame < 10800 && engine.status === 'playing' && engine.floor < RACE_TARGET;
    frame++
  ) {
    if (engine.grounded)
      target = engine.platforms.find((p) => p.id === engine.floor + 1)!;
    const steering = (target.x - engine.x) * 3.8 - engine.vx * 1.1;
    const jump: boolean = engine.grounded && !wasJump;
    engine.tick(
      1 / 120,
      engine.floor >= goal
        ? freshControls()
        : { left: steering < -0.35, right: steering > 0.35, jump },
    );
    engine.drainEvents();
    wasJump = jump;
  }
  return engine;
}

void test('a private room admits exactly two players under simultaneous joins and hides credentials', async () => {
  const h = harness();
  const created = await h.act(host, 'create');
  assert.equal(created.you, 'host');
  assert.deepEqual(await h.act(host, 'create'), {
    ...created,
    revision: created.revision + 1,
  });
  const joins = await Promise.allSettled([
    h.act(guest, 'join'),
    h.act(stranger, 'join'),
  ]);
  assert.equal(joins.filter((r) => r.status === 'fulfilled').length, 1);
  const rejected = joins.find((r) => r.status === 'rejected')!;
  assert.equal(rejected.reason.status, 409);
  const view = await h.act(host, 'poll');
  assert.equal(view.players.length, 2);
  assert.equal(JSON.stringify(view).includes('token'), false);
  assert.equal(JSON.stringify(view).includes(host), false);
  await assert.rejects(h.act('4'.repeat(64), 'poll'), { status: 403 });
  await assert.rejects(
    h.service.act({ action: 'poll', room: '../other' }, host),
    { status: 400 },
  );
});

void test('both players must ready up; one shared countdown can be cancelled before the start', async () => {
  const h = harness();
  await h.act(host, 'create');
  assert.equal((await h.act(host, 'ready', { ready: true })).startAt, null);
  await h.act(guest, 'join');
  const countdown = await h.act(guest, 'ready', { ready: true });
  assert.equal(countdown.phase, 'countdown');
  assert.equal(countdown.startAt, h.now() + 4000);
  assert.equal((await h.act(host, 'poll')).startAt, countdown.startAt);
  assert.equal((await h.act(host, 'ready', { ready: false })).phase, 'waiting');
  const resumed = await h.act(host, 'ready', { ready: true });
  h.advance(4000);
  assert.equal((await h.act(guest, 'poll')).phase, 'racing');
  assert.equal(
    (await h.act(host, 'ready', { ready: false })).startAt,
    resumed.startAt,
  );
});

void test('rival updates are authenticated, bounded and ignore out-of-order packets', async () => {
  const h = harness();
  await h.both();
  h.advance(4000);
  const pose = racePose(createRaceEngine(17));
  await h.act(host, 'poll', { seq: 2, pose: { ...pose, x: 1, floor: 2 } });
  await h.act(host, 'poll', { seq: 1, pose: { ...pose, x: -1 } });
  assert.equal((await h.act(guest, 'poll')).players[0].pose!.x, 1);
  await assert.rejects(
    h.act(host, 'poll', { seq: 3, pose: { ...pose, x: NaN } }),
    { status: 400 },
  );
  await assert.rejects(
    h.act(host, 'poll', { seq: 3, pose: { ...pose, floor: 999999 } }),
    { status: 400 },
  );
});

void test('a real goal recording wins; forged poses cannot affect the server result', async () => {
  const h = harness();
  const start = await h.both();
  const engine = climb(start.seed);
  assert.ok(engine.floor >= RACE_TARGET);
  await h.travel(4000 + Math.ceil(engine.time * 1000));
  await h.act(guest, 'poll', {
    seq: 1,
    pose: { ...racePose(engine), floor: 30 },
  });
  const finishing = await h.act(host, 'finish', {
    replay: engine.getRecording()!,
  });
  assert.equal(finishing.phase, 'finishing');
  assert.equal(finishing.players[0].result!.kind, 'goal');
  await h.travel(2100);
  const result = await h.act(guest, 'poll');
  assert.equal(result.phase, 'finished');
  assert.equal(result.winner, 'host');
  assert.equal(result.reason, 'goal');
  assert.equal(result.players[0].result!.floor, engine.floor);
  assert.equal(result.players[1].result, null);
});

void test('two fallen runs compare verified height and an equal goal time is a draw', async () => {
  for (const tied of [false, true]) {
    const h = harness();
    const start = await h.both();
    const a = climb(start.seed, tied ? 20 : 8),
      b = climb(start.seed, tied ? 20 : 12);
    await h.travel(4000 + Math.ceil(Math.max(a.time, b.time) * 1000));
    await h.act(host, 'finish', { replay: a.getRecording()! });
    const result = await h.act(guest, 'finish', { replay: b.getRecording()! });
    assert.equal(result.phase, 'finished');
    assert.equal(result.winner, tied ? null : 'guest');
    assert.equal(result.reason, tied ? 'draw' : 'height');
  }
});

void test('race verification rejects wrong seeds, rules, pauses, fast-forwarding and unfinished claims', async () => {
  const h = harness();
  await h.both();
  h.advance(4000);
  const stored = (await h.store.getWithMetadata(`rooms/${room}`, {
    type: 'json',
  }))!.data;
  const engine = climb(stored.seed),
    replay = engine.getRecording()!;
  assert.throws(() => verifyRaceFinish(replay, stored, h.now()), /ahead/);
  const late = h.now() + 90000;
  for (const invalid of [
    { ...replay, seed: replay.seed + 1 },
    { ...replay, version: 4 },
    { ...replay, mode: 'practice' },
    { ...replay, moves: [[0, 8]] },
    { ...replay, moves: [[10801, 0]] },
    { ...replay, moves: [[1, 99]] },
    { ...replay, moves: [...replay.moves, [1, 0]] },
  ])
    assert.throws(() => verifyRaceFinish(invalid, stored, late), RaceError);
  assert.throws(
    () =>
      verifyRaceFinish({ ...replay, moves: [[1, 0]] }, stored, h.now() + 1000),
    /still in progress/,
  );
});

void test('live disconnects and explicit departures forfeit without letting reconnecting players restart', async () => {
  const h = harness();
  await h.both();
  h.advance(4000);
  for (let i = 0; i < 4; i++) {
    h.advance(4000);
    await h.act(host, 'poll');
  }
  const result = await h.act(guest, 'join');
  assert.equal(result.phase, 'finished');
  assert.equal(result.winner, 'host');
  assert.equal(result.reason, 'forfeit');
  const second = harness();
  await second.both();
  assert.equal((await second.act(host, 'leave')).winner, 'guest');
  assert.ok(RACE_DISCONNECT_MS < RACE_DURATION_MS);
});

void test('both rematch votes create one new seed and stale old-round actions cannot affect it', async () => {
  const h = harness();
  const first = await h.both();
  await h.act(host, 'leave');
  assert.equal((await h.act(host, 'rematch')).round, 1);
  const next = await h.act(guest, 'rematch');
  assert.equal(next.round, 2);
  assert.notEqual(next.seed, first.seed);
  assert.equal(next.phase, 'countdown');
  assert.ok(next.players.every((p) => p.ready && !p.result && !p.pose));
  assert.equal((await h.act(host, 'leave', { round: 1 })).phase, 'countdown');
  assert.equal((await h.act(guest, 'rematch', { round: 1 })).round, 2);
});

void test('the time limit accepts unfinished input records and rooms expire after an hour', async () => {
  const h = harness();
  const start = await h.both();
  const engine = createRaceEngine(start.seed);
  engine.tick(1 / 120, freshControls());
  await h.travel(4000 + RACE_DURATION_MS);
  const a = await h.act(host, 'finish', { replay: engine.getRecording()! });
  assert.equal(a.players[0].result!.kind, 'time');
  assert.equal(
    (await h.act(guest, 'finish', { replay: engine.getRecording()! })).reason,
    'draw',
  );
  h.advance(RACE_ROOM_TTL_MS);
  await assert.rejects(h.act(host, 'poll'), { status: 410 });
});

void test('HTTP boundaries reject foreign origins, unsupported methods and oversized streaming bodies', async () => {
  const h = harness(),
    handler = createRaceHandler(() => h.service);
  const request = (body: unknown, headers: Record<string, string> = {}) =>
    new Request('https://tower.example/.netlify/functions/race', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${host}`,
        ...headers,
      },
      body: JSON.stringify(body),
    });
  assert.equal(
    (await handler(new Request('https://tower.example/'))).status,
    405,
  );
  assert.equal(
    (
      await handler(
        request({ action: 'create', room }, { origin: 'https://evil.example' }),
      )
    ).status,
    403,
  );
  assert.equal(
    (await handler(request({ action: 'create', room }, { Authorization: '' })))
      .status,
    401,
  );
  assert.equal(
    (await handler(request('x'.repeat(MAX_RACE_BODY_BYTES)))).status,
    413,
  );
  assert.equal(
    (await handler(request({ action: 'create', room }))).status,
    200,
  );
});

void test('separate service instances share real Blob rooms and conditional joins', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frostbound-race-'));
  const server = new BlobsServer({ directory });
  const { port } = await server.start();
  try {
    setEnvironmentContext({
      siteID: 'race-test',
      token: 'local-test',
      apiURL: `http://localhost:${port}`,
      edgeURL: `http://localhost:${port}`,
      uncachedEdgeURL: `http://localhost:${port}`,
    });
    const store = getStore({ name: 'frostbound-races', consistency: 'strong' });
    // The bundled Blobs emulator omits ETags on GET. Its list response exposes
    // the same real ETag that its conditional PUT implementation checks.
    const localStore: RaceStore = {
      async getWithMetadata(key, options) {
        const value = await store.getWithMetadata(key, options);
        if (!value) return null;
        const { blobs } = await store.list({ prefix: key });
        return {
          ...value,
          etag: value.etag ?? blobs.find((blob) => blob.key === key)?.etag,
        };
      },
      setJSON: (key, value, options) => store.setJSON(key, value, options),
    };
    const a = new RaceService(localStore),
      b = new RaceService(localStore);
    await a.act({ action: 'create', room }, host);
    const joined = await b.act({ action: 'join', room }, guest);
    assert.equal(joined.you, 'guest');
    assert.equal(joined.players.length, 2);
    assert.equal(
      (await a.act({ action: 'poll', room, round: 1 }, host)).players.length,
      2,
    );
    const raw = await store.getWithMetadata(`rooms/${room}`, { type: 'json' });
    assert.equal(raw!.metadata.expiresAt, joined.expiresAt);
  } finally {
    await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

void test('an earlier accepted goal wins even if a later player submits a shorter simulated run', async () => {
  const h = harness();
  const start = await h.both();
  const engine = climb(start.seed);
  await h.travel(4000 + Math.ceil(engine.time * 1000) + 2000);
  const first = await h.act(host, 'finish', { replay: engine.getRecording()! });
  h.advance(500);
  const final = await h.act(guest, 'finish', {
    replay: engine.getRecording()!,
  });
  assert.equal(final.winner, 'host');
  assert.equal(
    final.players[1].result!.duration - first.players[0].result!.duration,
    500,
  );
});

void test('storage HTTP failures cannot masquerade as successful conditional writes', async (context) => {
  const { checkedBlobFetch } = await import('../lib/race-store.ts');
  let status = 503;
  context.mock.method(
    globalThis,
    'fetch',
    async () => new Response(null, { status }),
  );
  await assert.rejects(
    checkedBlobFetch('https://storage.example/key', { method: 'PUT' }),
    /HTTP 503/,
  );
  status = 404;
  await assert.rejects(
    checkedBlobFetch('https://storage.example/key', { method: 'PUT' }),
    /HTTP 404/,
  );
  assert.equal(
    (await checkedBlobFetch('https://storage.example/key', { method: 'GET' }))
      .status,
    404,
  );
  status = 412;
  assert.equal(
    (await checkedBlobFetch('https://storage.example/key', { method: 'PUT' }))
      .status,
    412,
  );
});
