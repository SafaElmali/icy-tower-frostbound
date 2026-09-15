import test from 'node:test';
import assert from 'node:assert/strict';
import { freshControls, platformFloor } from '../lib/tower-engine.ts';
import {
  RaceSimulation,
  RACE_PUSH_PROTECTION_FRAMES,
  RACE_RESPAWN_FRAMES,
  replayRaceRecording,
} from '../lib/race-simulation.ts';
import { RaceRunner } from '../lib/race-runner.ts';
import { type RaceBumpEvent, type RaceSettings } from '../lib/race-protocol.ts';

const settings: RaceSettings = {
  targetFloor: 35,
  durationMs: 180_000,
  bumping: true,
};
const bump = (id: string, direction: -1 | 1 = 1): RaceBumpEvent => ({
  id,
  from: 'guest',
  to: 'host',
  at: 0,
  targetFrame: 0,
  direction,
});

function pilot(simulation: RaceSimulation) {
  let target = simulation.engine.platforms[1];
  let wasJump = false;
  return () => {
    const e = simulation.engine;
    if (e.grounded) {
      const standing = e.platforms.find(
        (platform) => platform.id === e.standingId,
      )!;
      target =
        e.platforms.find(
          (platform) => platform.id === platformFloor(standing) + 1,
        ) ?? target;
    }
    const steering = (target.x - e.x) * 3.8 - e.vx * 1.1;
    const jump: boolean = e.grounded && !wasJump;
    wasJump = jump;
    return { left: steering < -0.35, right: steering > 0.35, jump };
  };
}

function assertSameSimulation(
  actual: RaceSimulation,
  expected: RaceSimulation,
) {
  assert.deepEqual(actual.engine.snapshot(), expected.engine.snapshot());
  assert.deepEqual(actual.pose, expected.pose);
  assert.equal(actual.finished, expected.finished);
  assert.equal(actual.frame, expected.frame);
}

void test('a fall keeps animating, respawns at its checkpoint and remains replayable through a later finish', () => {
  const simulation = new RaceSimulation(17, settings),
    controls = pilot(simulation);
  while (simulation.engine.floor < 8) simulation.step(controls());
  assert.equal(simulation.checkpointFloor, 5);
  while (!simulation.respawning && !simulation.finished)
    simulation.step(freshControls());
  assert.equal(simulation.finished, null);
  const pushes = [bump('recovering'), bump('just-respawned', -1)];
  assert.equal(
    simulation.applyBump(pushes[0]),
    false,
    'a fallen player cannot be pushed',
  );
  const fallenFrame = simulation.frame,
    fallenY = simulation.engine.y;
  simulation.step(freshControls());
  assert.ok(
    simulation.engine.y < fallenY,
    'the climber is not frozen in the air',
  );
  while (simulation.respawning) simulation.step(freshControls());
  assert.equal(simulation.frame - fallenFrame, RACE_RESPAWN_FRAMES);
  assert.equal(simulation.engine.status, 'playing');
  assert.equal(simulation.engine.standingId, 5);
  assert.equal(simulation.engine.grounded, true);
  assert.equal(simulation.protected, true);
  assert.equal(
    simulation.applyBump(pushes[1]),
    false,
    'checkpoint protection grants time to recover',
  );
  assert.ok(simulation.engine.y > simulation.engine.stormY + 7);
  while (!simulation.finished) simulation.step(controls());
  assert.equal(simulation.finished, 'goal');
  assert.equal(simulation.engine.floor, 35);
  assertSameSimulation(
    replayRaceRecording(simulation.getRecording(), settings, pushes),
    simulation,
  );
});

void test('checkpoint recovery restores ledges even after the camera has pruned their objects', () => {
  const simulation = new RaceSimulation(17, settings),
    controls = pilot(simulation);
  while (simulation.engine.floor < 8) simulation.step(controls());
  simulation.engine.platforms = simulation.engine.platforms.filter(
    (platform) => platform.id > 8,
  );
  simulation.engine.stormY = simulation.engine.y + 1;
  simulation.step(freshControls());
  assert.equal(simulation.respawning, true);
  for (let frame = 0; frame < RACE_RESPAWN_FRAMES; frame++)
    simulation.step(freshControls());
  assert.equal(simulation.engine.standingId, 5);
  assert.ok(simulation.engine.platforms.some((platform) => platform.id === 6));
  simulation.step({ left: false, right: false, jump: true });
  assert.equal(simulation.engine.status, 'playing');
  assert.ok(
    simulation.engine.vy > 0,
    'a recovered player can jump toward the next ledge',
  );
});

