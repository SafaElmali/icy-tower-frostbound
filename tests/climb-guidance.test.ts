import test from 'node:test';
import assert from 'node:assert/strict';
import { readGuidanceProfile, replayGuidance, skipGuidance, freshGuidanceRun, advanceGuidance, getGuidanceCue, type GuidanceObservation } from '../lib/climb-guidance.ts';
import { TowerEngine, freshControls } from '../lib/tower-engine.ts';

const observation = (values: Partial<GuidanceObservation> = {}): GuidanceObservation => ({ status: 'playing', mode: 'arcade', time: 1, x: 0, vx: 0, grounded: true, maxY: 0, ...values });
void test('prompts advance only from movement and real jump events, one step at a time', () => {
  let state = { profile: replayGuidance(), run: freshGuidanceRun() };
  const engine = new TowerEngine(); engine.start('practice');
  const controls = { ...freshControls(), right: true };
  for (let i = 0; i < 10; i++) {
    engine.tick(1 / 60, controls);
    state = advanceGuidance(state.profile, state.run, engine, engine.drainEvents(), controls);
  }
  assert.deepEqual(state.profile.completed, []);
  for (let i = 0; i < 10; i++) {
    engine.tick(1 / 60, controls);
    state = advanceGuidance(state.profile, state.run, engine, engine.drainEvents(), controls);
  }
  assert.deepEqual(state.profile.completed, ['move']);
  assert.equal(getGuidanceCue(state.profile, state.run, engine)?.id, 'jump');
  controls.jump = true;
  engine.tick(1 / 60, controls);
  state = advanceGuidance(state.profile, state.run, engine, engine.drainEvents(), controls);
  assert.deepEqual(state.profile.completed, ['move', 'jump']);
  assert.equal(getGuidanceCue(state.profile, state.run, engine)?.id, 'momentum');
});
void test('momentum requires a sufficiently fast takeoff and cannot complete from speed alone', () => {
  const profile = { ...replayGuidance(), completed: ['move', 'jump'] as const };
  const mutable = { ...profile, completed: [...profile.completed] };
  for (const events of [[], [{ type: 'jump' as const, x: 0, y: 0, value: 2 }]]) {
    assert.equal(advanceGuidance(mutable, freshGuidanceRun(), observation({ vx: 8 }), events, freshControls()).profile, mutable);
  }
  const next = advanceGuidance(mutable, freshGuidanceRun(), observation(), [{ type: 'jump', x: 0, y: 0, value: -4 }], freshControls());
  assert.deepEqual(next.profile.completed, ['move', 'jump', 'momentum']);
});
void test('menus, pauses, air movement, repeated frames and teleports cannot complete movement', () => {
  const profile = replayGuidance();
  for (const obs of [observation({ status: 'ready', x: 1, vx: 5 }), observation({ status: 'paused', x: 1, vx: 5 }), observation({ grounded: false, x: 1, vx: 5 }), observation({ time: 0, x: 1, vx: 5 }), observation({ time: .01, x: 5, vx: 5 })]) {
    assert.equal(advanceGuidance(profile, freshGuidanceRun(), obs, [], { left: false, right: true, jump: false }).profile, profile);
  }
});
void test('skip persists, replay clears it, corrupt storage safely resets and sequential completion survives reload', () => {
  const skipped = skipGuidance(replayGuidance());
  assert.deepEqual(readGuidanceProfile(JSON.stringify(skipped)), skipped);
  assert.equal(getGuidanceCue(skipped, freshGuidanceRun(), observation()), null);
  assert.equal(getGuidanceCue(replayGuidance(), freshGuidanceRun(), observation())?.id, 'move');
  for (const raw of ['bad', 'null', '{}', '{"version":2,"completed":[]}']) assert.deepEqual(readGuidanceProfile(raw), replayGuidance());
  assert.deepEqual(readGuidanceProfile('{"version":1,"completed":["jump","momentum"]}'), replayGuidance());
  assert.deepEqual(readGuidanceProfile('{"version":1,"completed":["move","move","unknown"]}').completed, ['move']);
});
void test('frost warning takes priority for four playing seconds even when tips are skipped; practice does not show it', () => {
  const profile = skipGuidance(replayGuidance());
  const obs = observation({ maxY: 5 * 2.35 });
  const { run } = advanceGuidance(profile, freshGuidanceRun(), obs, [], freshControls());
  assert.equal(getGuidanceCue(profile, run, obs)?.id, 'frost');
  assert.equal(getGuidanceCue(profile, run, { ...obs, time: 4.9 })?.id, 'frost');
  assert.equal(getGuidanceCue(profile, run, { ...obs, time: 5 }), null);
  assert.equal(getGuidanceCue(profile, run, { ...obs, status: 'paused' }), null);
  const practice = { ...obs, mode: 'practice' as const };
  const next = advanceGuidance(profile, freshGuidanceRun(), practice, [], freshControls());
  assert.equal(next.run.frostStartedAt, null);
});
void test('retries begin with no accumulated movement or lingering frost warning', () => {
  const result = advanceGuidance(replayGuidance(), freshGuidanceRun(), observation({ x: .4, vx: 4, maxY: 15 }), [], { left: false, right: true, jump: false });
  assert.ok(result.run.groundTravel > 0);
  assert.ok(result.run.frostStartedAt !== null);
  const retry = freshGuidanceRun();
  assert.equal(retry.groundTravel, 0);
  assert.equal(retry.frostStartedAt, null);
});
