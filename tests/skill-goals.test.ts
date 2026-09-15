import test from 'node:test';
import assert from 'node:assert/strict';
import { TowerEngine, freshControls, FLOOR_HEIGHT } from '../lib/tower-engine.ts';
import { advanceSkillProgress, getFeaturedSkillGoal, getSkillGoals, loadSkillProgress, readSkillProgress, saveSkillProgress, selectSkillGoal, SKILL_GOALS, SKILL_GOALS_STORAGE_KEY, type SkillRun } from '../lib/skill-goals.ts';

const run = (values: Partial<SkillRun> = {}): SkillRun => ({ status: 'playing', floor: 0, gems: 0, bestCombo: 0, wallJumps: 0, ...values });

void test('beginners can choose three reachable goals and cannot feature locked or unknown goals', () => {
  const profile = readSkillProgress(null);
  assert.deepEqual(getSkillGoals(profile).filter(goal => goal.status === 'available').map(goal => goal.id), ['floor-5', 'crystal-1', 'wall-1']);
  assert.equal(getFeaturedSkillGoal(profile)?.id, 'floor-5');
  assert.equal(selectSkillGoal(profile, 'floor-30'), profile);
  assert.equal(selectSkillGoal(profile, 'bogus'), profile);
  assert.equal(selectSkillGoal(profile, 'wall-1').featuredId, 'wall-1');
});

void test('actual higher-floor landings complete milestones in all modes, while airborne height does not', () => {
  for (const mode of ['arcade', 'party', 'practice'] as const) {
    const engine = new TowerEngine(); engine.start(mode);
    const profile = readSkillProgress(null);
    engine.y = 5 * FLOOR_HEIGHT; engine.vy = 3; engine.grounded = false;
    engine.tick(1 / 120, freshControls());
    assert.equal(advanceSkillProgress(profile, engine.snapshot()), profile);
    const y = 5 * FLOOR_HEIGHT;
    engine.platforms = [{ id: 5, x: 0, y, width: 4, gem: false, collected: false, moving: false, spring: false, origin: 0, phase: 0 }];
    engine.x = 0; engine.y = y + .01; engine.vy = -3; engine.vx = 0;
    engine.tick(1 / 120, freshControls());
    assert.ok(advanceSkillProgress(profile, engine.snapshot()).completed.includes('floor-5'));
  }
});

void test('completed milestones survive retry and reload while partial run counters reset', () => {
  let profile = advanceSkillProgress(readSkillProgress(null), run({ floor: 5, gems: 4 }));
  assert.ok(profile.completed.includes('crystal-1'));
  assert.ok(!profile.completed.includes('crystal-5'));
  const encoded = JSON.stringify(profile);
  profile = readSkillProgress(encoded);
  const nextRun = run({ gems: 1 });
  assert.equal(advanceSkillProgress(profile, nextRun), profile);
  assert.equal(getSkillGoals(profile, nextRun).find(goal => goal.id === 'crystal-5')?.progress[0].value, 1);
  assert.equal(getSkillGoals(profile, nextRun).find(goal => goal.id === 'floor-5')?.status, 'complete');
  assert.equal(getSkillGoals(profile, run({ status: 'ready', gems: 4 })).find(goal => goal.id === 'crystal-5')?.progress[0].value, 0);
});

void test('advancement unlocks harder choices and keeps a chosen goal featured until it completes', () => {
  let profile = selectSkillGoal(readSkillProgress(null), 'wall-1');
  profile = advanceSkillProgress(profile, run({ floor: 5 }));
  assert.equal(profile.featuredId, 'wall-1');
  profile = selectSkillGoal(profile, 'combo-3');
  assert.equal(profile.featuredId, 'combo-3');
  profile = advanceSkillProgress(profile, run({ bestCombo: 3 }));
  assert.equal(profile.featuredId, 'crystal-1');
  assert.equal(getSkillGoals(profile).filter(goal => goal.featured).length, 1);
  assert.equal(getSkillGoals(profile).find(goal => goal.id === 'floor-15')?.status, 'available');
});

void test('an experienced run can complete prerequisites and combined skills without extra attempts', () => {
  const profile = advanceSkillProgress(readSkillProgress(null), run({ floor: 30, gems: 5, bestCombo: 15, wallJumps: 3, status: 'over' }));
  assert.equal(profile.completed.length, SKILL_GOALS.length);
  assert.equal(profile.featuredId, null);
  assert.equal(getFeaturedSkillGoal(profile), null);
  assert.deepEqual(readSkillProgress(JSON.stringify(profile)), profile);
  assert.equal(advanceSkillProgress(profile, run()), profile);
});

void test('combined milestones require every target in the same run', () => {
  let profile = readSkillProgress(null);
  profile = advanceSkillProgress(profile, run({ floor: 15, bestCombo: 6 }));
  profile = advanceSkillProgress(profile, run({ wallJumps: 3 }));
  assert.ok(!profile.completed.includes('combine-skills'));
  profile = advanceSkillProgress(profile, run({ floor: 15, bestCombo: 6, wallJumps: 3 }));
  assert.ok(profile.completed.includes('combine-skills'));
});

void test('invalid storage cannot inject unknown goals, unavailable selections, or completion duplicates', () => {
  for (const invalid of ['bad json', 'null', '[]', '{}', '{"version":2,"completed":[]}', 'x'.repeat(10001)]) assert.deepEqual(readSkillProgress(invalid), readSkillProgress(null));
  const profile = readSkillProgress(JSON.stringify({ version: 1, completed: ['floor-30', 'bogus', 'floor-5', 'floor-5'], featuredId: 'combo-15' }));
  assert.deepEqual(profile.completed, ['floor-5']);
  assert.equal(profile.featuredId, 'crystal-1');
  assert.equal(advanceSkillProgress(readSkillProgress(null), run({ floor: Infinity, gems: NaN, bestCombo: -5, wallJumps: -3 })).completed.length, 0);
  assert.equal(advanceSkillProgress(readSkillProgress(null), run({ status: 'ready', floor: 50 })).completed.length, 0);
});

void test('storage failures preserve playable in-memory progression and successful saves reload selections', () => {
  const denied = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
  assert.deepEqual(loadSkillProgress(denied), readSkillProgress(null));
  const profile = selectSkillGoal(advanceSkillProgress(readSkillProgress(null), run({ floor: 5 })), 'combo-3');
  assert.equal(saveSkillProgress(denied, profile), false);
  assert.equal(saveSkillProgress(null, profile), false);
  const entries = new Map<string, string>();
  const storage = { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); } };
  assert.equal(saveSkillProgress(storage, profile), true);
  assert.ok(entries.has(SKILL_GOALS_STORAGE_KEY));
  assert.deepEqual(loadSkillProgress(storage), profile);
});
