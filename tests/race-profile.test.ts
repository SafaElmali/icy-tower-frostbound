import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_OUTFIT } from '../lib/outfits.ts';
import { normalizeRaceProfile, RACE_NAME_MAX_LENGTH } from '../lib/race-profile.ts';
import { RACE_SLOTS, racePlayerLabel } from '../lib/race-protocol.ts';

void test('race names normalize whitespace, Unicode, controls and directional overrides', () => {
  assert.equal(normalizeRaceProfile({ name: '  Cafe\u0301\n\tClimber  ' }).name, 'Café Climber');
  assert.equal(normalizeRaceProfile({ name: '\u202EDa\u0000na\u2066\u200B' }).name, 'Dana');
  assert.equal(normalizeRaceProfile({ name: '\uD800Rider' }).name, 'Rider');
  const emoji = normalizeRaceProfile({ name: '🦊'.repeat(25) }).name;
  assert.equal(Array.from(emoji).length, RACE_NAME_MAX_LENGTH);
  assert.equal(emoji, '🦊'.repeat(20));
});

void test('missing and malformed race profiles use safe defaults for all four slots', () => {
  for (const slot of RACE_SLOTS) {
    for (const raw of [null, undefined, [], false, 42, 'someone', {}, { name: {} }, { name: ' \u202E\u200B ' }]) {
      assert.deepEqual(normalizeRaceProfile(raw, slot), {
        name: racePlayerLabel(slot), outfit: DEFAULT_OUTFIT,
      });
    }
  }
});

void test('race profiles share only plain names and catalog outfit IDs', () => {
  assert.deepEqual(normalizeRaceProfile({
    name: '<b>Rider</b>',
    token: 'private',
    outfit: { hat: 'berry-knit', sweater: { id: 'berry-knit' }, trail: 'sunset', extra: 'private' },
  }), {
    name: '<b>Rider</b>',
    outfit: { ...DEFAULT_OUTFIT, trail: 'sunset' },
  });
  assert.deepEqual(normalizeRaceProfile({ outfit: {
    hat: 'summit-beanie', sweater: 'aurora-knit', trail: 'glacier',
  } }).outfit, { hat: 'summit-beanie', sweater: 'aurora-knit', trail: 'glacier' });
});
