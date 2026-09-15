import test from 'node:test';
import assert from 'node:assert/strict';
import { getTowerSection, TOWER_SECTIONS } from '../lib/tower-sections.ts';

void test('tower sections change at exact earned floor milestones', () => {
  for (const [floor, section] of [[0, 0], [24, 0], [25, 1], [49, 1], [50, 2], [74, 2], [75, 3], [10000, 3]]) {
    assert.equal(getTowerSection(floor), TOWER_SECTIONS[section]);
  }
  for (const floor of [-10, NaN, Infinity]) assert.equal(getTowerSection(floor), TOWER_SECTIONS[0]);
});

void test('sections have distinct backgrounds and stable names for on-screen milestones', () => {
  assert.deepEqual(TOWER_SECTIONS.map(section => section.name), ['THE FORGOTTEN HALL', 'THE FROZEN BELFRY', 'CRYSTAL SPIRE', 'THE AURORA']);
  assert.equal(new Set(TOWER_SECTIONS.map(section => section.palette.background)).size, 4);
  assert.equal(new Set(TOWER_SECTIONS.map(section => section.palette.windowHigh)).size, 4);
  assert.equal(TOWER_SECTIONS[3].auroraStrength, 1);
});
