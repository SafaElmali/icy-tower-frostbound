import test from 'node:test';
import assert from 'node:assert/strict';
import { TowerEngine, freshControls } from '../lib/tower-engine.ts';
const step = (e: TowerEngine, seconds: number) => { for (let i = 0; i < Math.round(seconds * 120); i++) e.tick(1 / 120, freshControls()); };
function stand(e: TowerEngine, floor: number) {
  const p = e.platforms.find(p => p.id === floor)!;
  e.x = p.x; e.y = p.y; e.vx = e.vy = 0; e.grounded = true; e.standingId = p.id;
  return p;
}
function climb(e: TowerEngine, seconds: number) {
  let target = e.platforms.find(p => p.id === e.standingId + 1)!, wasJump = false;
  for (let i = 0; i < seconds * 120 && e.status === 'playing'; i++) {
    if (e.grounded) target = e.platforms.find(p => p.id === e.standingId + 1)!;
    const steering = (target.x - e.x) * 3.8 - e.vx * 1.1;
    const jump: boolean = e.grounded && !wasJump;
    e.tick(1 / 120, { left: steering < -.35, right: steering > .35, jump }); wasJump = jump;
    e.drainEvents();
  }
}

void test('falling reveals lower ledges without erasing the best height or retreating frost', () => {
  const e = new TowerEngine(17); e.start('practice');
  const lower = e.platforms[6];
  e.x = lower.x; e.y = lower.y + 4; e.vy = -1; e.grounded = false; e.standingId = -1;
  e.maxY = e.y; e.cameraY = e.y + 2.2; e.stormY = e.cameraY - 12.5;
  const before = { camera: e.cameraY, height: e.maxY, frost: e.stormY };
  for (let i = 0; i < 240 && !e.grounded; i++) e.tick(1 / 120, freshControls());
  assert.equal(e.status, 'playing'); assert.ok(e.grounded, 'the lower landing still works');
  assert.ok(e.cameraY < before.camera - 1, 'camera tracks down during the fall');
  assert.equal(e.maxY, before.height); assert.ok(e.stormY >= before.frost);
  assert.ok(e.platforms.includes(lower), 'recovery ledges remain in the simulation');
});

void test('steps remain stationary below floor 5, even after waiting a long time', () => {
  const e = new TowerEngine(); e.start(); stand(e, 4); step(e, 1);
  const before = { camera: e.cameraY, frost: e.stormY };
  step(e, 65);
  assert.equal(e.status, 'playing'); assert.equal(e.cameraY, before.camera); assert.equal(e.stormY, before.frost);
});

void test('reaching floor 5 starts downward step motion while standing still', () => {
  const e = new TowerEngine(); e.start(); const p = stand(e, 5); step(e, .1);
  const before = { camera: e.cameraY, onScreen: p.y - e.cameraY, y: e.y };
  step(e, 2);
  assert.ok(e.cameraY > before.camera + 1.2, 'camera scrolls automatically');
  assert.ok(p.y - e.cameraY < before.onScreen - 1.2, 'ledge visibly descends');
  assert.equal(e.y, before.y); assert.equal(e.standingId, 5); assert.equal(e.status, 'playing');
  step(e, 22); assert.equal(e.status, 'over', 'waiting too long still loses the run');
});

void test('a fall follows the player even after automatic scrolling has started', () => {
  const e = new TowerEngine(17); e.start(); const p = stand(e, 8); step(e, .5);
  // Start falling above a real lower ledge; the chase remains active throughout.
  e.y = p.y + 3; e.maxY = e.y; e.cameraY = e.y + 2.2; e.grounded = false; e.standingId = -1; e.vy = -3;
  const camera = e.cameraY, frost = e.stormY;
  step(e, .25);
  assert.ok(e.cameraY < camera); assert.ok(e.y < p.y + 3); assert.ok(e.stormY > frost);
  assert.equal(e.status, 'playing');
});

void test('scroll speed increases after 30 seconds while a playable ascent stays ahead', () => {
  const e = new TowerEngine(42); e.start(); stand(e, 5); step(e, .1);
  let before = e.cameraY; step(e, .5); const initialSpeed = (e.cameraY - before) / .5;
  climb(e, 30.5); assert.equal(e.status, 'playing'); assert.ok(e.floor > 30);
  stand(e, e.floor); step(e, .1); before = e.cameraY; step(e, .5);
  const fasterSpeed = (e.cameraY - before) / .5;
  assert.ok(Math.abs(initialSpeed - .65) < .001);
  assert.ok(Math.abs(fasterSpeed - 1.05) < .001);
});

void test('pausing freezes automatic scroll and restart resets its activation', () => {
  const e = new TowerEngine(); e.start(); stand(e, 5); step(e, 2); e.togglePause();
  const before = { camera: e.cameraY, frost: e.stormY, time: e.time };
  step(e, 45); assert.deepEqual({ camera: e.cameraY, frost: e.stormY, time: e.time }, before);
  e.togglePause(); step(e, 1); assert.ok(e.cameraY > before.camera);
  e.start(); step(e, 65); assert.equal(e.cameraY, 5.2); assert.equal(e.status, 'playing');
});

void test('practice disables automatic step motion but still limits fatal falls', () => {
  const e = new TowerEngine(); e.start('practice'); stand(e, 8); step(e, 1);
  const camera = e.cameraY, frost = e.stormY; step(e, 70);
  assert.equal(e.cameraY, camera); assert.equal(e.stormY, frost); assert.equal(e.status, 'playing');
  e.y = frost - 1; e.grounded = false; e.standingId = -1; e.vy = -1; step(e, .1); assert.equal(e.status, 'over');
});

void test('automatic scrolling has the same speed at 60 and 120 Hz', () => {
  const a = new TowerEngine(7), b = new TowerEngine(7); a.start(); b.start(); stand(a, 5); stand(b, 5);
  for (let i = 0; i < 300; i++) a.tick(1 / 60, freshControls());
  for (let i = 0; i < 600; i++) b.tick(1 / 120, freshControls());
  assert.ok(Math.abs(a.cameraY - b.cameraY) < .001); assert.ok(Math.abs(a.stormY - b.stormY) < .001);
});
