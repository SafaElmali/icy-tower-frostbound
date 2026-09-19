import test from 'node:test';
import assert from 'node:assert/strict';
import { freshControls, TowerEngine } from '../lib/tower-engine.ts';
import { createRaceEngine } from '../lib/race-protocol.ts';
import {
  RaceSimulation,
  RACE_RESPAWN_FRAMES,
  replayRaceRecording,
} from '../lib/race-simulation.ts';
import {
  sampleRaceHazards,
  RACE_ICE_START_FRAME,
  RACE_ICE_WARNING_FRAMES,
  RACE_BAT_START_FRAME,
  RACE_BAT_WARNING_FRAMES,
} from '../lib/race-hazards.ts';

void test('race weather gives a complete warning before early-course ice and bats attack', () => {
  assert.deepEqual(sampleRaceHazards(17, RACE_ICE_START_FRAME - 1, 5.2), {
    icicles: [],
    bats: [],
  });
  const warning = sampleRaceHazards(17, RACE_ICE_START_FRAME, 5.2).icicles[0];
  assert.equal(warning.state, 'warning');
  assert.equal(warning.warningTime, 1.1);
  assert.equal(warning.targetY, 3 * 2.35);
  assert.equal(
    sampleRaceHazards(
      17,
      RACE_ICE_START_FRAME + RACE_ICE_WARNING_FRAMES - 1,
      5.2,
    ).icicles[0].state,
    'warning',
  );
  const falling = sampleRaceHazards(
    17,
    RACE_ICE_START_FRAME + RACE_ICE_WARNING_FRAMES + 1,
    5.2,
  ).icicles[0];
  assert.equal(falling.state, 'falling');
  assert.ok(falling.y < warning.y);
  assert.ok(falling.vy < 0);
  assert.equal(
    sampleRaceHazards(17, RACE_BAT_START_FRAME - 1, 5.2).bats.length,
    0,
  );
  const bat = sampleRaceHazards(17, RACE_BAT_START_FRAME, 5.2).bats[0];
  assert.equal(bat.warningTime, 0.85);
  assert.equal(bat.originY, 5 * 2.35 + 0.8);
  assert.equal(bat.phase, 0);
  const flying = sampleRaceHazards(
    17,
    RACE_BAT_START_FRAME + RACE_BAT_WARNING_FRAMES + 1,
    5.2,
  ).bats[0];
  assert.equal(flying.warningTime, 0);
  assert.ok(Math.abs(flying.x) < Math.abs(bat.x));
});

void test('weather is bounded and identical across player positions and overlapping course regions', () => {
  const left = createRaceEngine(17),
    right = createRaceEngine(17);
  left.x = -5;
  right.x = 5;
  for (let frame = 1; frame < 36000; frame += 61) {
    left.advanceRaceHazards(frame);
    right.advanceRaceHazards(frame);
    assert.deepEqual(left.action, right.action);
    for (const cameraY of [5.2, 23.5, 80, 160, 240]) {
      const nearby = sampleRaceHazards(17, frame, cameraY);
      assert.ok(nearby.icicles.length <= 4);
      assert.ok(nearby.bats.length <= 4);
      const adjacent = sampleRaceHazards(17, frame, cameraY + 3);
      for (const kind of ['icicles', 'bats'] as const) {
        for (const hazard of nearby[kind]) {
          const shared = adjacent[kind].find((other) => other.id === hazard.id);
          if (shared) assert.deepEqual(hazard, shared);
        }
      }
    }
  }
  assert.notDeepEqual(
    sampleRaceHazards(17, 240, 5.2),
    sampleRaceHazards(18, 240, 5.2),
  );
});

void test('race weather leaves legacy solo physics and platform generation unchanged', () => {
  const solo = new TowerEngine(17, false, 5);
  solo.start('arcade');
  solo.useStaticRacePlatforms();
  const race = createRaceEngine(17);
  assert.equal(race.rulesVersion, 5);
  for (let frame = 1; frame <= 1200; frame++) {
    race.advanceRaceHazards(frame);
    solo.tick(1 / 120, freshControls());
    race.tick(1 / 120, freshControls());
  }
  assert.equal(solo.action.icicles.length, 0);
  assert.equal(solo.action.bats.length, 0);
  assert.deepEqual(race.platforms, solo.platforms);
  assert.ok(
    race.platforms.every((platform) => !platform.crumble && !platform.moving),
  );
  assert.equal(race.action.frenzies, 0);
  assert.equal(race.action.encounter, null);
});

function placeInFallingIce(simulation: RaceSimulation) {
  simulation.frame = RACE_ICE_START_FRAME + RACE_ICE_WARNING_FRAMES + 30;
  const ice = sampleRaceHazards(
    simulation.engine.seed,
    simulation.frame + 1,
    5.2,
  ).icicles[0];
  simulation.engine.x = ice.x;
  simulation.engine.y = ice.y - 0.7;
  simulation.engine.grounded = false;
  simulation.engine.vy = 0;
  return ice.id;
}

