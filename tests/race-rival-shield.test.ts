import test from 'node:test';
import assert from 'node:assert/strict';
import { RaceRival } from '../lib/race-rival.ts';
import { createRaceEngine, racePose, type RacePose } from '../lib/race-protocol.ts';

const pose = (time: number, shielded: boolean): RacePose => ({
  ...racePose(createRaceEngine(17)),
  time,
  frame: Math.round(time * 120),
  protected: shielded,
});

void test('rival shields follow new poses and same-frame result settlement', () => {
  const rival = new RaceRival();
  rival.receive(pose(1, true), 100, false, 'peer');
  assert.equal(rival.protected, true);
  rival.receive(pose(1, false), 150, false, 'http');
  assert.equal(rival.protected, false, 'a terminal pose need not advance the clock');
  rival.receive(pose(2, true), 200, false, 'peer');
  assert.equal(rival.protected, true);
  rival.receive(pose(3, true), 250, true, 'peer');
  assert.equal(rival.protected, false, 'a hidden rival has no shield');
});

void test('invalid and stale rival poses cannot change protection', () => {
  const rival = new RaceRival();
  rival.receive(pose(2, true), 100);
  rival.receive(pose(1, false), 150);
  rival.receive({ ...pose(3, false), x: Number.NaN }, 200);
  assert.equal(rival.protected, true);
  rival.receive(pose(3, false), 250);
  rival.receive(pose(2, true), 300);
  assert.equal(rival.protected, false);
});

void test('stalled poses and repeated HTTP frames cannot leave a shield behind', () => {
  const rival = new RaceRival();
  rival.receive(pose(1, true), 100, false, 'peer');
  rival.receive(pose(1, true), 1_500, false, 'http');
  rival.advance(1_749, .016);
  assert.equal(rival.protected, true);
  rival.advance(1_751, .016);
  assert.equal(rival.protected, false);
  rival.receive(pose(1, true), 2_000, false, 'http');
  assert.equal(rival.protected, false, 'an expired duplicate cannot restore the shield');
  rival.receive(pose(2, true), 2_050, false, 'peer');
  assert.equal(rival.protected, true, 'a new active pose can restore protection');
});

void test('respawn shield expires even if the checkpoint recovery packet never arrives', () => {
  const rival = new RaceRival();
  rival.receive({ ...pose(1, true), respawning: true }, 100);
  rival.advance(2_000, .016);
  assert.equal(rival.protected, true);
  rival.advance(2_651, .016);
  assert.equal(rival.protected, false);
});
