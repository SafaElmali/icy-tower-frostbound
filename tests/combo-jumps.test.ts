import test from 'node:test';
import assert from 'node:assert/strict';
import { COMBO_MULTIPLIER_CAP, FLOOR_HEIGHT, TowerEngine, freshControls, type Platform } from '../lib/tower-engine.ts';
import { verifySubmission } from '../lib/leaderboard.ts';
import { planLandings } from '../lib/jev-planner.ts';

const ledge = (floor: number): Platform => ({ id: floor, x: 0, y: floor * FLOOR_HEIGHT, width: 10, moving: false, spring: false, gem: false, collected: false, origin: 0, phase: 0 });
// Drop onto a lone ledge through the real landing path.
function land(engine: TowerEngine, floor: number) {
  const p = ledge(floor);
  engine.platforms = [p]; engine.x = engine.vx = 0;
  engine.y = p.y + .03; engine.vy = -8; engine.grounded = false; engine.standingId = -1;
  engine.cameraY = p.y + 2.2; engine.stormY = p.y - 10;
  engine.tick(1 / 120, freshControls());
  assert.equal(engine.standingId, floor);
  return engine.drainEvents();
}

void test('version 9 combos continue only on jumps of two or more floors', () => {
  const engine = new TowerEngine(); engine.start('practice');
  land(engine, 2); land(engine, 5);
  assert.equal(engine.combo, 5);
  const score = engine.score;
  const events = land(engine, 6);
  assert.equal(engine.combo, 0);
  assert.equal(engine.comboTime, 0);
  assert.equal(engine.action.frenzyCharge, 0);
  assert.equal(engine.score, score + 100, 'the new floor still earns base points');
  assert.deepEqual(events.filter(event => event.type === 'combo-short').map(event => event.value), [5]);
  assert.equal(engine.floor, 6);
  assert.equal(engine.bestCombo, 5);
  // Without a chain, another short hop has nothing to announce.
  assert.equal(land(engine, 7).some(event => event.type === 'combo-short'), false);
});

void test('combo jumps are measured from the last ledge landed on, including lower recovery ledges', () => {
  const engine = new TowerEngine(); engine.start('practice');
  land(engine, 10);
  land(engine, 9);
  assert.equal(engine.combo, 10, 'landing lower keeps the chain while its timer runs');
  land(engine, 11);
  assert.equal(engine.combo, 11, 'two floors from the recovery ledge extends by the one new floor');
  land(engine, 12);
  assert.equal(engine.combo, 0);
});

void test('the version 9 score multiplier is capped while legacy rules stay uncapped', () => {
  const engine = new TowerEngine(); engine.start('practice');
  for (let floor = 2; floor <= 120; floor += 2) land(engine, floor);
  assert.equal(engine.combo, 120);
  const before = engine.score;
  land(engine, 122);
  assert.equal(engine.score - before, 2 * 100 * COMBO_MULTIPLIER_CAP);

  const legacy = new TowerEngine(73091, true, 8); legacy.start('practice');
  for (let floor = 1; floor <= 120; floor++) land(legacy, floor);
  assert.equal(legacy.combo, 120, 'version 8 hops still extend the chain');
  const legacyBefore = legacy.score;
  land(legacy, 121);
  assert.equal(legacy.score - legacyBefore, 100 * (Math.floor(121 / 5) + 1));
});

void test('a planner-driven version 9 Classic climb verifies on the server with the same result', () => {
  const engine = new TowerEngine(4242); engine.start('arcade');
  const events = new Set<string>();
  // Choose the highest reachable landing, like a skilled player, until floor 40.
  while (engine.status === 'playing' && engine.floor < 40 && engine.time < 120) {
    const plan = planLandings(engine).sort((a, b) => b.option.gain - a.option.gain)[0];
    for (const input of plan?.frames ?? [freshControls()]) {
      if (engine.status !== 'playing') break;
      engine.tick(1 / 60, input);
      for (const event of engine.drainEvents()) events.add(event.type);
    }
  }
  assert.ok(engine.floor >= 40, `reached floor ${engine.floor}`);
  // Stand still until the frost ends the run.
  while (engine.status === 'playing') { engine.tick(1 / 60, freshControls()); engine.drainEvents(); }
  assert.ok(events.has('frenzy'), 'two-floor jumps still earn a frenzy');
  assert.ok(engine.bestCombo >= 10);
  const replay = engine.getReplay()!;
  assert.equal(replay.version, 9);
  const verified = verifySubmission({ name: 'Combo climber', replay });
  assert.equal(verified.score, engine.score);
  assert.equal(verified.floor, engine.floor);
  assert.equal(verified.combo, engine.bestCombo);
  assert.equal(verified.duration, Math.round(engine.time * 1000));
});
