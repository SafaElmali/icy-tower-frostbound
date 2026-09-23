import test from 'node:test';
import assert from 'node:assert/strict';
import { WRAITH_DASH_LENGTH, WRAITH_DASH_TIME, WRAITH_DRIFT_TIME, WRAITH_FADE_TIME, WRAITH_FLOOR, WRAITH_TELL_TIME, type FrostWraith } from '../lib/tower-action.ts';
import { FLOOR_HEIGHT, TowerEngine, freshControls, type GameEvent, type Platform } from '../lib/tower-engine.ts';
import { createRaceEngine } from '../lib/race-protocol.ts';
import { sampleRaceHazards } from '../lib/race-hazards.ts';
import { verifySubmission } from '../lib/leaderboard.ts';
import { planLandings } from '../lib/jev-planner.ts';

const ledge = (floor: number): Platform => ({ id: floor, x: 0, y: floor * FLOOR_HEIGHT, width: 10, moving: false, spring: false, gem: false, collected: false, origin: 0, phase: 0 });
/** A lone broad ledge with encounters pushed out of the way, so only wraith rules apply. */
function stand(engine: TowerEngine, floor: number) {
  const p = ledge(floor);
  engine.platforms = [p]; engine.floor = floor; engine.x = engine.vx = engine.vy = 0;
  engine.y = p.y; engine.maxY = p.y; engine.cameraY = p.y + 2.2; engine.stormY = p.y - 10;
  engine.grounded = true; engine.standingId = p.id;
  (engine as unknown as { nextEncounterFloor: number }).nextEncounterFloor = Infinity;
  return p;
}
/** Advance while removing icicles and bats, isolating the wraith from other hazards. */
function step(engine: TowerEngine, frames: number, events: GameEvent[] = []) {
  for (let i = 0; i < frames; i++) {
    engine.action.icicles = []; engine.action.bats = [];
    engine.tick(1 / 120, freshControls());
    events.push(...engine.drainEvents());
    engine.stormY = engine.y - 10;
  }
  return events;
}
function spawnWraith(engine: TowerEngine) {
  const events: GameEvent[] = [];
  for (let i = 0; i < 20 * 120 && !engine.action.wraiths.length; i++) step(engine, 1, events);
  return { wraith: engine.action.wraiths[0], events };
}
const wraithAt = (engine: TowerEngine, state: FrostWraith['state'], x: number, y: number): FrostWraith =>
  ({ id: 900, x, y, side: 1, state, time: 0, dirX: -1, dirY: 0, startX: x, startY: y, alive: true });

void test('frost wraiths appear only in version 9 from floor 100, inside the walls, with a spawn cue', () => {
  const low = new TowerEngine(); low.start('practice'); stand(low, 96);
  const lowEvents = step(low, 20 * 120);
  assert.equal(low.action.wraiths.length, 0);
  assert.ok(!lowEvents.some(event => event.type.startsWith('wraith')));
  assert.ok(96 < WRAITH_FLOOR);

  for (const version of [6, 7, 8] as const) {
    const legacy = new TowerEngine(73091, true, version); legacy.start('practice'); stand(legacy, 106);
    const events = step(legacy, 20 * 120);
    assert.equal(legacy.action.wraiths.length, 0, `version ${version} never spawns wraiths`);
    assert.ok(!events.some(event => event.type.startsWith('wraith')));
  }

  const engine = new TowerEngine(); engine.start('practice'); const p = stand(engine, 106);
  const { wraith, events } = spawnWraith(engine);
  assert.ok(wraith, 'a wraith arrives above floor 100');
  assert.equal(wraith.state, 'drift');
  assert.ok(Math.abs(wraith.x) <= 5.3 + 1e-9, 'it enters inside the walls, in view');
  assert.ok(wraith.y > p.y + 2.5 && wraith.y < engine.cameraY + 4);
  assert.ok(events.some(event => event.type === 'wraith'));
  assert.ok(engine.action.notice?.label === 'FROST WRAITH');

  // No wraith starts when an encounter is a few floors away and would clear it before its tell.
  const soon = new TowerEngine(); soon.start('practice'); stand(soon, 106);
  (soon as unknown as { nextEncounterFloor: number }).nextEncounterFloor = 108;
  step(soon, 10 * 120);
  assert.equal(soon.action.wraiths.length, 0);
});

