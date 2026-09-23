import test from 'node:test';
import assert from 'node:assert/strict';
import { COSMETICS, DEFAULT_OUTFIT, EMPTY_PROGRESS, advanceProgress, isUnlocked, normalizeOutfit, readProfile } from '../lib/outfits.ts';

void test('achievement rewards unlock at the threshold and survive weaker later runs', () => {
  for (const item of COSMETICS.filter(item => item.target > 0)) {
    const before = { ...EMPTY_PROGRESS, [item.metric]: item.target - 1 };
    assert.equal(isUnlocked(item, before), false);
    const earned = advanceProgress(before, { ...EMPTY_PROGRESS, [item.metric]: item.target });
    assert.equal(isUnlocked(item, earned), true);
    assert.deepEqual(advanceProgress(earned, EMPTY_PROGRESS), earned);
    assert.equal(normalizeOutfit({ [item.slot]: item.id }, earned)[item.slot], item.id);
    assert.equal(normalizeOutfit({ [item.slot]: item.id }, before)[item.slot], DEFAULT_OUTFIT[item.slot]);
  }
});

void test('progress is a personal best, not an accumulation across runs', () => {
  assert.deepEqual(advanceProgress({ floor: 10, score: 900, combo: 4, stomps: 2 }, { floor: 2, score: 700, combo: 3, stomps: 1 }), { floor: 10, score: 900, combo: 4, stomps: 2 });
  // Saves and records from before the stomps metric count it as zero.
  assert.deepEqual(advanceProgress({ floor: 3, score: 0, combo: 0 } as never, { floor: 5 }), { floor: 5, score: 0, combo: 0, stomps: 0 });
});

void test('saved achievements and equipped items round-trip, with safe defaults for damaged storage', () => {
  const profile = { progress: { floor: 50, score: 5000, combo: 15, stomps: 3 }, equipped: { hat: 'summit-beanie', sweater: 'aurora-knit', trail: 'sunset' } };
  assert.deepEqual(readProfile(JSON.stringify(profile)), profile);
  for (const raw of [null, 'bad json', 'null', '[]', '{"progress":{"floor":-1,"score":"5000","combo":1.5},"equipped":{"hat":"summit-beanie"}}']) {
    assert.deepEqual(readProfile(raw), { progress: EMPTY_PROGRESS, equipped: DEFAULT_OUTFIT });
  }
  // Profiles saved before the stomps metric load with zero stomps.
  assert.deepEqual(readProfile('{"progress":{"floor":12,"score":40,"combo":3}}').progress, { floor: 12, score: 40, combo: 3, stomps: 0 });
  assert.deepEqual(normalizeOutfit({ hat: 'sunset', sweater: '<script>', trail: { color: 'red' } }), DEFAULT_OUTFIT);
  assert.deepEqual(normalizeOutfit(undefined), DEFAULT_OUTFIT);
});
