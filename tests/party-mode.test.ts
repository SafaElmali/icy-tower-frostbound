import test from 'node:test';
import assert from 'node:assert/strict';
import { TowerEngine, freshControls, DOUBLE_JUMP_DURATION, FLOOR_HEIGHT } from '../lib/tower-engine.ts';

const jump = { ...freshControls(), jump: true };
const step = (engine: TowerEngine, frames: number, input = freshControls()) => {
  for (let i = 0; i < frames; i++) engine.tick(1 / 120, input);
};
function party() { const engine = new TowerEngine(17); engine.start('party'); return engine; }
function collectCrystal(engine: TowerEngine, id = 3) {
  const crystal = engine.platforms.find(p => p.id === id)!;
  engine.x = crystal.x; engine.y = crystal.y; engine.grounded = true; engine.standingId = id;
  step(engine, 1);
}

void test('party lowers gravity while classic physics and seeded layouts retain version 2 behavior', () => {
  const classic = new TowerEngine(17), legacy = new TowerEngine(17, true, 2), festive = party();
  classic.start(); legacy.start();
  assert.deepEqual(classic.platforms, legacy.platforms);
  assert.deepEqual(festive.platforms.map(({ spring: _spring, ...p }) => p), classic.platforms.map(({ spring: _spring, ...p }) => p));
  for (const engine of [classic, legacy, festive]) step(engine, 60, jump);
  assert.equal(classic.y, legacy.y); assert.equal(classic.vy, legacy.vy);
  assert.ok(festive.y > classic.y + .9); assert.ok(festive.vy > classic.vy + 3.9);
  assert.ok(classic.platforms.every(p => !p.spring));
});

void test('springs bounce automatically on descent, score the landing, and allow ascent through them', () => {
  const engine = party(), spring = engine.platforms[5];
  assert.ok(spring.spring);
  engine.x = spring.x; engine.y = spring.y + .02; engine.vy = -5; engine.grounded = false; engine.standingId = -1;
  step(engine, 1);
  assert.equal(engine.y, spring.y); assert.ok(engine.vy >= 19); assert.equal(engine.grounded, false);
  assert.equal(engine.floor, 5); assert.ok(engine.score >= 500);
  assert.deepEqual(engine.drainEvents().filter(e => e.type === 'land' || e.type === 'jump').map(e => e.type), ['land', 'jump']);
  engine.y = spring.y - .02; engine.vy = 5;
  step(engine, 1); assert.ok(engine.y > spring.y); assert.ok(engine.vy < 5);
  engine.y = 50 * FLOOR_HEIGHT; engine.cameraY = engine.y + 2.2;
  step(engine, 1); assert.equal(engine.platforms.find(p => p.id === 50)!.spring, false);
});

void test('crystals grant eight seconds of one extra jump per landing, with no held or third jumps', () => {
  const engine = party(); collectCrystal(engine);
  assert.equal(engine.doubleJumpTime, DOUBLE_JUMP_DURATION);
  step(engine, 1, jump); step(engine, 30);
  const before = engine.vy; step(engine, 1, jump);
  assert.ok(engine.vy > before + 3); assert.equal(engine.snapshot().doubleJumpReady, false);
  const after = engine.vy; step(engine, 10, jump); assert.ok(engine.vy < after);
  step(engine, 1); const beforeThird = engine.vy; step(engine, 1, jump); assert.ok(engine.vy < beforeThird);
  const landing = engine.platforms[4];
  engine.x = landing.x; engine.y = landing.y + .02; engine.vy = -5;
  step(engine, 1); assert.equal(engine.grounded, true); assert.equal(engine.snapshot().doubleJumpReady, true);
  step(engine, 1, jump); step(engine, 30); const secondFlight = engine.vy; step(engine, 1, jump);
  assert.ok(engine.vy > secondFlight + 3);
});

void test('double-jump timer pauses, expires, refreshes only on fresh crystals, and resets on restart', () => {
  const engine = party(); collectCrystal(engine);
  step(engine, 60); const remaining = engine.doubleJumpTime;
  assert.ok(remaining < 7.6 && remaining > 7.4);
  engine.togglePause(); step(engine, 500); assert.equal(engine.doubleJumpTime, remaining);
  engine.togglePause(); collectCrystal(engine, 6); assert.equal(engine.doubleJumpTime, DOUBLE_JUMP_DURATION);
  // Keep a landing below scroll activation so the entire timer can elapse safely.
  engine.maxY = 0; engine.cameraY = 5.2; engine.stormY = -8; engine.x = 0; engine.y = 0; engine.standingId = 0;
  step(engine, 961); assert.equal(engine.doubleJumpTime, 0);
  step(engine, 1, jump); step(engine, 30); const before = engine.vy; step(engine, 1, jump); assert.ok(engine.vy < before);
  engine.start('party'); assert.equal(engine.doubleJumpTime, 0); assert.equal(engine.snapshot().doubleJumpReady, false);
  engine.start('arcade'); collectCrystal(engine); assert.equal(engine.doubleJumpTime, 0); assert.ok(engine.platforms.every(p => !p.spring));
});

void test('party still starts the frost chase at floor five and remains frame-rate independent', () => {
  const a = party(), b = party();
  for (const engine of [a, b]) { engine.maxY = 5 * FLOOR_HEIGHT; step(engine, 1); }
  const storm = a.stormY;
  for (let i = 0; i < 60; i++) a.tick(1 / 60, jump);
  for (let i = 0; i < 120; i++) b.tick(1 / 120, jump);
  assert.ok(a.stormY > storm); assert.deepEqual(a.snapshot(), b.snapshot()); assert.equal(a.y, b.y);
});
