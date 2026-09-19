import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RACE_SETTINGS,
  createRaceEngine,
  type RaceSettings,
} from '../lib/race-protocol.ts';
import {
  RaceSimulation,
  replayRaceRecording,
  RACE_RESPAWN_FRAMES,
} from '../lib/race-simulation.ts';
import { RaceService } from '../lib/race-server.ts';
import { MemoryRaceStore } from '../lib/race-dev-server.ts';
import { freshControls, DOUBLE_JUMP_DURATION } from '../lib/tower-engine.ts';
import { RaceConnection, listRaceLobbies } from '../lib/race-client.ts';
import { createRaceHandler } from '../lib/race-http.ts';

const party: RaceSettings = {
  ...DEFAULT_RACE_SETTINGS,
  mode: 'party',
  durationMs: 60_000,
};
const jump = { ...freshControls(), jump: true };

void test('Party races share the Classic course with lower gravity and spring ledges', () => {
  const classic = createRaceEngine(17),
    festive = createRaceEngine(17, 'party');
  assert.equal(festive.mode, 'party');
  assert.deepEqual(
    festive.platforms.map(({ spring: _spring, ...platform }) => platform),
    classic.platforms.map(({ spring: _spring, ...platform }) => platform),
  );
  assert.ok(festive.platforms.find((p) => p.id === 5)?.spring);
  assert.ok(classic.platforms.every((p) => !p.spring && !p.moving));
  for (let i = 0; i < 60; i++) {
    classic.tick(1 / 120, jump);
    festive.tick(1 / 120, jump);
  }
  assert.ok(festive.y > classic.y + 0.9);
  assert.ok(festive.platforms.every((p) => !p.moving));
  const spring = festive.platforms.find((p) => p.id === 5)!;
  festive.x = spring.x;
  festive.y = spring.y + 0.02;
  festive.vy = -5;
  festive.grounded = false;
  festive.tick(1 / 120, freshControls());
  assert.ok(festive.vy >= 19);
  assert.equal(festive.grounded, false);
});

void test('Party race crystals grant one extra jump and checkpoint recovery clears the boost', () => {
  const simulation = new RaceSimulation(17, party),
    e = simulation.engine;
  const crystal = e.platforms.find((p) => p.id === 3)!;
  e.x = crystal.x;
  e.y = crystal.y;
  e.grounded = true;
  e.standingId = 3;
  simulation.step(freshControls());
  assert.equal(e.doubleJumpTime, DOUBLE_JUMP_DURATION);
  simulation.step(jump);
  for (let i = 0; i < 30; i++) simulation.step(freshControls());
  const before = e.vy;
  simulation.step(jump);
  assert.ok(e.vy > before + 3);
  assert.equal(e.snapshot().doubleJumpReady, false);
  simulation.step(freshControls());
  const used = e.vy;
  simulation.step(jump);
  assert.ok(e.vy < used, 'a third jump is not allowed');
  const checkpoint = e.platforms.find((p) => p.id === 5)!;
  e.x = checkpoint.x;
  e.y = checkpoint.y + 0.02;
  e.vy = -5;
  simulation.step(freshControls());
  assert.equal(simulation.checkpointFloor, 5);
  e.stormY = e.y + 1;
  simulation.step(freshControls());
  assert.equal(simulation.respawning, true);
  for (let i = 0; i < RACE_RESPAWN_FRAMES; i++)
    simulation.step(freshControls());
  assert.equal(e.standingId, 5);
  assert.equal(e.mode, 'party');
  assert.equal(e.doubleJumpTime, 0);
  assert.equal(simulation.protected, true);
  simulation.step(jump);
  assert.ok(e.vy > 0, 'the climber can leave the spring checkpoint');
});

void test('Party inputs, shoves and recoveries replay identically and cannot verify as Classic', () => {
  const settings = { ...party, bumping: true };
  const simulation = new RaceSimulation(17, settings);
  const push = {
    id: 'party-push',
    from: 'guest',
    to: 'host',
    at: 0,
    targetFrame: 0,
    direction: 1,
  } as const;
  simulation.applyBump(push);
  let recovered = false;
  while (!simulation.finished) {
    const wasRespawning = simulation.respawning;
    simulation.step({
      left: simulation.frame % 600 > 300,
      right: simulation.frame % 600 <= 300,
      jump: simulation.frame % 80 === 0,
    });
    recovered ||= wasRespawning && !simulation.respawning;
  }
  assert.ok(recovered, 'the recording includes checkpoint recovery');
  const recording = simulation.getRecording();
  const replay = replayRaceRecording(recording, settings, [push], 'host');
  assert.deepEqual(replay.pose, simulation.pose);
  assert.deepEqual(replay.engine.snapshot(), simulation.engine.snapshot());
  assert.throws(
    () =>
      replayRaceRecording(
        recording,
        { ...settings, mode: 'arcade' },
        [push],
        'host',
      ),
    /recording/,
  );
});

