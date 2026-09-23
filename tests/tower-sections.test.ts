import test from 'node:test';
import assert from 'node:assert/strict';
import { getTowerSection, TOWER_SECTIONS } from '../lib/tower-sections.ts';

void test('tower sections change at exact earned floor milestones', () => {
  for (const [floor, section] of [[0, 0], [24, 0], [25, 1], [49, 1], [50, 2], [74, 2], [75, 3], [99, 3], [100, 4], [149, 4], [150, 5], [199, 5], [200, 6], [10000, 6]]) {
    assert.equal(getTowerSection(floor), TOWER_SECTIONS[section]);
  }
  for (const floor of [-10, NaN, Infinity]) assert.equal(getTowerSection(floor), TOWER_SECTIONS[0]);
});

void test('sections have distinct backgrounds and stable names for on-screen milestones', () => {
  assert.deepEqual(TOWER_SECTIONS.map(section => section.name), ['THE FORGOTTEN HALL', 'THE FROZEN BELFRY', 'CRYSTAL SPIRE', 'THE AURORA', 'THE GLACIER VAULT', 'THE STORMCROWN', 'STARFALL SUMMIT']);
  assert.equal(new Set(TOWER_SECTIONS.map(section => section.palette.background)).size, TOWER_SECTIONS.length);
  assert.equal(new Set(TOWER_SECTIONS.map(section => section.palette.windowHigh)).size, TOWER_SECTIONS.length);
  assert.equal(TOWER_SECTIONS[3].auroraStrength, 1);
  assert.equal(TOWER_SECTIONS.at(-1)!.auroraStrength, 1);
});

void test('every section has its own window sky and ambient particles', () => {
  for (const section of TOWER_SECTIONS) {
    for (const value of Object.values(section.sky)) assert.ok(value >= 0 && value <= 1);
    const { size, opacity, fall, density } = section.particles;
    assert.ok(size > 0 && size < .12 && opacity > 0 && opacity <= 1 && fall > 0 && density > 0 && density <= 1);
  }
  assert.equal(new Set(TOWER_SECTIONS.map(section => section.particles.color)).size, TOWER_SECTIONS.length);
  assert.deepEqual(TOWER_SECTIONS.filter(section => section.sky.storm > .5).map(section => section.id), ['stormcrown'], 'Lightning belongs to the Stormcrown only');
  const byId = Object.fromEntries(TOWER_SECTIONS.map(section => [section.id, section]));
  assert.equal(byId['starfall-summit'].sky.stars, 1);
  assert.equal(byId['crystal-spire'].sky.crystal, 1);
  assert.ok(byId.stormcrown.particles.fall > Math.max(...TOWER_SECTIONS.filter(section => section.id !== 'stormcrown').map(section => section.particles.fall)), 'The storm has the heaviest snowfall');
  assert.ok(Math.abs(byId.stormcrown.particles.wind) > 1, 'Storm snow is wind-driven');
});
