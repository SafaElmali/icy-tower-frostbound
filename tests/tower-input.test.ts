import test from 'node:test';
import assert from 'node:assert/strict';
import { TowerInput } from '../lib/tower-input.ts';
import { TowerEngine, freshControls, FLOOR_HEIGHT } from '../lib/tower-engine.ts';

void test('multiple fingers can hold movement and jump without releasing each other', () => {
  const input = new TowerInput();
  input.press('pointer:1', 'right'); input.press('pointer:2', 'jump'); input.press('pointer:3', 'right');
  input.release('pointer:1');
  assert.deepEqual(input.controls, { left: false, right: true, jump: true });
  input.release('pointer:2');
  assert.deepEqual(input.controls, { left: false, right: true, jump: false });
  input.release('pointer:3'); input.release('pointer:3');
  assert.deepEqual(input.controls, freshControls());
});

void test('sliding a movement finger reverses direction while the jump finger stays held', () => {
  const input = new TowerInput();
  input.press('pointer:1', 'left'); input.press('pointer:2', 'jump');
  input.press('pointer:1', 'right');
  assert.deepEqual(input.controls, { left: false, right: true, jump: true });
  input.release('pointer:1');
  assert.deepEqual(input.controls, { left: false, right: false, jump: true });
});

void test('touch cancellation and keyboard releases respect every remaining input source', () => {
  const input = new TowerInput();
  input.press('key:KeyA', 'left'); input.press('key:ArrowLeft', 'left'); input.press('pointer:1', 'left');
  input.release('pointer:1'); input.release('key:KeyA');
  assert.equal(input.controls.left, true);
  input.release('key:ArrowLeft'); assert.equal(input.controls.left, false);
  input.press('pointer:2', 'jump'); input.press('key:KeyD', 'right'); input.reset();
  assert.equal(input.has('pointer:2'), false);
  input.release('pointer:2'); assert.deepEqual(input.controls, freshControls());
});

void test('two-thumb input builds momentum for a high jump and resets cleanly on pause', () => {
  const input = new TowerInput(), engine = new TowerEngine(17); engine.start('practice');
  input.press('pointer:1', 'right');
  for (let i = 0; i < 40; i++) engine.tick(1 / 120, input.controls);
  assert.ok(engine.vx > 7);
  input.press('pointer:2', 'jump'); engine.tick(1 / 120, input.controls);
  assert.ok(engine.vy > 15); assert.equal(engine.grounded, false);
  input.release('pointer:2');
  let apex = engine.y;
  for (let i = 0; i < 110; i++) { engine.tick(1 / 120, input.controls); apex = Math.max(apex, engine.y); }
  assert.ok(apex > FLOOR_HEIGHT * 2);
  engine.togglePause(); input.reset(); const paused = engine.snapshot();
  engine.tick(.1, input.controls); assert.deepEqual(engine.snapshot(), paused);
  engine.start('practice'); engine.tick(1 / 120, input.controls);
  assert.equal(engine.x, 0); assert.equal(engine.y, 0); assert.equal(engine.grounded, true);
});

const sampleTick = (input: TowerInput, engine: TowerEngine, dt = 1 / 60) => {
  const sampled = input.sample(), previousTime = engine.time;
  engine.tick(dt, sampled);
  if (engine.time > previousTime) input.acknowledgeSample(sampled);
  return sampled;
};

void test('a complete jump tap between frames still reaches physics exactly once', () => {
  const input = new TowerInput(), engine = new TowerEngine(17); engine.start('practice');
  input.press('pointer:1', 'right');
  for (let i = 0; i < 20; i++) sampleTick(input, engine);
  input.press('pointer:2', 'jump'); input.release('pointer:2');
  assert.equal(input.controls.jump, false, 'visual pressed state follows the real finger');
  sampleTick(input, engine, .1);
  assert.equal(engine.grounded, false);
  assert.ok(engine.vy > 0);
  assert.equal(engine.drainEvents().filter(event => event.type === 'jump').length, 1);
  assert.equal(sampleTick(input, engine).jump, false);
  assert.equal(engine.drainEvents().filter(event => event.type === 'jump').length, 0);
});

void test('jump taps survive render frames that do not advance the fixed-step simulation', () => {
  const input = new TowerInput(), engine = new TowerEngine(); engine.start('practice');
  input.press('pointer:1', 'jump'); input.release('pointer:1');
  for (let i = 0; i < 4; i++) sampleTick(input, engine, 1 / 1000);
  assert.equal(engine.time, 0);
  assert.equal(input.sample().jump, true);
  sampleTick(input, engine, 1 / 120);
  assert.equal(engine.grounded, false);
  assert.equal(input.sample().jump, false);
});

void test('a release and re-tap between frames produces a new Party double jump', () => {
  const input = new TowerInput(), engine = new TowerEngine(); engine.start('party');
  engine.doubleJumpTime = 8;
  input.press('pointer:1', 'jump'); sampleTick(input, engine);
  engine.drainEvents();
  input.release('pointer:1'); input.press('pointer:2', 'jump'); input.release('pointer:2');
  assert.equal(sampleTick(input, engine).jump, false, 'physics must observe the missing release first');
  assert.equal(sampleTick(input, engine).jump, true);
  assert.equal(engine.drainEvents().filter(event => event.type === 'jump').length, 1);
  assert.equal(engine.snapshot().doubleJumpReady, false);
  assert.equal(sampleTick(input, engine).jump, false);
});

void test('held and repeated keys do not create automatic jumps', () => {
  const input = new TowerInput(), engine = new TowerEngine(); engine.start('practice');
  input.press('key:Space', 'jump');
  let jumps = 0;
  for (let i = 0; i < 180; i++) {
    input.press('key:Space', 'jump');
    sampleTick(input, engine);
    jumps += engine.drainEvents().filter(event => event.type === 'jump').length;
  }
  assert.equal(jumps, 1);
});

void test('cancellation and pause reset discard unsampled taps without releasing another source', () => {
  const input = new TowerInput(), engine = new TowerEngine(); engine.start('practice');
  input.press('pointer:1', 'right'); input.press('pointer:2', 'jump'); input.cancel('pointer:2');
  assert.deepEqual(input.sample(), { left: false, right: true, jump: false });
  sampleTick(input, engine);
  assert.equal(engine.grounded, true);
  input.press('pointer:3', 'jump'); input.release('pointer:3');
  input.reset();
  assert.deepEqual(input.sample(), freshControls());
  sampleTick(input, engine);
  assert.equal(engine.grounded, true);
});
