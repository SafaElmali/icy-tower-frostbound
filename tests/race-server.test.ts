import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setEnvironmentContext } from '@netlify/blobs';
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
  DEFAULT_RACE_SETTINGS,
  type RaceSettings,
  RACE_DURATION_MS,
  RACE_DISCONNECT_MS,
  RACE_ROOM_TTL_MS,
  type RaceAction,
} from '../lib/race-protocol.ts';
import { RaceSimulation } from '../lib/race-simulation.ts';
import { freshControls } from '../lib/tower-engine.ts';
import { raceBlobStore } from '../lib/race-store.ts';

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
function climb(
  seed: number,
  goal = RACE_TARGET,
  settings: RaceSettings = DEFAULT_RACE_SETTINGS,
) {
  const simulation = new RaceSimulation(seed, settings);
  const engine = simulation.engine;
  let target = engine.platforms[1],
    wasJump = false;
  for (
    let frame = 0;
    frame < (settings.durationMs / 1000) * 120 && !simulation.finished;
    frame++
  ) {
    if (engine.grounded && !simulation.respawning)
      target = engine.platforms.find(
        (p) => p.id === Math.max(0, engine.standingId) + 1,
      )!;
    const steering = (target.x - engine.x) * 3.8 - engine.vx * 1.1;
    const jump: boolean = engine.grounded && !wasJump;
    simulation.step(
      engine.floor >= goal
        ? freshControls()
        : {
            left: steering < -0.35,
            right: steering > 0.35,
            jump,
          },
    );
    engine.drainEvents();
    wasJump = jump;
  }
  return {
    get floor() {
      return engine.floor;
    },
    get time() {
      return simulation.frame / 120;
    },
    getRecording: () => simulation.getRecording(),
    engine,
  };
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
    pose: { ...racePose(engine.engine), floor: 30 },
  });
  const finishing = await h.act(host, 'finish', {
    replay: engine.getRecording()!,
  });
  assert.equal(finishing.phase, 'finishing');
  assert.equal(finishing.players[0].result!.kind, 'goal');
  await h.travel(3100);
  const result = await h.act(guest, 'poll');
  assert.equal(result.phase, 'finished');
  assert.equal(result.winner, 'host');
  assert.equal(result.reason, 'goal');
  assert.equal(result.players[0].result!.floor, engine.floor);
  assert.equal(result.players[1].result, null);
});

