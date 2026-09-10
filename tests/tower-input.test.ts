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
