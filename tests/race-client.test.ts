import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RaceConnection,
  RaceRequestError,
  newRaceSession,
  readRaceSession,
} from '../lib/race-client.ts';
import { RaceRunner, RaceRival } from '../lib/race-runner.ts';
import { RaceService } from '../lib/race-server.ts';
import { MemoryRaceStore } from '../lib/race-dev-server.ts';
import { createRaceHandler } from '../lib/race-http.ts';
import {
  raceInvite,
  racePose,
  RACE_TARGET,
  RACE_DURATION_MS,
  type RaceView,
} from '../lib/race-protocol.ts';
import { freshControls } from '../lib/tower-engine.ts';

void test('invite URLs contain only the room capability, never a player session token', () => {
  const session = newRaceSession();
  assert.equal(session.room.length, 32);
  assert.equal(session.token.length, 64);
  const url = new URL(
    raceInvite('https://tower.example/?challenge=old#private', session.room),
  );
  assert.equal(url.pathname, '/race');
  assert.equal(url.searchParams.size, 1);
  assert.equal(url.hash, '');
  assert.equal(url.href.includes(session.token), false);
  assert.deepEqual(readRaceSession(JSON.stringify(session)), session);
  for (const raw of [
    null,
    'null',
    '{}',
    '{bad',
    JSON.stringify({ ...session, token: 'short' }),
    JSON.stringify({ ...session, room: '../escape' }),
  ])
    assert.equal(readRaceSession(raw), null);
});

void test('a countdown consumes no inputs and race simulation stops at the exact goal frame', () => {
  const runner = new RaceRunner(1, 17),
    startAt = 4000;
  for (let now = 0; now <= startAt; now += 10)
    runner.advance(now, startAt, { left: false, right: true, jump: true });
  assert.equal(runner.engine.time, 0);
  assert.equal(runner.engine.x, 0);
  let target = runner.engine.platforms[1],
    wasJump = false;
  for (let frame = 0; frame < 10000 && !runner.recording; frame++) {
    const e = runner.engine;
    if (e.grounded) target = e.platforms.find((p) => p.id === e.floor + 1)!;
    const steering = (target.x - e.x) * 3.8 - e.vx * 1.1;
    const jump: boolean = e.grounded && !wasJump;
    runner.advance(startAt + ((frame + 1) * 1000) / 120, startAt, {
      left: steering < -0.35,
      right: steering > 0.35,
      jump,
    });
    wasJump = jump;
  }
  assert.ok(runner.engine.floor >= RACE_TARGET);
  assert.ok(runner.recording);
  assert.equal(
    runner.engine.getReplay(),
    null,
    'a live goal recording never becomes a solo leaderboard submission',
  );
  const before = runner.engine.snapshot();
  runner.advance(100000, startAt, freshControls());
  assert.deepEqual(runner.engine.snapshot(), before);
});

void test('a background delay does not replay held controls for elapsed wall time; deadline stays shared', () => {
  const runner = new RaceRunner(1, 17);
  runner.advance(0, 0, freshControls());
  runner.advance(60_000, 0, freshControls());
  assert.ok(runner.engine.time <= 0.101);
  runner.advance(RACE_DURATION_MS, 0, freshControls());
  assert.ok(runner.recording);
  assert.ok(runner.engine.time < 1);
});

void test('remote interpolation stays visible across missing packets and does not alter the player', () => {
  const player = new RaceRunner(1, 17),
    before = player.engine.snapshot(),
    rival = new RaceRival();
  rival.receive(
    {
      ...racePose(player.engine),
      x: 6,
      y: 8,
      vx: 10,
      vy: 10,
      time: 2,
      grounded: false,
    },
    100,
    false,
  );
  rival.advance(60000, 1);
  assert.ok(rival.engine.x <= 6.12);
  assert.ok(rival.engine.y < 10);
  rival.receive(null, 60010, true);
  rival.advance(70000, 1);
  assert.equal(rival.finished, false);
  assert.ok(rival.engine.x <= 6.12 && rival.engine.y < 10);
  assert.deepEqual(player.engine.snapshot(), before);
});

