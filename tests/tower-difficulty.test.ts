import test from 'node:test';
import assert from 'node:assert/strict';
import { TowerEngine, FLOOR_HEIGHT, STAGE_WIDTH, freshControls } from '../lib/tower-engine.ts';

function landAt(engine: TowerEngine, floor: number) {
  engine.y = floor * FLOOR_HEIGHT + .3;
  engine.cameraY = engine.y + 2.2;
  engine.stormY = engine.y - 10;
  engine.vx = 0; engine.vy = -1;
  engine.grounded = false; engine.standingId = -1;
  engine.tick(1 / 120, freshControls());
  const platform = engine.platforms.find(p => p.id === floor)!;
  engine.x = platform.x;
  for (let frame = 0; frame < 120 && !engine.grounded; frame++) engine.tick(1 / 120, freshControls());
  assert.equal(engine.standingId, floor);
}

void test('Classic and Party add a frost pace step at every 50-floor landing', () => {
  for (const mode of ['arcade', 'party'] as const) {
    const engine = new TowerEngine(17); engine.start(mode);
    for (const milestone of [50, 100, 150, 200, 250, 300]) {
      landAt(engine, milestone - 1);
      const before = engine.pace;
      assert.equal(before.level, milestone / 50);
      landAt(engine, milestone);
      assert.equal(engine.pace.level, before.level + 1);
      assert.ok(Math.abs(engine.pace.speed - before.speed - .4) < 1e-8);
      assert.equal(engine.action.notice?.label, `FLOOR ${milestone} · HARDER AHEAD`);
      assert.match(engine.action.notice!.detail, /Faster frost/);
    }
    engine.togglePause();
    const paused = engine.snapshot(); engine.tick(.1, freshControls());
    assert.deepEqual(engine.snapshot(), paused);
    engine.start(mode);
    assert.deepEqual(engine.pace, { level: 0, speed: 0, nextIn: null });
    assert.equal(engine.action.notice, null);
  }
});

void test('passing a milestone in the air waits for a landing; skipping its stage still counts once', () => {
  const engine = new TowerEngine(17); engine.start();
  landAt(engine, 49);
  const before = engine.pace.speed;
  engine.action.notice = null;
  engine.y = 51 * FLOOR_HEIGHT + 1; engine.vy = 2;
  engine.grounded = false; engine.standingId = -1;
  engine.tick(1 / 120, freshControls());
  assert.equal(engine.floor, 49); assert.equal(engine.pace.speed, before);
  assert.equal(engine.action.notice, null);
  landAt(engine, 51);
  assert.equal(engine.pace.level, 2);
  assert.equal(engine.snapshot().action.notice?.label, 'FLOOR 50 · HARDER AHEAD');
  engine.action.notice = null;
  landAt(engine, 50);
  assert.equal(engine.floor, 51); assert.equal(engine.pace.level, 2);
  assert.equal(engine.action.notice, null);
  landAt(engine, 51);
  assert.equal(engine.action.notice, null);
});

void test('milestone frost speed stacks with the timed increase without resetting its clock', () => {
  const engine = new TowerEngine(17); engine.start();
  landAt(engine, 49);
  engine.time += 29 - (30 - engine.pace.nextIn!);
  landAt(engine, 50);
  assert.equal(engine.pace.level, 2);
  assert.ok(engine.pace.nextIn! < 1);
  engine.time += engine.pace.nextIn!;
  assert.equal(engine.pace.level, 3);
  assert.ok(Math.abs(engine.pace.speed - 1.45) < 1e-8);
});

void test('Practice milestones retain zero automatic frost movement', () => {
  const engine = new TowerEngine(17); engine.start('practice');
  landAt(engine, 100);
  assert.deepEqual(engine.pace, { level: 0, speed: 0, nextIn: null });
  assert.match(engine.action.notice!.detail, /^Narrower ledges/);
  const before = { camera: engine.cameraY, frost: engine.stormY };
  for (let frame = 0; frame < 240; frame++) engine.tick(1 / 120, freshControls());
  assert.deepEqual({ camera: engine.cameraY, frost: engine.stormY }, before);
});

void test('each generated band narrows ordinary ledges while stages and route choices stay intact', () => {
  for (const floor of [49, 51, 99, 101, 149, 151, 199, 201, 501]) {
    const current = new TowerEngine(42), legacy = new TowerEngine(42, false, 6);
    for (const engine of [current, legacy]) {
      engine.start('practice');
      engine.y = floor * FLOOR_HEIGHT; engine.cameraY = engine.y + 2.2;
      engine.grounded = false; engine.standingId = -1;
      engine.tick(1 / 120, freshControls());
    }
    for (const platform of current.platforms) {
      const old = legacy.platforms.find(p => p.id === platform.id)!;
      const tier = Math.floor(platform.id / 50);
      if (platform.route || old.width === STAGE_WIDTH) {
        assert.equal(platform.width, old.width);
        assert.equal(platform.x, old.x);
      } else {
        assert.equal(platform.width, Math.max(2.1, old.width - tier * .25));
        assert.ok(platform.width >= 2.1);
        if (tier === 0) assert.deepEqual(platform, old);
      }
      if (old.width === STAGE_WIDTH) {
        assert.equal(platform.moving, false);
        assert.equal(platform.crumble, undefined);
      }
    }
  }
});

void test('version 6 keeps its old pace at milestones and restarting restores current difficulty', () => {
  const engine = new TowerEngine(17, false, 6); engine.start();
  landAt(engine, 100);
  assert.equal(engine.pace.level, 1);
  assert.equal(engine.pace.speed, .65);
  assert.doesNotMatch(engine.action.notice?.label ?? '', /HARDER AHEAD/);
  engine.start('arcade', 17, 7);
  landAt(engine, 100);
  assert.equal(engine.pace.level, 3);
});
