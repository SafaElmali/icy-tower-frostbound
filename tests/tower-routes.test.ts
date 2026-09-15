import test from 'node:test';
import assert from 'node:assert/strict';
import { TowerEngine, FLOOR_HEIGHT, freshControls, platformFloor } from '../lib/tower-engine.ts';

const jumpTo = (engine: TowerEngine, targetX: number) => {
  for (let frame = 0; frame < 300; frame++) {
    const steering = (targetX - engine.x) * 3.8 - engine.vx * 1.1;
    engine.tick(1 / 120, { left: steering < -.35, right: steering > .35, jump: frame === 0 });
    if (engine.grounded) return;
  }
  assert.fail('Jump never landed');
};

void test('route choices are seeded, distinct and visible above the takeoff before jumping', () => {
  for (const seed of [3, 17, 42, 99, 723]) {
    const engine = new TowerEngine(seed); engine.start('practice');
    const first = structuredClone(engine.platforms);
    engine.start('practice', seed);
    assert.deepEqual(engine.platforms, first);
    assert.equal(new Set(first.map(p => p.id)).size, first.length);
    const approach = first.find(p => p.route === 'approach')!;
    const shortcut = first.find(p => p.route === 'shortcut')!;
    const safe = first.find(p => p.id === platformFloor(shortcut))!;
    assert.ok(Math.abs(shortcut.y - approach.y - 2 * FLOOR_HEIGHT) < 1e-9);
    assert.equal(safe.y, shortcut.y);
    assert.ok(Math.abs(safe.x - shortcut.x) > (safe.width + shortcut.width) / 2);
    assert.ok(safe.width > shortcut.width * 2);
    assert.equal(safe.gem, false); assert.equal(shortcut.gem, true);
    assert.equal(safe.moving, false); assert.equal(shortcut.moving, false);
    assert.ok(shortcut.y < approach.y + 9, 'both options fit above the takeoff in view');
  }
});

void test('ordinary standing jumps complete the safe route without taking its optional crystal', () => {
  for (const seed of [3, 42]) {
    const engine = new TowerEngine(seed); engine.start('practice');
    const approach = engine.platforms.find(p => p.id === 12)!;
    engine.x = approach.x; engine.y = approach.y; engine.standingId = approach.id;
    engine.cameraY = engine.y + 2.2; engine.maxY = engine.y;
    for (const floor of [13, 14, 15]) {
      const target = engine.platforms.find(p => p.id === floor)!;
      jumpTo(engine, target.x);
      assert.equal(engine.standingId, floor);
      engine.tick(1 / 120, freshControls());
    }
    assert.equal(engine.platforms.find(p => p.route === 'shortcut')!.collected, false, 'the safe route never collects the optional shortcut crystal');
  }
});

void test('a running jump skips the safe step and lands on the crystal shortcut in each physics mode', () => {
  for (const mode of ['arcade', 'practice', 'party'] as const) for (const seed of [3, 42]) {
    const engine = new TowerEngine(seed); engine.start(mode);
    const approach = engine.platforms.find(p => p.id === 12)!;
    const shortcut = engine.platforms.find(p => p.route === 'shortcut')!;
    const direction = Math.sign(shortcut.x - approach.x);
    engine.x = approach.x - direction * 1.5; engine.y = approach.y; engine.standingId = approach.id;
    engine.cameraY = engine.y + 2.2; engine.maxY = engine.y;
    // Build momentum using controls on the wide takeoff, with no velocity injection.
    for (let frame = 0; frame < 40; frame++) engine.tick(1 / 120, { left: direction < 0, right: direction > 0, jump: false });
    jumpTo(engine, shortcut.x);
    assert.equal(engine.standingId, shortcut.id);
    assert.equal(engine.floor, 14, 'floor progression uses elevation, not the negative render ID');
    assert.equal(engine.gems, 1);
    assert.ok(engine.score > 0);
    engine.tick(1 / 120, freshControls());
    jumpTo(engine, engine.platforms.find(p => p.id === 15)!.x);
    assert.ok(engine.floor >= 15, 'shortcut rejoins a reachable higher landing');
  }
});

void test('legacy layouts retain their original geometry and routes return after leaving an old replay', () => {
  const old = new TowerEngine(42, true, 2); old.start();
  const v3 = new TowerEngine(42, true, 3); v3.start();
  const v4 = new TowerEngine(42, true, 4); v4.start();
  assert.deepEqual(old.platforms, v3.platforms);
  assert.deepEqual(old.platforms, v4.platforms);
  assert.equal(old.platforms.some(p => p.route), false);
  const original = structuredClone(old.platforms);
  old.start('arcade', 42, 5);
  assert.ok(old.platforms.some(p => p.route === 'shortcut'));
  old.start('arcade', 42, 2);
  assert.deepEqual(old.platforms, original);
});

void test('generation keeps its seeded anchor when old collision ledges are removed', () => {
  for (const version of [2, 3, 4, 5] as const) {
    const original = new TowerEngine(42, true, version), pruned = new TowerEngine(42, true, version);
    original.start('practice'); pruned.start('practice');
    const firstUngenerated = Math.max(...original.platforms.map(p => p.id)) + 1;
    pruned.platforms = [];
    for (const engine of [original, pruned]) {
      engine.y = 60; engine.cameraY = 62.2; engine.maxY = 60;
      engine.grounded = false; engine.standingId = -1; engine.vy = 3;
      engine.tick(1 / 120, freshControls());
    }
    const generated = (engine: TowerEngine) => engine.platforms.filter(p => platformFloor(p) >= firstUngenerated);
    assert.ok(generated(pruned).length > 0);
    assert.deepEqual(generated(pruned), generated(original));
  }
});