void test('the wraith drifts, then a fixed tell locks its whole dash path before the dash', () => {
  const engine = new TowerEngine(); engine.start('practice'); const p = stand(engine, 106);
  const { wraith } = spawnWraith(engine);
  const events = step(engine, Math.round(WRAITH_DRIFT_TIME * 120) - 3);
  assert.equal(wraith.state, 'drift');
  assert.ok(Math.abs(wraith.x - engine.x) > 1.5, 'it hovers beside the climber, not on top of them');
  let frames = 0;
  while (wraith.state === 'drift' && frames++ < 6) step(engine, 1, events);
  assert.equal(wraith.state, 'tell');
  assert.ok(frames >= 2 && frames <= 4, 'the tell starts after the fixed drift time');
  assert.equal(events.filter(event => event.type === 'wraith-tell').length, 1);
  // The locked line points at the climber's body when the tell starts.
  const { startX, startY, dirX, dirY } = wraith;
  const toBody = Math.hypot(engine.x - startX, p.y + .7 - startY);
  assert.ok(Math.abs(startX + dirX * toBody - engine.x) < .05 && Math.abs(startY + dirY * toBody - (p.y + .7)) < .05);
  assert.ok(WRAITH_DASH_LENGTH > toBody + 2, 'the dash carries through the old position');
  // Moving during the tell never re-aims or moves the wraith.
  engine.x = startX > 0 ? -4 : 4;
  step(engine, Math.round(WRAITH_TELL_TIME * 120) - 2, events);
  assert.equal(wraith.state, 'tell');
  assert.deepEqual([wraith.x, wraith.y, wraith.dirX, wraith.dirY], [startX, startY, dirX, dirY]);
  step(engine, 2, events);
  assert.equal(wraith.state, 'dash');
  assert.equal(events.filter(event => event.type === 'wraith-dash').length, 1);
  step(engine, Math.round(WRAITH_DASH_TIME * 120) + 1, events);
  assert.equal(wraith.state, 'fade');
  assert.ok(Math.abs(wraith.x - (startX + dirX * WRAITH_DASH_LENGTH)) < 1e-9, 'the dash ends exactly on the telegraphed line');
  assert.ok(Math.abs(wraith.y - (startY + dirY * WRAITH_DASH_LENGTH)) < 1e-9);
  assert.equal(engine.action.hits, 0, 'stepping off the line avoids the dash');
  step(engine, Math.round(WRAITH_FADE_TIME * 120) + 2, events);
  assert.equal(engine.action.wraiths.length, 0);
});

void test('only the dash hurts, a stomp bounces, and a spent wraith is harmless', () => {
  const engine = new TowerEngine(); engine.start('practice'); stand(engine, 106);
  // Standing still on the locked line takes the dash.
  spawnWraith(engine);
  step(engine, Math.round((WRAITH_DRIFT_TIME + WRAITH_TELL_TIME + WRAITH_DASH_TIME) * 120) + 4);
  assert.equal(engine.action.hits, 1);
  assert.ok(engine.action.invulnerableTime > 0);

  for (const state of ['drift', 'tell', 'fade'] as const) {
    const calm = new TowerEngine(); calm.start('practice'); stand(calm, 106);
    calm.action.wraiths = [wraithAt(calm, state, 0, calm.y + .7)];
    calm.tick(1 / 120, freshControls());
    assert.equal(calm.action.hits, 0, `${state} contact is harmless`);
  }
  const dash = new TowerEngine(); dash.start('practice'); stand(dash, 106);
  dash.action.wraiths = [wraithAt(dash, 'dash', 0, dash.y + .7)];
  dash.tick(1 / 120, freshControls());
  assert.equal(dash.action.hits, 1);

  const stomp = new TowerEngine(); stomp.start('practice'); stand(stomp, 106);
  stomp.grounded = false; stomp.standingId = -1; stomp.y += 3; stomp.vy = -8;
  stomp.action.wraiths = [wraithAt(stomp, 'tell', 0, stomp.y - .4)];
  const score = stomp.score;
  stomp.tick(1 / 120, freshControls());
  assert.equal(stomp.action.stomps, 1); assert.equal(stomp.action.hits, 0);
  assert.equal(stomp.score, score + 400); assert.ok(stomp.vy >= 17.6);
  assert.ok(stomp.drainEvents().some(event => event.type === 'stomp' && event.value === 400));
  stomp.tick(1 / 120, freshControls());
  assert.equal(stomp.action.wraiths.length, 0);
});

void test('wraith state is deterministic, frame-rate independent, cloned by snapshots, and reset on retry', () => {
  const a = new TowerEngine(42), b = new TowerEngine(42);
  for (const engine of [a, b]) { engine.start('practice'); stand(engine, 106); }
  for (let i = 0; i < 240; i++) { a.action.icicles = []; a.action.bats = []; a.tick(1 / 60, freshControls()); a.stormY = a.y - 10; }
  // Match the same frames: two 120 Hz steps per 60 Hz frame.
  for (let i = 0; i < 240; i++) { b.action.icicles = []; b.action.bats = []; b.tick(1 / 120, freshControls()); b.tick(1 / 120, freshControls()); b.stormY = b.y - 10; }
  assert.ok(a.action.wraiths.length);
  assert.deepEqual(a.action.wraiths, b.action.wraiths);

  const snapshot = a.snapshot();
  snapshot.action.wraiths[0].x = 99;
  assert.notEqual(a.action.wraiths[0].x, 99, 'snapshots own their wraith copies');
  const preview = a.preview();
  preview.action.wraiths[0].y = -99;
  assert.notEqual(a.action.wraiths[0].y, -99, 'planner previews never alias the live wraith');

  // A retried run on the same engine must match a fresh engine, as server replay does.
  const fresh = new TowerEngine(42); fresh.start('practice'); stand(fresh, 106);
  a.start('practice', 42); stand(a, 106);
  step(a, 600); step(fresh, 600);
  assert.deepEqual(a.action, fresh.action);
});

