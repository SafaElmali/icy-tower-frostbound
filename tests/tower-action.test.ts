import test from 'node:test';
import assert from 'node:assert/strict';
import { CRUMBLE_DELAY, FRENZY_DURATION, ICICLE_WARNING_TIME, freshTowerAction } from '../lib/tower-action.ts';
import { TowerEngine, FLOOR_HEIGHT, freshControls, type Platform } from '../lib/tower-engine.ts';

const step = (engine: TowerEngine, frames: number) => {
  for (let i = 0; i < frames; i++) { engine.tick(1 / 120, freshControls()); engine.drainEvents(); }
};
const ledge = (floor: number): Platform => ({ id: floor, x: 0, y: floor * FLOOR_HEIGHT, width: 10, moving: false, spring: false, gem: false, collected: false, origin: 0, phase: 0 });
const stand = (engine: TowerEngine, floor: number) => {
  const p = ledge(floor);
  engine.platforms = [p]; engine.floor = floor; engine.x = engine.vx = engine.vy = 0;
  engine.y = p.y; engine.maxY = p.y; engine.cameraY = p.y + 2.2; engine.stormY = p.y - 10;
  engine.grounded = true; engine.standingId = p.id;
  return p;
};
const land = (engine: TowerEngine, floor: number) => {
  const p = stand(engine, floor);
  engine.y = p.y + .03; engine.vy = -8; engine.grounded = false; engine.standingId = -1;
  engine.tick(1 / 120, freshControls());
  assert.equal(engine.standingId, floor);
  return p;
};
const falling = (engine: TowerEngine, x = engine.x) => ({ id: 500, x, y: engine.y + .03, spawnY: engine.y + 7, targetY: engine.y, state: 'falling' as const, warningTime: 0, vy: -20, nearMiss: false });

void test('v6 introduces cracked ice at floor8 and preserves the seeded v5 geometry', () => {
  const old = new TowerEngine(42, false, 5), current = new TowerEngine(42);
  old.start('practice'); current.start('practice');
  assert.equal(current.platforms.find(p => p.id === 8)?.crumble?.remaining, null);
  assert.ok(current.platforms.filter(p => p.id < 8).every(p => !p.crumble));
  assert.deepEqual(current.platforms.map(({ crumble: _crumble, ...p }) => p), old.platforms);
  for (const floor of [48, 50, 51, 52, 100, 150]) {
    stand(current, floor); step(current, 1);
    assert.ok(current.platforms.filter(p => Math.abs(p.id - floor) <= 1 && p.id % 50 === 0).every(p => !p.crumble));
    assert.equal(current.action.encounter, null);
  }
});

void test('all old replay rules retain an inert action system, including long combos', () => {
  for (const version of [1, 2, 3, 4, 5] as const) {
    const engine = new TowerEngine(42, false, version); engine.start('practice');
    land(engine, 30); step(engine, 1600);
    assert.deepEqual(engine.action, freshTowerAction());
    assert.ok(engine.platforms.every(p => !p.crumble));
  }
});

void test('cracked ledges arm on landing, wait1.15 seconds, and stop catching falls after collapse', () => {
  const engine = new TowerEngine(); engine.start('practice');
  const p = stand(engine, 8); p.crumble = { remaining: null, broken: false };
  engine.tick(1 / 120, freshControls());
  assert.equal(p.crumble.remaining, CRUMBLE_DELAY);
  assert.ok(engine.drainEvents().some(e => e.type === 'crumble'));
  step(engine, 137);
  assert.equal(p.crumble.broken, false); assert.equal(engine.grounded, true);
  engine.tick(1 / 120, freshControls());
  assert.equal(p.crumble.broken, true); assert.equal(engine.grounded, false);
  assert.ok(engine.drainEvents().some(e => e.type === 'collapse'));
  engine.y = p.y + .02; engine.vy = -8; engine.platforms = [p];
  engine.tick(1 / 120, freshControls());
  assert.equal(engine.grounded, false); assert.ok(engine.y < p.y);
});

void test('legacy icicles telegraph for a full1.1 seconds and lock the lane before the player moves', () => {
  const engine = new TowerEngine(73091, true, 7); engine.start('practice'); stand(engine, 12);
  for (let i = 0; i < 180 && !engine.action.icicles.length; i++) step(engine, 1);
  const icicle = engine.action.icicles[0];
  assert.ok(icicle); assert.equal(icicle.state, 'warning');
  assert.ok(Math.abs(icicle.warningTime - ICICLE_WARNING_TIME) < 1e-9);
  const x = icicle.x, targetY = icicle.targetY;
  engine.x = 3;
  step(engine, 131);
  assert.equal(icicle.state, 'warning'); assert.equal(icicle.x, x); assert.equal(icicle.targetY, targetY);
  step(engine, 1); assert.equal(icicle.state, 'falling');
  step(engine, 100); assert.equal(engine.action.hits, 0);
});