void test('host targets up to floor 100 use the same static course and finish on a landed pose', () => {
  const configured = { ...settings, targetFloor: 100, durationMs: 300_000 };
  const simulation = new RaceSimulation(17, configured),
    controls = pilot(simulation);
  while (!simulation.finished) simulation.step(controls());
  assert.equal(simulation.finished, 'goal');
  assert.equal(simulation.engine.floor, 100);
  assert.equal(
    simulation.engine.platforms.some((platform) => platform.moving),
    false,
  );
  assert.equal(simulation.engine.grounded, true);
  assert.equal(simulation.engine.vy, 0);
  assert.equal(simulation.engine.vx, 0);
  assert.equal(
    simulation.engine.y,
    simulation.engine.platforms.find(
      (platform) => platform.id === simulation.engine.standingId,
    )!.y,
  );
  assertSameSimulation(
    replayRaceRecording(simulation.getRecording(), configured, []),
    simulation,
  );
});

void test('goal progress never exposes a landing beyond the selected target', () => {
  const configured = { ...settings, targetFloor: 5 };
  const simulation = new RaceSimulation(17, configured),
    controls = pilot(simulation);
  while (!simulation.finished) simulation.step(controls());
  assert.equal(simulation.pose.floor, 5);
  assert.equal(simulation.pose.checkpointFloor, 5);
  assert.equal(simulation.pose.grounded, true);
  const snapshot = simulation.pose;
  simulation.step({ left: true, right: false, jump: true });
  assert.deepEqual(simulation.pose, snapshot);
});

void test('approved pushes use a fixed impulse and reproduce identically from recorded events', () => {
  const simulation = new RaceSimulation(17, settings),
    controls = pilot(simulation),
    event = bump('push-1');
  for (let frame = 0; frame < 300; frame++) simulation.step(controls());
  assert.equal(simulation.applyBump(event), true);
  assert.equal(simulation.engine.vx, 7.5);
  assert.equal(simulation.engine.grounded, false);
  for (let frame = 0; frame < 700; frame++) simulation.step(controls());
  const recording = simulation.getRecording();
  assert.deepEqual(recording.bumps, [{ id: 'push-1', frame: 300 }]);
  assertSameSimulation(
    replayRaceRecording(recording, settings, [event], 'host'),
    simulation,
  );
  assert.throws(
    () => replayRaceRecording(recording, settings, [], 'host'),
    /push recording/,
  );
  assert.throws(
    () => replayRaceRecording(recording, settings, [event], 'guest'),
    /push recording/,
  );
  assert.throws(
    () =>
      replayRaceRecording(
        recording,
        settings,
        [{ ...event, targetFrame: 301 }],
        'host',
      ),
    /before it was issued/,
  );
});

void test('push immunity and repeated delivery cannot stack impulses or change replay results', () => {
  const simulation = new RaceSimulation(17, settings),
    events = [bump('first'), bump('second', -1), bump('third', -1)];
  assert.equal(simulation.applyBump(events[0]), true);
  assert.equal(simulation.applyBump(events[0]), false);
  assert.equal(simulation.applyBump(events[1]), false);
  assert.equal(simulation.engine.vx, 7.5);
  assert.equal(simulation.getRecording().bumps.length, 2);
  for (let frame = 0; frame < RACE_PUSH_PROTECTION_FRAMES; frame++)
    simulation.step(freshControls());
  assert.equal(simulation.protected, false);
  assert.equal(simulation.applyBump(events[2]), true);
  assert.equal(simulation.engine.vx, -7.5);
  simulation.step(freshControls());
  assertSameSimulation(
    replayRaceRecording(simulation.getRecording(), settings, events, 'host'),
    simulation,
  );
  const disabled = new RaceSimulation(17, { ...settings, bumping: false });
  assert.equal(disabled.applyBump(events[0]), false);
  assert.equal(disabled.getRecording().bumps.length, 0);
});