void test('actor counts stay bounded and rest floors and races never hold a wraith', () => {
  const engine = new TowerEngine(); engine.start('practice'); stand(engine, 106);
  for (let frame = 0; frame < 9000; frame++) {
    if (frame % 120 === 0) stand(engine, 106);
    engine.tick(1 / 120, freshControls()); engine.drainEvents();
    assert.ok(engine.action.wraiths.length <= 1);
  }
  engine.action.wraiths = [wraithAt(engine, 'drift', 0, engine.y + 3)];
  stand(engine, 150); engine.tick(1 / 120, freshControls());
  assert.equal(engine.action.wraiths.length, 0, 'rest stages clear the wraith');

  const race = createRaceEngine(17);
  Object.assign(race, { floor: 130, y: 130 * FLOOR_HEIGHT, cameraY: 130 * FLOOR_HEIGHT + 2.2, stormY: 130 * FLOOR_HEIGHT - 10 });
  for (let frame = 0; frame < 2400; frame++) {
    race.advanceRaceHazards(frame); race.tick(1 / 120, freshControls()); race.drainEvents();
    race.stormY = race.y - 10;
    assert.equal(race.action.wraiths.length, 0);
  }
  assert.ok(!('wraiths' in sampleRaceHazards(17, 2000, 300)));
});

void test('version 9 ice shatters on the ledge it was aimed at, after hits and near misses', () => {
  const falling = (engine: TowerEngine, x: number) => ({ id: 500, x, y: engine.y + .5, spawnY: engine.y + 7, targetY: engine.y, state: 'falling' as const, warningTime: 0, vy: -20, nearMiss: false });
  const engine = new TowerEngine(); engine.start('practice'); const p = stand(engine, 22);
  engine.action.icicles = [falling(engine, 3)];
  const events: GameEvent[] = [];
  for (let i = 0; i < 10; i++) { engine.tick(1 / 120, freshControls()); events.push(...engine.drainEvents()); }
  const shatter = events.find(event => event.type === 'icicle-shatter');
  assert.ok(shatter); assert.equal(shatter.x, 3); assert.equal(shatter.y, p.y);
  assert.equal(engine.action.icicles.length, 0); assert.equal(engine.action.hits, 0);

  // A near miss still scores before the same shard breaks on the ledge.
  const near = new TowerEngine(); near.start('practice'); stand(near, 22);
  near.action.icicles = [falling(near, 1.2)];
  const nearEvents: GameEvent[] = [];
  for (let i = 0; i < 10; i++) { near.tick(1 / 120, freshControls()); nearEvents.push(...near.drainEvents()); }
  assert.equal(near.action.dodges, 1);
  assert.ok(nearEvents.findIndex(event => event.type === 'dodge') < nearEvents.findIndex(event => event.type === 'icicle-shatter'));

  // Version 8 ice keeps falling through ledges.
  const legacy = new TowerEngine(73091, true, 8); legacy.start('practice'); const lp = stand(legacy, 22);
  legacy.action.icicles = [falling(legacy, 3)];
  for (let i = 0; i < 10; i++) { legacy.tick(1 / 120, freshControls()); assert.ok(!legacy.drainEvents().some(event => event.type === 'icicle-shatter')); }
  assert.ok(legacy.action.icicles[0].y < lp.y);
});

void test('a planner-driven version 9 climb past floor 100 meets a wraith and verifies on the server', () => {
  const engine = new TowerEngine(4242); engine.start('arcade');
  const events = new Set<string>();
  while (engine.status === 'playing' && !(events.has('wraith-dash') && engine.floor > WRAITH_FLOOR) && engine.time < 240) {
    const plan = planLandings(engine).sort((a, b) => b.option.gain - a.option.gain)[0];
    for (const input of plan?.frames ?? [freshControls()]) {
      if (engine.status !== 'playing') break;
      engine.tick(1 / 60, input);
      for (const event of engine.drainEvents()) events.add(event.type);
    }
  }
  for (const type of ['wraith', 'wraith-tell', 'wraith-dash']) assert.ok(events.has(type), `the climb exercises ${type}`);
  while (engine.status === 'playing') { engine.tick(1 / 60, freshControls()); engine.drainEvents(); }
  const replay = engine.getReplay()!;
  assert.equal(replay.version, 9);
  const verified = verifySubmission({ name: 'Wraith climber', replay });
  assert.equal(verified.score, engine.score);
  assert.equal(verified.floor, engine.floor);
  assert.equal(verified.combo, engine.bestCombo);
  assert.equal(verified.duration, Math.round(engine.time * 1000));
});