void test('falling ice knocks a runner back once and its shield protects against the next hazard', () => {
  const simulation = new RaceSimulation(17);
  const id = placeInFallingIce(simulation);
  simulation.step(freshControls());
  assert.equal(simulation.engine.action.hits, 1);
  assert.equal(simulation.protected, true);
  assert.equal(simulation.engine.action.invulnerableTime, 1.65);
  assert.ok(simulation.engine.vy >= 9.2);
  assert.ok(Math.abs(simulation.engine.vx) === 5);
  simulation.step(freshControls());
  assert.ok(simulation.engine.action.icicles.every((ice) => ice.id !== id));
  assert.equal(simulation.engine.action.hits, 1);
});

void test('shove and checkpoint shields also prevent obstacle damage', () => {
  const pushed = new RaceSimulation(17, {
    mode: 'arcade',
    targetFloor: 30,
    durationMs: 180000,
    bumping: true,
  });
  placeInFallingIce(pushed);
  assert.equal(
    pushed.applyBump({
      id: 'shield',
      from: 'guest',
      to: 'host',
      at: 0,
      targetFrame: 0,
      direction: 1,
    }),
    true,
  );
  assert.equal(pushed.engine.action.invulnerableTime, 1.1);
  pushed.step(freshControls());
  assert.equal(pushed.engine.action.hits, 0);

  const recovered = new RaceSimulation(17);
  recovered.engine.stormY = 1;
  recovered.step(freshControls());
  for (let frame = 0; frame < RACE_RESPAWN_FRAMES; frame++)
    recovered.step(freshControls());
  assert.equal(recovered.engine.action.invulnerableTime, 1.6);
  const originalFrame = recovered.frame;
  const ice = sampleRaceHazards(17, 400, 5.2).icicles[0];
  recovered.engine.action.icicles = [{ ...ice, x: recovered.engine.x, y: 0.7 }];
  recovered.engine.tick(1 / 120, freshControls());
  assert.equal(recovered.engine.action.hits, 0);
  assert.equal(recovered.frame, originalFrame);
});

void test('a descending runner can stomp a race bat and it stays consumed', () => {
  const simulation = new RaceSimulation(17);
  simulation.frame = RACE_BAT_START_FRAME + RACE_BAT_WARNING_FRAMES + 150;
  const bat = sampleRaceHazards(17, simulation.frame + 1, 5.2).bats[0];
  const e = simulation.engine;
  e.x = bat.x;
  e.y = bat.y + 0.25;
  e.vy = -12;
  e.grounded = false;
  simulation.step(freshControls());
  assert.equal(e.action.stomps, 1);
  assert.equal(e.action.hits, 0);
  assert.equal(e.vy, 17.6);
  simulation.step(freshControls());
  assert.ok(e.action.bats.every((other) => other.id !== bat.id));
});

void test('finishing clears hazard and shield visuals, including the final peer pose', () => {
  for (const reason of ['time', 'goal'] as const) {
    const simulation = new RaceSimulation(17, { mode: 'arcade', targetFloor: 5, durationMs: 180000, bumping: false });
    placeInFallingIce(simulation);
    simulation.step(freshControls());
    assert.equal(simulation.protected, true);
    if (reason === 'time') simulation.finishTime();
    else {
      simulation.engine.floor = simulation.settings.targetFloor;
      simulation.step(freshControls());
    }
    assert.equal(simulation.finished, reason);
    assert.equal(simulation.pose.protected, false);
    assert.equal(simulation.engine.action.invulnerableTime, 0);
    assert.deepEqual(simulation.engine.action.icicles, []);
    assert.deepEqual(simulation.engine.action.bats, []);
  }
});

void test('weather collisions and hazard shields reproduce from a real input recording', () => {
  const simulation = new RaceSimulation(17);
  let previousJump = false,
    sawIce = false,
    sawBat = false;
  while (!simulation.finished) {
    const e = simulation.engine;
    const target = e.platforms.find(
      (platform) => platform.id === e.standingId + 1,
    );
    const steering = target ? (target.x - e.x) * 3.8 - e.vx * 1.1 : -e.vx;
    const jump: boolean = e.grounded && !previousJump;
    previousJump = jump;
    simulation.step({ left: steering < -0.35, right: steering > 0.35, jump });
    sawIce ||= e.action.icicles.length > 0;
    sawBat ||= e.action.bats.length > 0;
  }
  assert.ok(sawIce && sawBat);
  assert.ok(
    simulation.engine.action.hits + simulation.engine.action.stomps > 0,
  );
  const replay = replayRaceRecording(
    simulation.getRecording(),
    simulation.settings,
    [],
  );
  assert.deepEqual(replay.engine.snapshot(), simulation.engine.snapshot());
  assert.deepEqual(replay.pose, simulation.pose);
});