void test('a shared deadline ends safely on a ledge even while the player is airborne', () => {
  const runner = new RaceRunner(1, 17, { ...settings, durationMs: 60_000 });
  runner.advance(0, 0, freshControls());
  runner.advance(100, 0, { left: false, right: true, jump: true });
  assert.equal(runner.engine.grounded, false);
  runner.advance(60_000, 0, freshControls());
  assert.equal(runner.finished, 'time');
  assert.ok(runner.recording);
  assert.equal(runner.engine.grounded, true);
  assert.equal(runner.engine.vx, 0);
  assert.equal(runner.engine.vy, 0);
  assert.ok(runner.frame < 100, 'background time does not invent input frames');
  const replay = replayRaceRecording(
    runner.recording,
    runner.simulation.settings,
    [],
  );
  replay.finishTime();
  assertSameSimulation(replay, runner.simulation);
});

void test('server settlement snapshots partial progress once without inventing more input', () => {
  const runner = new RaceRunner(1, 17, settings),
    controls = pilot(runner.simulation);
  let clockFrame = 0;
  runner.advance(0, 0, freshControls());
  while (runner.engine.floor < 8)
    runner.advance((++clockFrame * 1000) / 120, 0, controls());
  runner.advance((++clockFrame * 1000) / 120, 0, freshControls());
  runner.advance((++clockFrame * 1000) / 120, 0, {
    left: false,
    right: true,
    jump: true,
  });
  assert.equal(runner.engine.grounded, false);
  const frame = runner.frame,
    floor = runner.engine.floor;
  const recording = runner.finish();
  assert.equal(runner.recording, recording);
  assert.equal(
    runner.finish(),
    recording,
    'repeated settlement delivery is idempotent',
  );
  assert.equal(runner.frame, frame);
  assert.equal(
    recording.moves.reduce((total, [count]) => total + count, 0),
    frame,
  );
  assert.equal(runner.engine.floor, floor);
  assert.equal(runner.engine.grounded, true);
  const replay = replayRaceRecording(recording, settings, []);
  replay.finishTime();
  assertSameSimulation(replay, runner.simulation);
  runner.advance((++clockFrame * 1000) / 120, 0, controls());
  assertSameSimulation(replay, runner.simulation);
});

void test('a backgrounded player can report zero verified frames when the server settles', () => {
  const runner = new RaceRunner(1, 17, settings);
  const recording = runner.finish();
  assert.deepEqual(recording.moves, []);
  assert.equal(runner.engine.floor, 0);
  const replay = replayRaceRecording(recording, settings, []);
  replay.finishTime();
  assertSameSimulation(replay, runner.simulation);
});

void test('a frame crossing the deadline cannot simulate controls from after the deadline', () => {
  const runner = new RaceRunner(1, 17, { ...settings, durationMs: 60_000 });
  runner.advance(0, 0, freshControls());
  runner.advance(59_999, 0, freshControls());
  const frame = runner.frame;
  runner.advance(60_100, 0, { left: false, right: true, jump: true });
  assert.equal(
    runner.frame,
    frame,
    'only the final millisecond was eligible for simulation',
  );
  assert.equal(runner.finished, 'time');
});

void test('verification rejects malformed moves, duplicate pushes and input after the finish', () => {
  const simulation = new RaceSimulation(17, { ...settings, targetFloor: 5 }),
    controls = pilot(simulation);
  while (!simulation.finished) simulation.step(controls());
  const recording = simulation.getRecording();
  assert.throws(
    () =>
      replayRaceRecording(
        { ...recording, moves: [...recording.moves, [1, 0]] },
        simulation.settings,
        [],
      ),
    /after finishing/,
  );
  assert.throws(
    () =>
      replayRaceRecording(
        { ...recording, moves: [[1, 8]] },
        simulation.settings,
        [],
      ),
    /controls/,
  );
  assert.throws(
    () =>
      replayRaceRecording(
        { ...recording, moves: [[36_001, 0]] },
        simulation.settings,
        [],
      ),
    /time limit/,
  );
  assert.throws(
    () =>
      replayRaceRecording(
        {
          ...recording,
          bumps: [
            { id: 'a', frame: 0 },
            { id: 'a', frame: 1 },
          ],
        },
        simulation.settings,
        [bump('a')],
      ),
    /push recording/,
  );
});
