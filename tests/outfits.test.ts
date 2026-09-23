import test from 'node:test';
import assert from 'node:assert/strict';
import { COSMETICS, DEFAULT_OUTFIT, EMPTY_PROGRESS, SLOT_DEFAULTS, advanceProgress, equippedId, isUnlocked, normalizeOutfit, outfitKey, readProfile } from '../lib/outfits.ts';

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

void test('the optional extras slot loads old saves and rows, and is left out at its default', () => {
  // Saves, leaderboard rows and race profiles from before extras have no accessory key.
  assert.deepEqual(normalizeOutfit({ hat: 'summit-beanie', sweater: 'aurora-knit', trail: 'glacier' }), { hat: 'summit-beanie', sweater: 'aurora-knit', trail: 'glacier' });
  assert.equal(equippedId(DEFAULT_OUTFIT, 'accessory'), SLOT_DEFAULTS.accessory);
  assert.deepEqual(normalizeOutfit({ ...DEFAULT_OUTFIT, accessory: 'no-accessory' }), DEFAULT_OUTFIT);
  assert.deepEqual(normalizeOutfit({ ...DEFAULT_OUTFIT, accessory: 'bat-cape' }), { ...DEFAULT_OUTFIT, accessory: 'bat-cape' });
  for (const junk of ['summit-beanie', '<img>', 7, { id: 'bat-cape' }, null]) assert.deepEqual(normalizeOutfit({ ...DEFAULT_OUTFIT, accessory: junk }), DEFAULT_OUTFIT);
  // Locked extras fall back to none, like every other slot.
  assert.deepEqual(normalizeOutfit({ accessory: 'bat-cape' }, { ...EMPTY_PROGRESS, stomps: 4 }), DEFAULT_OUTFIT);
  const profile = { progress: { floor: 25, score: 0, combo: 0, stomps: 0 }, equipped: { ...DEFAULT_OUTFIT, accessory: 'knit-scarf' } };
  assert.deepEqual(readProfile(JSON.stringify(profile)), profile);
  assert.notEqual(outfitKey(profile.equipped), outfitKey(DEFAULT_OUTFIT));
});

void test('existing cosmetic IDs are never renamed or removed, and every slot has a free default', () => {
  const ids = new Set(COSMETICS.map(item => item.id));
  for (const id of ['blue-beanie', 'frost-beanie', 'summit-beanie', 'glacier-beanie', 'starfall-beanie', 'green-knit', 'berry-knit', 'aurora-knit', 'storm-knit', 'batbane-knit', 'rainbow', 'glacier', 'sunset', 'frenzy', 'aurora']) assert.ok(ids.has(id), id);
  assert.equal(ids.size, COSMETICS.length, 'IDs are unique');
  for (const [slot, id] of Object.entries(SLOT_DEFAULTS)) assert.equal(COSMETICS.find(item => item.id === id)?.target, 0, slot);
});