void test('two clients share Party rules, changing mode clears readiness, and rematches retain the mode', async () => {
  let now = Date.now();
  const service = new RaceService(
    new MemoryRaceStore(),
    () => now,
    () => 17,
  );
  const handler = createRaceHandler(() => service);
  const transport: typeof fetch = (url, init) =>
    handler(
      new Request(
        url instanceof Request ? url : new URL(url, 'http://tower.test'),
        init,
      ),
    );
  const room = 'a'.repeat(32);
  const host = new RaceConnection(
    { room, token: '1'.repeat(64) },
    () => {},
    transport,
    () => now,
  );
  const guest = new RaceConnection(
    { room, token: '2'.repeat(64) },
    () => {},
    transport,
    () => now,
  );
  const created = await host.send({
    action: 'create',
    visibility: 'public',
    settings: party,
  });
  const joined = await guest.send({ action: 'join' });
  assert.equal(created.settings.mode, 'party');
  assert.deepEqual(joined.settings, created.settings);
  assert.equal(
    (await listRaceLobbies(new AbortController().signal, transport)).lobbies[0]
      .settings.mode,
    'party',
  );
  await assert.rejects(
    guest.send({
      action: 'configure',
      round: 1,
      settings: DEFAULT_RACE_SETTINGS,
    }),
    { status: 403 },
  );
  await host.send({ action: 'ready', round: 1, ready: true });
  await guest.send({ action: 'ready', round: 1, ready: true });
  const changed = await host.send({
    action: 'configure',
    round: 1,
    settings: { ...party, mode: 'arcade' },
  });
  assert.equal(changed.startAt, null);
  assert.ok(changed.players.every((p) => !p.ready));
  assert.equal((await guest.send({ action: 'poll' })).settings.mode, 'arcade');
  await host.send({ action: 'configure', round: 1, settings: party });
  await host.send({ action: 'ready', round: 1, ready: true });
  const starting = await guest.send({ action: 'ready', round: 1, ready: true });
  now = starting.startAt!;
  await assert.rejects(
    host.send({
      action: 'configure',
      round: 1,
      settings: DEFAULT_RACE_SETTINGS,
    }),
    { status: 409 },
  );
  const simulation = new RaceSimulation(starting.seed, party);
  while (!simulation.finished) simulation.step(freshControls());
  // Keep both clients connected while the common deadline elapses.
  for (let elapsed = 0; elapsed < party.durationMs; elapsed += 5_000) {
    now += 5_000;
    await host.send({ action: 'poll' });
    await guest.send({ action: 'poll' });
  }
  await assert.rejects(
    host.send({
      action: 'finish',
      round: 1,
      replay: { ...simulation.getRecording(), mode: 'arcade' },
    }),
    { status: 400 },
  );
  await host.send({
    action: 'finish',
    round: 1,
    replay: simulation.getRecording(),
  });
  const finished = await guest.send({
    action: 'finish',
    round: 1,
    replay: simulation.getRecording(),
  });
  assert.equal(finished.phase, 'finished');
  assert.equal(finished.reason, 'draw');
  await host.send({ action: 'rematch', round: 1 });
  const rematch = await guest.send({ action: 'rematch', round: 1 });
  assert.equal(rematch.round, 2);
  assert.equal(rematch.settings.mode, 'party');
  assert.equal(rematch.phase, 'countdown');
  host.close();
  guest.close();
});

void test('unsupported race modes are rejected, and requests without a mode default to Classic', async () => {
  const service = new RaceService(new MemoryRaceStore());
  for (const mode of ['practice', 'turbo', null, 1]) {
    await assert.rejects(
      service.act(
        {
          action: 'create',
          room: 'b'.repeat(32),
          settings: { ...party, mode },
        },
        '1'.repeat(64),
      ),
      /Classic or Party/,
    );
    assert.throws(
      () => new RaceSimulation(17, { ...party, mode } as RaceSettings),
      /settings/,
    );
  }
  const { mode: _mode, ...legacy } = DEFAULT_RACE_SETTINGS;
  const room = await service.act(
    { action: 'create', room: 'c'.repeat(32), settings: legacy },
    '1'.repeat(64),
  );
  assert.equal(room.settings.mode, 'arcade');
});
