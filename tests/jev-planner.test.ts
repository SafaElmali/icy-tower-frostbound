import assert from 'node:assert/strict';
import test from 'node:test';
import { TowerEngine, freshControls } from '../lib/tower-engine.ts';
import { planLandings } from '../lib/jev-planner.ts';

void test('previews preserve simulation state without modifying the live run', () => {
  const e = new TowerEngine(42);
  e.start('practice');
  for (let i = 0; i < 20; i++)
    e.tick(1 / 60, { left: true, right: false, jump: i === 0 });
  const before = structuredClone(e);
  const copy = e.preview();
  for (let i = 0; i < 30; i++) copy.tick(1 / 60, freshControls());
  assert.deepEqual(structuredClone(e), before);
  for (let i = 0; i < 30; i++) e.tick(1 / 60, freshControls());
  assert.equal(e.x, copy.x);
  assert.equal(e.y, copy.y);
  assert.equal(e.vx, copy.vx);
  assert.equal(e.floor, copy.floor);
});

void test('every offered starting jump reaches its stated platform and stops safely', () => {
  for (const seed of [73091, 42, 98765, 1, 1234, 4444]) {
    const engine = new TowerEngine(seed);
    engine.start('practice');
    const plans = planLandings(engine);
    assert.ok(plans.length > 0);
    for (const plan of plans) {
      const e = engine.preview();
      for (const input of plan.frames) e.tick(1 / 60, input);
      assert.equal(e.standingId, plan.option.targetId);
      assert.equal(e.grounded, true);
      assert.equal(e.status, 'playing');
      assert.ok(Math.abs(e.vx) <= 0.4);
      assert.ok(plan.option.landingMargin >= 0.15);
    }
    assert.equal(engine.time, 0);
  }
});

void test('planner can recover from an airborne position without changing the run', () => {
  const e = new TowerEngine(42);
  e.start('practice');
  for (let f = 0; f < 25; f++)
    e.tick(1 / 60, { left: true, right: false, jump: f === 0 });
  const time = e.time;
  const plans = planLandings(e);
  assert.ok(plans.length > 0);
  assert.equal(e.time, time);
  for (const plan of plans) {
    const copy = e.preview();
    for (const input of plan.frames) copy.tick(1 / 60, input);
    assert.equal(copy.standingId, plan.option.targetId);
  }
});