void test('timed runs compare verified height and equal goal floors draw', async () => {
  for (const tied of [false, true]) {
    const h = harness();
    const start = await h.both();
    const a = climb(start.seed, tied ? RACE_TARGET : 8),
      b = climb(start.seed, tied ? RACE_TARGET : 12);
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
  const late = h.now() + RACE_DURATION_MS;
  for (const invalid of [
    { ...replay, seed: replay.seed + 1 },
    { ...replay, rulesVersion: 4 },
    { ...replay, version: 5 },
    { ...replay, moves: [[0, 8]] },
    { ...replay, moves: [[(RACE_DURATION_MS / 1000) * 120 + 1, 0]] },
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
  const engine = new RaceSimulation(start.seed, start.settings);
  engine.step(freshControls());
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
    const store = raceBlobStore();
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

void test('equal goal floors draw even when one recording arrives earlier', async () => {
  const h = harness();
  const start = await h.both();
  const engine = climb(start.seed);
  await h.travel(4000 + Math.ceil(engine.time * 1000) + 2000);
  const first = await h.act(host, 'finish', { replay: engine.getRecording()! });
  h.advance(500);
  const final = await h.act(guest, 'finish', {
    replay: engine.getRecording()!,
  });
  assert.equal(final.winner, null);
  assert.equal(final.reason, 'draw');
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
  for (const method of ['GET', 'get', 'HEAD', 'head']) {
    assert.equal(
      (await checkedBlobFetch('https://storage.example/key', { method }))
        .status,
      404,
    );
  }
  await assert.rejects(
    checkedBlobFetch('https://storage.example/key', { method: 'put' }),
    /HTTP 404/,
  );
  status = 412;
  assert.equal(
    (await checkedBlobFetch('https://storage.example/key', { method: 'PUT' }))
      .status,
    412,
  );
});

void test('the host chooses bounded rules and changes cancel both readiness and countdown', async () => {
  const h = harness();
  const settings = { targetFloor: 55, durationMs: 300_000, bumping: true };
  const created = await h.act(host, 'create', { settings });
  assert.deepEqual(created.settings, settings);
  await h.act(guest, 'join');
  await assert.rejects(
    h.act(guest, 'configure', { settings: DEFAULT_RACE_SETTINGS }),
    { status: 403 },
  );
  await h.act(host, 'ready', { ready: true });
  await h.act(guest, 'ready', { ready: true });
  const changed = await h.act(host, 'configure', {
    settings: { ...settings, targetFloor: 20 },
  });
  assert.equal(changed.phase, 'waiting');
  assert.equal(changed.startAt, null);
  assert.ok(changed.players.every((p) => !p.ready));
  assert.equal(changed.settings.targetFloor, 20);
  for (const invalid of [
    { ...settings, targetFloor: 4 },
    { ...settings, targetFloor: 101 },
    { ...settings, targetFloor: 20.5 },
    { ...settings, durationMs: 90_000 },
    { ...settings, bumping: 'true' },
  ])
    await assert.rejects(
      h.act(host, 'configure', { settings: invalid as RaceSettings }),
      { status: 400 },
    );
  await h.act(host, 'ready', { ready: true });
  const countdown = await h.act(guest, 'ready', { ready: true });
  assert.equal(countdown.deadline, countdown.startAt! + settings.durationMs);
  h.advance(4000);
  await assert.rejects(h.act(host, 'configure', { settings }), { status: 409 });
});

void test('a configured 20-floor finish is capped and terminal poses use verified scores', async () => {
  const h = harness(),
    settings = { ...DEFAULT_RACE_SETTINGS, targetFloor: 20 };
  await h.act(host, 'create', { settings });
  await h.act(guest, 'join');
  await h.act(host, 'ready', { ready: true });
  const start = await h.act(guest, 'ready', { ready: true });
  const run = climb(start.seed, settings.targetFloor, settings);
  await h.travel(4000 + Math.ceil(run.time * 1000));
  const result = await h.act(host, 'finish', {
    seq: 2,
    pose: { ...racePose(run.engine), floor: 19, checkpointFloor: 15 },
    replay: run.getRecording(),
  });
  assert.equal(result.players[0].result!.floor, 20);
  assert.equal(result.players[0].pose!.floor, 20);
  h.advance(500);
  const tied = await h.act(guest, 'finish', { replay: run.getRecording() });
  assert.equal(tied.reason, 'draw');
  assert.equal(tied.winner, null);
});

void test('falling is replayed as checkpoint recovery and never accepted as a final climb', async () => {
  const h = harness();
  const start = await h.both();
  const simulation = new RaceSimulation(start.seed, start.settings);
  for (let frame = 0; frame < 6_000 && !simulation.respawning; frame++) {
    simulation.step({ left: true, right: false, jump: frame % 120 < 40 });
    simulation.engine.drainEvents();
  }
  assert.equal(simulation.respawning, true);
  await h.travel(4000 + (simulation.frame / 120) * 1000);
  await assert.rejects(
    h.act(host, 'finish', { replay: simulation.getRecording() }),
    /still in progress/,
  );
  for (let frame = 0; frame < 110; frame++) simulation.step(freshControls());
  assert.equal(simulation.respawning, false);
  assert.equal(simulation.engine.status, 'playing');
  assert.equal((await h.act(guest, 'poll')).players[0].result, null);
});

void test('only paired, bounded and matching member connection signals are relayed', async () => {
  const h = harness();
  await h.act(host, 'create');
  await h.act(guest, 'join');
  const offer = {
    type: 'offer' as const,
    sdp: 'v=0\r\ns=host',
    generation: 'generation_1',
  };
  const answer = { ...offer, type: 'answer' as const, sdp: 'v=0\r\ns=guest' };
  await assert.rejects(h.act(guest, 'signal', { signal: offer }), {
    status: 400,
  });
  await assert.rejects(h.act(guest, 'signal', { signal: answer }), {
    status: 409,
  });
  await h.act(host, 'signal', { signal: offer });
  const paired = await h.act(guest, 'signal', { signal: answer });
  assert.deepEqual(paired.signals, { host: offer, guest: answer });
  assert.deepEqual(
    (await h.act(host, 'signal', { signal: offer })).signals,
    paired.signals,
  );
  await assert.rejects(h.act(stranger, 'signal', { signal: offer }), {
    status: 403,
  });
  await assert.rejects(
    h.act(host, 'signal', {
      signal: { ...offer, sdp: 'x'.repeat(16 * 1024 + 1) },
    }),
    { status: 400 },
  );
  await assert.rejects(
    h.act(host, 'signal', { signal: { ...offer, generation: '../secret' } }),
    { status: 400 },
  );
  const newer = await h.act(host, 'signal', {
    signal: { ...offer, generation: 'generation_2' },
  });
  assert.equal(newer.signals.guest, undefined);
  await assert.rejects(h.act(guest, 'signal', { signal: answer }), {
    status: 409,
  });
  assert.deepEqual(
    (await h.act(host, 'signal', { round: 0, signal: offer })).signals,
    newer.signals,
  );
});

void test('shoves require enabled rules, nearby fresh unprotected players, facing and cooldown', async () => {
  const h = harness();
  const settings = { ...DEFAULT_RACE_SETTINGS, bumping: true };
  await h.act(host, 'create', { settings });
  await h.act(guest, 'join');
  await h.act(host, 'ready', { ready: true });
  const start = await h.act(guest, 'ready', { ready: true });
  const base = racePose(createRaceEngine(start.seed));
  await assert.rejects(h.act(host, 'bump', { direction: 1 }), { status: 409 });
  h.advance(4000);
  await h.act(guest, 'poll', { seq: 1, pose: { ...base, x: 1, facing: -1 } });
  const bump = await h.act(host, 'bump', { direction: 1, seq: 1, pose: base });
  assert.equal(bump.bumps.length, 1);
  assert.deepEqual(bump.bumps[0], {
    id: '1-1',
    from: 'host',
    to: 'guest',
    direction: 1,
    at: h.now(),
    targetFrame: 0,
  });
  await assert.rejects(h.act(host, 'bump', { direction: 1 }), /recharging/);
  h.advance(1600);
  await assert.rejects(
    h.act(host, 'bump', { direction: 1, seq: 2, pose: base }),
    /closer/,
  );
  await h.act(guest, 'poll', {
    seq: 2,
    pose: { ...base, x: 1, protected: true },
  });
  await assert.rejects(
    h.act(host, 'bump', { direction: 1, seq: 2, pose: base }),
    /closer/,
  );
  await h.act(guest, 'poll', { seq: 3, pose: { ...base, x: 1 } });
  await assert.rejects(
    h.act(host, 'bump', { direction: -1, seq: 2, pose: base }),
    /closer/,
  );
  await h.act(guest, 'poll', { seq: 4, pose: { ...base, x: 5 } });
  await assert.rejects(
    h.act(host, 'bump', { direction: 1, seq: 2, pose: base }),
    /closer/,
  );
  assert.equal(
    (await h.act(host, 'bump', { round: 0, direction: 1 })).bumps.length,
    1,
  );
  const disabled = harness();
  await disabled.both();
  disabled.advance(4000);
  await assert.rejects(disabled.act(host, 'bump', { direction: 1 }), /off/);
});

void test('replay shoves must be issued by the server for that victim, after its known frame', async () => {
  const h = harness();
  const settings = { ...DEFAULT_RACE_SETTINGS, bumping: true };
  await h.act(host, 'create', { settings });
  await h.act(guest, 'join');
  await h.act(host, 'ready', { ready: true });
  const start = await h.act(guest, 'ready', { ready: true });
  h.advance(4100);
  const simulation = new RaceSimulation(start.seed, settings);
  for (let frame = 0; frame < 12; frame++) simulation.step(freshControls());
  await h.act(guest, 'poll', { seq: 1, pose: { ...simulation.pose, x: 1 } });
  const issued = await h.act(host, 'bump', {
    direction: 1,
    seq: 1,
    pose: simulation.pose,
  });
  simulation.applyBump(issued.bumps[0]);
  simulation.step(freshControls());
  await h.travel(settings.durationMs);
  const stored = (await h.store.getWithMetadata(`rooms/${room}`, {
    type: 'json',
  }))!.data;
  const replay = simulation.getRecording();
  assert.equal(verifyRaceFinish(replay, stored, h.now(), 'guest').kind, 'time');
  assert.throws(
    () => verifyRaceFinish(replay, stored, h.now(), 'host'),
    /belong/,
  );
  assert.throws(
    () =>
      verifyRaceFinish(
        { ...replay, bumps: [{ id: 'forged', frame: 12 }] },
        stored,
        h.now(),
        'guest',
      ),
    /belong/,
  );
  assert.throws(
    () =>
      verifyRaceFinish(
        { ...replay, bumps: [{ ...replay.bumps[0], frame: 0 }] },
        stored,
        h.now(),
        'guest',
      ),
    /belong/,
  );
  assert.throws(
    () =>
      verifyRaceFinish(
        { ...replay, bumps: [replay.bumps[0], replay.bumps[0]] },
        stored,
        h.now(),
        'guest',
      ),
    /Invalid/,
  );
  const omitted = {
    ...replay,
    moves: [[1200, 0]] as [number, number][],
    bumps: [],
  };
  assert.throws(
    () => verifyRaceFinish(omitted, stored, h.now(), 'guest'),
    /missing a shove/,
  );
});

void test('pre-update rooms report a clear expiry instead of mixing race protocols', async () => {
  const h = harness();
  await h.act(host, 'create');
  const key = `rooms/${room}`;
  const stored = (await h.store.getWithMetadata(key, { type: 'json' }))!;
  Reflect.deleteProperty(stored.data, 'protocolVersion');
  await h.store.setJSON(key, stored.data, {
    onlyIfMatch: stored.etag!,
    metadata: { expiresAt: stored.data.expiresAt },
  });
  await assert.rejects(h.act(host, 'poll'), {
    status: 410,
    message: 'The race rules have been updated. Create a new room.',
  });
});

void test('the settlement window verifies unfinished progress, including a backgrounded zero-frame player', async () => {
  for (const noFrames of [false, true]) {
    const h = harness();
    const start = await h.both();
    const winner = climb(start.seed);
    const unfinished = new RaceSimulation(start.seed, start.settings);
    if (!noFrames) {
      const [count, mask] = winner.getRecording().moves[0];
      for (let frame = 0; frame < count; frame++)
        unfinished.step({
          left: !!(mask & 1),
          right: !!(mask & 2),
          jump: !!(mask & 4),
        });
    }
    h.advance(4000);
    await assert.rejects(
      h.act(guest, 'finish', { replay: unfinished.getRecording() }),
      /still in progress|ahead/,
    );
    await h.travel(Math.ceil(winner.time * 1000));
    const goal = await h.act(host, 'finish', { replay: winner.getRecording() });
    assert.equal(goal.phase, 'finishing');
    h.advance(700);
    const result = await h.act(guest, 'finish', {
      replay: unfinished.getRecording(),
    });
    assert.equal(result.phase, 'finished');
    assert.equal(result.players[1].result!.floor, unfinished.engine.floor);
    assert.equal(result.players[1].result!.kind, 'time');
    assert.equal(result.winner, 'host');
  }
});

void test('rematches preserve saved rules and signaling while clearing previous shove events', async () => {
  const h = harness(),
    settings = { ...DEFAULT_RACE_SETTINGS, bumping: true, targetFloor: 45 };
  await h.act(host, 'create', { settings });
  await h.act(guest, 'join');
  const offer = {
    type: 'offer' as const,
    generation: 'same_connection',
    sdp: 'v=0\r\ns=host',
  };
  const answer = { ...offer, type: 'answer' as const, sdp: 'v=0\r\ns=guest' };
  await h.act(host, 'signal', { signal: offer });
  await h.act(guest, 'signal', { signal: answer });
  await h.act(host, 'ready', { ready: true });
  const start = await h.act(guest, 'ready', { ready: true });
  h.advance(4000);
  const pose = racePose(createRaceEngine(start.seed));
  await h.act(guest, 'poll', { seq: 1, pose: { ...pose, x: 1 } });
  await h.act(host, 'bump', { seq: 1, pose, direction: 1 });
  await h.act(host, 'leave');
  await h.act(host, 'rematch');
  const rematch = await h.act(guest, 'rematch');
  assert.equal(rematch.round, 2);
  assert.deepEqual(rematch.settings, settings);
  assert.deepEqual(rematch.signals, { host: offer, guest: answer });
  assert.deepEqual(rematch.bumps, []);
});