void test('falling ice gives recoverable knockback and invulnerability; near misses award once', () => {
  const engine = new TowerEngine(); engine.start('practice'); stand(engine, 12);
  engine.combo = 9; engine.comboTime = 3;
  engine.action.icicles = [falling(engine)]; engine.tick(1 / 120, freshControls());
  assert.equal(engine.action.hits, 1); assert.equal(engine.status, 'playing');
  assert.ok(engine.vy >= 9.2); assert.ok(Math.abs(engine.vx) >= 5);
  assert.ok(engine.action.invulnerableTime > 1.6); assert.equal(engine.combo, 0);
  engine.action.icicles = [falling(engine)]; step(engine, 1);
  assert.equal(engine.action.hits, 1);
  stand(engine, 12); engine.action.icicles = [falling(engine, 1.2)];
  const score = engine.score; step(engine, 1);
  assert.equal(engine.action.dodges, 1); assert.equal(engine.score, score + 75);
  step(engine, 12); assert.equal(engine.action.dodges, 1);
});

void test('current icicles fall immediately, keep a fixed lane, and can overlap incoming bats', () => {
  const engine = new TowerEngine(); engine.start('practice'); stand(engine, 22);
  for (let frame = 0; frame < 180 && !engine.action.icicles.length; frame++) step(engine, 1);
  const icicle = engine.action.icicles[0];
  assert.ok(icicle); assert.equal(icicle.state, 'falling');
  assert.equal(icicle.warningTime, 0); assert.ok(icicle.vy < 0);
  const x = icicle.x;
  engine.x = 3;
  for (let frame = 0; frame < 100 && !engine.action.bats.length; frame++) step(engine, 1);
  assert.equal(icicle.x, x, 'The ice does not home in after spawning');
  assert.ok(engine.action.icicles.length && engine.action.bats.length);
  assert.equal(engine.action.bats[0].warningTime, 0);
  assert.ok(engine.action.bats[0].phase > 0, 'The bat enters immediately');
  assert.equal(engine.action.hits, 0);
});

void test('current hazards spawn twice as often and cadence increases with milestone difficulty', () => {
  function spawns(version: 7 | 8, floor = 22) {
    const engine = new TowerEngine(42, false, version); engine.start('practice'); stand(engine, floor);
    const ice: number[] = [], bats: number[] = [];
    if (floor >= 30) engine.action.encounter = { kind: 'ice-shower', duration: 60, timeLeft: 60 };
    for (let frame = 0; frame < 28 * 120; frame++) {
      engine.tick(1 / 120, freshControls());
      for (const event of engine.drainEvents()) {
        if (event.type === 'icicle-warning') ice.push(engine.time);
        if (event.type === 'bat-warning') bats.push(engine.time);
      }
      // Isolate spawn cadence from player collisions and actor travel time.
      engine.action.icicles = []; engine.action.bats = [];
    }
    return { ice, bats };
  }
  const legacy = spawns(7), current = spawns(8);
  assert.ok(current.ice.length > legacy.ice.length);
  assert.ok(current.bats.length > legacy.bats.length);
  for (const key of ['ice', 'bats'] as const) {
    const oldGap = legacy[key][1] - legacy[key][0];
    const newGap = current[key][1] - current[key][0];
    assert.ok(Math.abs(newGap * 2 - oldGap) < .03);
  }
  const first = spawns(8, 30), higher = spawns(8, 130);
  assert.ok(higher.ice.length > first.ice.length);
  assert.ok(higher.bats.length > first.bats.length);
});

void test('current encounters have six-second breathers and milestone stages clear overlapping hazards', () => {
  const engine = new TowerEngine(); engine.start('practice'); stand(engine, 30);
  step(engine, 1);
  engine.action.encounter!.timeLeft = 1 / 120;
  step(engine, 1);
  assert.equal(engine.action.encounter, null);
  stand(engine, 54); step(engine, 600);
  assert.equal(engine.action.encounter, null);
  step(engine, 121);
  assert.equal(engine.snapshot().action.encounter?.kind, 'crumble-rush');
  engine.action.icicles.push(falling(engine));
  engine.action.bats.push({ id: 2, x: 3, y: engine.y, originX: 7.1, originY: engine.y, phase: 1, alive: true, warningTime: 0 });
  stand(engine, 100); step(engine, 1);
  assert.equal(engine.action.encounter, null);
  assert.equal(engine.action.icicles.length, 0); assert.equal(engine.action.bats.length, 0);
});

void test('bat stomps bounce and award points while side contact causes a protected recovery', () => {
  const engine = new TowerEngine(); engine.start('practice'); stand(engine, 20);
  engine.grounded = false; engine.standingId = -1; engine.y += 3; engine.vy = -8;
  engine.action.bats = [{ id: 1, x: 0, y: engine.y - .28, originX: 0, originY: engine.y - .28, phase: 0, alive: true, warningTime: 0 }];
  engine.tick(1 / 120, freshControls());
  assert.equal(engine.action.stomps, 1); assert.equal(engine.action.hits, 0);
  assert.equal(engine.score, 350); assert.ok(engine.vy >= 17.6); assert.equal(engine.grounded, false);
  assert.ok(engine.drainEvents().some(e => e.type === 'stomp'));
  stand(engine, 20);
  engine.action.bats = [{ id: 2, x: 0, y: engine.y + .7, originX: 0, originY: engine.y + .7, phase: 0, alive: true, warningTime: 0 }];
  step(engine, 1); assert.equal(engine.action.hits, 1); assert.ok(engine.vy > 9);
});

