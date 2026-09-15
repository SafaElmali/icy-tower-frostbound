import test from 'node:test';
import assert from 'node:assert/strict';
import { TowerEngine, WALL, freshControls, type Platform } from '../lib/tower-engine.ts';
import { getRunFeedback } from '../lib/run-feedback.ts';

const step = (engine: TowerEngine, count: number) => {
  for (let i = 0; i < count; i++) engine.tick(1 / 120, freshControls());
};
function ledgeRun() {
  const engine = new TowerEngine(17); engine.start();
  const ledge: Platform = { id: -15, floor: 14, x: 0, y: 10, width: 1, gem: false, collected: false, moving: false, spring: false, origin: 0, phase: 0 };
  engine.platforms = [ledge]; engine.standingId = ledge.id;
  engine.x = .64; engine.y = 10; engine.vx = 4; engine.stormY = 8.5;
  return engine;
}

void test('a recorded walk off a shortcut ledge yields its logical floor and a jump tip', () => {
  const engine = ledgeRun(); step(engine, 120);
  assert.equal(engine.status, 'over');
  assert.deepEqual(engine.snapshot().failureEvidence, { kind: 'left-ledge', floor: 14 });
  const feedback = getRunFeedback(engine.snapshot())!;
  assert.match(feedback.explanation, /floor 14 without jumping/);
  assert.match(feedback.suggestion, /press jump before/);
});

void test('a coyote-time jump clears walk-off evidence before frost catches an ascent', () => {
  const engine = ledgeRun(); step(engine, 3);
  assert.equal(engine.grounded, false);
  engine.tick(1 / 120, { left: false, right: false, jump: true });
  assert.ok(engine.vy > 0);
  engine.stormY = engine.y + 1; step(engine, 1);
  assert.deepEqual(engine.failureEvidence, { kind: 'frost' });
});

void test('a recovery landing clears the prior walk off and identifies frost reaching the ledge', () => {
  const engine = ledgeRun(); step(engine, 1);
  engine.platforms.push({ ...engine.platforms[0], id: 3, floor: 3, x: 1, y: 9, width: 8 });
  step(engine, 70);
  assert.equal(engine.grounded, true);
  engine.stormY = 9.1; step(engine, 1);
  assert.deepEqual(engine.failureEvidence, { kind: 'frost-on-ledge' });
  assert.equal(getRunFeedback(engine.snapshot())!.explanation, 'The frost reached your ledge.');
});

void test('a falling death has a general landing tip without claiming an overshoot', () => {
  const engine = ledgeRun(); engine.grounded = false; engine.standingId = -1;
  engine.y = 8.6; engine.vy = -4; step(engine, 20);
  assert.deepEqual(engine.failureEvidence, { kind: 'fell' });
  const feedback = getRunFeedback(engine.snapshot())!;
  assert.equal(feedback.explanation, 'You fell into the frost.');
  assert.match(feedback.suggestion, /center of a landing ledge/);
});

void test('restarting resets evidence and guidance stays hidden before a run finishes', () => {
  const engine = ledgeRun(); step(engine, 120);
  assert.ok(engine.failureEvidence);
  engine.start(); assert.equal(engine.failureEvidence, null);
  assert.equal(getRunFeedback(engine.snapshot()), null);
  for (const status of ['ready', 'playing', 'paused'] as const) {
    assert.equal(getRunFeedback({ status, failureEvidence: { kind: 'fell' } }), null);
  }
});

void test('missing evidence and legacy replay rules safely produce feedback', () => {
  const fallback = getRunFeedback({ status: 'over' })!;
  assert.equal(fallback.explanation, 'The frost caught you.');
  assert.match(fallback.suggestion, /higher landing ledge/);
  const engine = new TowerEngine(17, false, 1); engine.start();
  engine.stormY = 1; step(engine, 1);
  assert.equal(engine.status, 'over');
  assert.equal(engine.rulesVersion, 1);
  assert.equal(getRunFeedback(engine.snapshot())!.explanation, 'The frost reached your ledge.');
});

void test('a manual wall boost after walking off replaces the earlier walk-off explanation', () => {
  const engine = ledgeRun(); step(engine, 20);
  assert.equal(engine.grounded, false);
  engine.x = WALL - .3;
  engine.tick(1 / 120, { left: false, right: true, jump: true });
  assert.equal(engine.wallJumps, 1);
  assert.ok(engine.vy > 0);
  engine.stormY = engine.y + 1; step(engine, 1);
  assert.deepEqual(engine.failureEvidence, { kind: 'frost' });
});