void test('late HTTP responses cannot roll a rematch back to an earlier room revision', async () => {
  const session = newRaceSession();
  const replies: Array<(response: Response) => void> = [];
  const transport = (() =>
    new Promise<Response>((resolve) => replies.push(resolve))) as typeof fetch;
  const received: number[] = [],
    client = new RaceConnection(
      session,
      (v) => received.push(v.revision),
      transport,
    );
  const older = client.send({ action: 'poll', round: 1 });
  const newer = client.send({ action: 'rematch', round: 1 });
  const response = (revision: number, round: number) =>
    Response.json({
      id: session.room,
      revision,
      round,
      serverNow: Date.now(),
      players: [],
    });
  replies[1](response(5, 2));
  await newer;
  replies[0](response(4, 1));
  await older;
  assert.equal(client.view!.round, 2);
  assert.deepEqual(received, [5]);
  client.close();
});

void test('two independent clients share a countdown, stream real positions and agree on a verified winner', async () => {
  let now = Date.now();
  const service = new RaceService(
    new MemoryRaceStore(),
    () => now,
    () => 17,
  );
  const handler = createRaceHandler(() => service);
  const transport = ((url: string, init: RequestInit) =>
    handler(
      new Request(new URL(url, 'https://tower.example'), init),
    )) as typeof fetch;
  const session = newRaceSession(),
    views: RaceView[] = [];
  const host = new RaceConnection(
    session,
    (v) => views.push(v),
    transport,
    () => now,
  );
  const guest = new RaceConnection(
    newRaceSession(session.room),
    (v) => views.push(v),
    transport,
    () => now,
  );
  await host.send({ action: 'create' });
  await guest.send({ action: 'join' });
  await host.send({ action: 'ready', round: 1, ready: true });
  const start = await guest.send({ action: 'ready', round: 1, ready: true });
  await host.send({ action: 'poll', round: 1 });
  assert.equal(host.view!.startAt, guest.view!.startAt);
  assert.equal(host.now(), guest.now());
  const runners = [
    new RaceRunner(1, start.seed),
    new RaceRunner(1, start.seed),
  ];
  assert.deepEqual(runners[0].engine.platforms, runners[1].engine.platforms);
  const startAt = start.startAt!;
  now = startAt;
  const targets = runners.map((r) => r.engine.platforms[1]),
    wasJump = [false, false];
  for (
    let frame = 0;
    frame < 10000 && host.view!.phase !== 'finished';
    frame++
  ) {
    now = startAt + (frame * 1000) / 120;
    for (const [index, r] of runners.entries()) {
      if ([host, guest][index].view?.phase === 'finishing') r.finish();
      const e = r.engine;
      if (e.grounded)
        targets[index] = e.platforms.find((p) => p.id === e.floor + 1)!;
      const steering = (targets[index].x - e.x) * 3.8 - e.vx * 1.1;
      const jump = e.grounded && !wasJump[index];
      r.advance(
        now,
        startAt,
        index === 1 && frame < 180
          ? freshControls()
          : { left: steering < -0.35, right: steering > 0.35, jump },
      );
      wasJump[index] = jump;
    }
    if (frame % 60 === 0)
      for (const [index, client] of [host, guest].entries()) {
        const r = runners[index],
          me = client.view!.players.find((p) => p.slot === client.view!.you)!;
        await client.send(
          r.recording && !me.result && client.view!.phase !== 'finished'
            ? {
                action: 'finish',
                round: 1,
                replay: r.recording,
                pose: r.pose,
                seq: frame,
              }
            : {
                action: 'poll',
                round: 1,
                seq: frame,
                pose: r.pose,
              },
        );
      }
  }
  await host.send({ action: 'poll', round: 1 });
  await guest.send({ action: 'poll', round: 1 });
  assert.equal(host.view!.phase, 'finished');
  assert.equal(guest.view!.phase, 'finished');
  assert.equal(host.view!.winner, 'host');
  assert.equal(guest.view!.winner, 'host');
  assert.ok(host.view!.players.every((p) => p.result));
  assert.equal(
    host.view!.players[0].pose!.floor,
    host.view!.players[0].result!.floor,
  );
  assert.ok(
    views.some((v) => v.players.some((p) => p.pose && p.pose.floor > 5)),
  );
  host.close();
  guest.close();
  await assert.rejects(
    host.send({ action: 'poll', round: 1 }),
    RaceRequestError,
  );
});