void test('frenzy needs earned charge, boosts jumps, leaves collectible crystals, and cannot retrigger from a parked combo', () => {
  const engine = new TowerEngine(); engine.start('practice');
  // Version 9 combos continue on two-floor jumps.
  for (let floor = 2; floor <= 8; floor += 2) land(engine, floor);
  assert.equal(engine.action.frenzyTime, 0); assert.ok(Math.abs(engine.action.frenzyCharge - .8) < 1e-8);
  land(engine, 10);
  assert.equal(engine.action.frenzyTime, FRENZY_DURATION); assert.equal(engine.action.frenzies, 1);
  assert.equal(engine.action.frenzyCharge, 0);
  engine.tick(1 / 120, { ...freshControls(), jump: true });
  assert.ok(engine.vy > 14); assert.ok(engine.action.crystals.length > 0);
  const crystal = engine.action.crystals[0]; engine.x = crystal.x; engine.y = crystal.y - .7;
  const score = engine.score, gems = engine.gems; step(engine, 1);
  assert.equal(engine.gems, gems + 1); assert.equal(engine.score, score + 250);
  assert.equal(crystal.collected, true);
  stand(engine, 10); step(engine, 720);
  assert.equal(engine.action.frenzyTime, 0); assert.equal(engine.action.frenzies, 1);
  assert.equal(engine.action.frenzyCharge, 0);
  for (let floor = 12; floor <= 20; floor += 2) land(engine, floor);
  assert.equal(engine.action.frenzies, 2); assert.ok(engine.action.frenzyTime > 5.9);
});

void test('legacy encounters retain twelve seconds of breathing room and keep rest stages clear', () => {
  const engine = new TowerEngine(73091, true, 7); engine.start('practice'); stand(engine, 30); step(engine, 1);
  assert.equal(engine.action.encounter?.kind, 'ice-shower');
  step(engine, 90); assert.ok(engine.action.icicles.length > 0); assert.equal(engine.action.bats.length, 0);
  step(engine, 631); assert.equal(engine.action.encounter, null);
  assert.equal(engine.action.icicles.length, 0);
  stand(engine, 54); step(engine, 1200);
  assert.equal(engine.action.encounter, null, 'the breather still blocks the next eligible encounter');
  step(engine, 241);
  assert.equal(engine.snapshot().action.encounter?.kind, 'crumble-rush');
  assert.ok(engine.platforms.some(p => p.id > 54 && p.crumble));
  assert.ok(engine.platforms.filter(p => p.route || p.spring || p.moving).every(p => !p.crumble));
  assert.equal(engine.action.icicles.length, 0); assert.equal(engine.action.bats.length, 0);
  stand(engine, 100); step(engine, 1);
  assert.equal(engine.action.encounter, null); assert.equal(engine.action.icicles.length, 0); assert.equal(engine.action.bats.length, 0);
});

void test('action clocks and snapshots freeze on pause, reset completely, and agree at60/120Hz', () => {
  const a = new TowerEngine(42), b = new TowerEngine(42);
  for (const engine of [a, b]) { engine.start('practice'); stand(engine, 30); }
  for (let i = 0; i < 150; i++) a.tick(1 / 60, freshControls());
  for (let i = 0; i < 300; i++) b.tick(1 / 120, freshControls());
  assert.deepEqual(a.snapshot(), b.snapshot()); assert.deepEqual(a.platforms, b.platforms);
  a.togglePause(); const before = a.snapshot(), frozen = structuredClone(before);
  step(a, 600); assert.deepEqual(a.snapshot(), frozen);
  a.togglePause(); step(a, 20); assert.deepEqual(before, frozen, 'past snapshots contain independent entity data');
  a.start('practice', 42); assert.deepEqual(a.action, freshTowerAction());
  assert.ok(a.platforms.every(p => !p.crumble || p.crumble.remaining === null));
});

void test('hazard and reward actor counts stay bounded across long simulation sessions', () => {
  const engine = new TowerEngine(); engine.start('practice'); stand(engine, 30);
  for (let frame = 0; frame < 12000; frame++) {
    // A broad stationary test ledge isolates the spawning budget from falls.
    if (frame % 120 === 0) { stand(engine, 30); engine.action.frenzyTime = 6; }
    step(engine, 1);
    assert.ok(engine.action.icicles.length <= 2); assert.ok(engine.action.bats.length <= 2); assert.ok(engine.action.crystals.length <= 16);
  }
});
