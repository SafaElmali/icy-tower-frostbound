import test from 'node:test';
import assert from 'node:assert/strict';
import { comparePersonalProgress, loadPersonalProgress, personalRunBaseline, readPersonalProgress, recordPersonalProgress, savePersonalProgress, type PersonalRun } from '../lib/personal-progress.ts';
import { PersonalBestMarker } from '../lib/personal-best-marker.ts';
import { FLOOR_HEIGHT } from '../lib/tower-engine.ts';

const run = (changes: Partial<PersonalRun> = {}): PersonalRun => ({ mode: 'arcade', status: 'over', floor: 12, bestCombo: 4, wallJumps: 2, ...changes });

void test('each mode saves independent skill records and captures a fixed baseline before each run', () => {
  let profile = recordPersonalProgress(readPersonalProgress(null), run());
  const baseline = personalRunBaseline(profile, 'arcade');
  const nextRun = run({ floor: 8, bestCombo: 6, wallJumps: 5 });
  profile = recordPersonalProgress(profile, nextRun);
  assert.deepEqual(profile.modes.arcade, { floor: 12, bestCombo: 6, wallJumps: 5 });
  assert.deepEqual(baseline, { mode: 'arcade', floor: 12, bestCombo: 4, wallJumps: 2 });
  assert.equal(Object.isFrozen(baseline), true);
  assert.deepEqual(comparePersonalProgress(baseline, nextRun).map(row => row.improvement), [0, 2, 3]);
  profile = recordPersonalProgress(profile, run({ mode: 'party', floor: 40 }));
  assert.equal(profile.modes.arcade.floor, 12); assert.equal(profile.modes.party.floor, 40);
  assert.equal(profile.modes.practice.floor, 0);
  assert.deepEqual(comparePersonalProgress(baseline, run({ mode: 'party' })), []);
});

void test('zero, ties and lower results never produce false record celebrations', () => {
  const profile = recordPersonalProgress(readPersonalProgress(null), run());
  const baseline = personalRunBaseline(profile, 'arcade');
  assert.ok(comparePersonalProgress(baseline, run()).every(row => row.improvement === 0));
  assert.ok(comparePersonalProgress(personalRunBaseline(readPersonalProgress(null), 'arcade'), run({ floor: 0, bestCombo: 0, wallJumps: 0 })).every(row => row.improvement === 0));
  assert.equal(recordPersonalProgress(profile, run({ status: 'playing', floor: 90 })), profile);
  assert.equal(recordPersonalProgress(profile, run({ floor: 3, bestCombo: 1, wallJumps: 1 })), profile);
});

void test('storage failures and malformed records cannot corrupt progress or interrupt a run', () => {
  for (const raw of ['{', 'null', '[]', '{}', '{"version":2,"modes":{}}', 'x'.repeat(10001)]) assert.deepEqual(readPersonalProgress(raw), readPersonalProgress(null));
  const invalid = readPersonalProgress(JSON.stringify({ version: 1, modes: { arcade: { floor: -1, bestCombo: '9', wallJumps: 2.5 }, party: null, practice: [] } }));
  assert.deepEqual(invalid, readPersonalProgress(null));
  const denied = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); } };
  assert.deepEqual(loadPersonalProgress(denied), readPersonalProgress(null));
  assert.equal(savePersonalProgress(denied, invalid), false);
  assert.equal(savePersonalProgress(null, invalid), false);
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const saved = recordPersonalProgress(invalid, run());
  assert.equal(savePersonalProgress(storage, saved), true);
  assert.deepEqual(loadPersonalProgress(storage), saved);
  assert.deepEqual(recordPersonalProgress(invalid, run({ floor: Infinity, bestCombo: NaN, wallJumps: -1 })), invalid);
});

void test('best-floor marker celebrates a landed record once and resets for the next run', () => {
  const marker = new PersonalBestMarker(); marker.setFloor(12);
  assert.equal(marker.group.position.y, 12 * FLOOR_HEIGHT);
  const frame = { floor: 12, time: 10, cameraY: 12 * FLOOR_HEIGHT, status: 'playing' as const };
  marker.update(frame); assert.equal(marker.group.visible, true);
  marker.update({ ...frame, floor: 13, time: 11 }); assert.equal(marker.group.visible, true);
  marker.update({ ...frame, floor: 14, time: 13.3 }); assert.equal(marker.group.visible, false);
  marker.update({ ...frame, floor: 15, time: 14 }); assert.equal(marker.group.visible, false);
  marker.setFloor(14); marker.update({ ...frame, floor: 14, time: 1 }); assert.equal(marker.group.visible, true);
  marker.setFloor(0); marker.update(frame); assert.equal(marker.group.visible, false);
  marker.setFloor(12); marker.update({ ...frame, status: 'ready' }); assert.equal(marker.group.visible, false);
  marker.dispose();
});
