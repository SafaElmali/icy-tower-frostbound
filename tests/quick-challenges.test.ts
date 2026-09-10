import test from 'node:test';
import assert from 'node:assert/strict';
import { TowerEngine, freshControls, FLOOR_HEIGHT, WALL, type GameMode } from '../lib/tower-engine.ts';

const tick = (engine: TowerEngine, frames = 1) => {
  for (let i = 0; i < frames; i++) engine.tick(1 / 120, freshControls());
};
const challenge = (engine: TowerEngine, id: string) => engine.snapshot().challenges.find(item => item.id === id)!;
// Place the climber just above a ledge to exercise the real landing path.
function land(engine: TowerEngine, id: number) {
  const y = id * FLOOR_HEIGHT;
  engine.platforms = [{ id, x: 0, y, width: 4, gem: false, collected: false, moving: false, spring: false, origin: 0, phase: 0 }];
  engine.x = 0; engine.y = y + .01; engine.vx = 0; engine.vy = -3;
  engine.grounded = false; engine.standingId = -1;
  tick(engine);
  assert.equal(engine.standingId, id);
}

void test('an uninterrupted climb completes floor 30 in every mode and stays complete after expiration', () => {
  for (const mode of ['arcade', 'party', 'practice'] as GameMode[]) {
    const engine = new TowerEngine(); engine.start(mode);
    tick(engine, 600); // Waiting before the first landing cannot break a nonexistent combo.
    assert.equal(challenge(engine, 'combo').status, 'active');
    for (let floor = 1; floor <= 30; floor++) land(engine, floor);
    assert.equal(challenge(engine, 'combo').progress, 30);
    assert.equal(challenge(engine, 'combo').status, 'complete');
    tick(engine, 480);
    assert.equal(engine.combo, 0);
    assert.equal(challenge(engine, 'combo').status, 'complete');
  }
});

void test('broken combo locks challenge progress until a new run, even after a later long chain', () => {
  const engine = new TowerEngine(); engine.start('practice');
  land(engine, 1); tick(engine, 480);
  assert.equal(challenge(engine, 'combo').status, 'failed');
  for (let floor = 2; floor <= 35; floor++) land(engine, floor);
  assert.equal(engine.floor, 35);
  assert.equal(challenge(engine, 'combo').status, 'failed');
  assert.equal(challenge(engine, 'combo').progress, 1);
  engine.start();
  assert.equal(challenge(engine, 'combo').status, 'active');
  assert.equal(challenge(engine, 'combo').progress, 0);
});

void test('skipping floor 30 completes the challenge on landing, not while passing through it', () => {
  const engine = new TowerEngine(); engine.start('practice');
  land(engine, 29);
  engine.y = 31 * FLOOR_HEIGHT; engine.grounded = false; engine.vy = 4;
  tick(engine);
  assert.equal(challenge(engine, 'combo').progress, 29);
  land(engine, 31);
  assert.equal(challenge(engine, 'combo').status, 'complete');
  assert.equal(challenge(engine, 'combo').progress, 30);
});

void test('crystals count once each, complete at ten, and keep displayed progress capped', () => {
  const engine = new TowerEngine(); engine.start('practice');
  for (let id = 1; id <= 11; id++) {
    land(engine, id);
    const platform = engine.platforms.find(platform => platform.id === id)!;
    platform.gem = true;
    tick(engine, 2);
    assert.equal(engine.gems, id);
    assert.equal(challenge(engine, 'crystals').status, id < 10 ? 'active' : 'complete');
  }
  assert.equal(challenge(engine, 'crystals').progress, 10);
});

void test('wall challenge counts fast airborne rebounds, excludes ground impacts and slow contact', () => {
  const engine = new TowerEngine(); engine.start('practice');
  engine.x = WALL - .29; engine.vx = 8;
  tick(engine);
  assert.equal(engine.wallJumps, 0);
  engine.grounded = false; engine.standingId = -1; engine.y = 2;
  engine.x = WALL - .281; engine.vx = 2;
  tick(engine);
  assert.equal(engine.wallJumps, 0);
  for (let count = 1; count <= 6; count++) {
    engine.x = (count % 2 ? 1 : -1) * (WALL - .29);
    engine.vx = (count % 2 ? 1 : -1) * 8;
    tick(engine);
    assert.equal(engine.wallJumps, count);
    assert.equal(challenge(engine, 'walls').status, count < 5 ? 'active' : 'complete');
  }
  assert.equal(challenge(engine, 'walls').progress, 5);
});

void test('pause freezes challenges; game over preserves results; retry and menu clear progress', () => {
  const engine = new TowerEngine(); engine.start('practice');
  land(engine, 1);
  engine.gems = 10;
  engine.togglePause();
  const paused = engine.snapshot().challenges;
  tick(engine, 600);
  assert.deepEqual(engine.snapshot().challenges, paused);
  engine.togglePause();
  engine.y = engine.stormY - 1; engine.grounded = false;
  tick(engine);
  assert.equal(engine.status, 'over');
  assert.equal(challenge(engine, 'combo').status, 'missed');
  assert.equal(challenge(engine, 'crystals').status, 'complete');
  assert.equal(challenge(engine, 'walls').status, 'missed');
  const ended = engine.snapshot().challenges;
  tick(engine, 600);
  assert.deepEqual(engine.snapshot().challenges, ended);
  for (const reset of [() => engine.start(), () => engine.menu()]) {
    engine.wallJumps = 5;
    reset();
    assert.equal(engine.wallJumps, 0);
    assert.ok(engine.snapshot().challenges.every(item => item.progress === 0 && item.status === 'active'));
  }
});
