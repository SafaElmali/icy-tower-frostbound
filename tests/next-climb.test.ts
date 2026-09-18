import test from 'node:test';
import assert from 'node:assert/strict';
import { getNextClimb, type NextClimbInput } from '../lib/next-climb.ts';
import {
  readSkillProgress,
  advanceSkillProgress,
  selectSkillGoal,
  SKILL_GOALS,
} from '../lib/skill-goals.ts';

function input(floor = 0): NextClimbInput {
  return {
    snapshot: {
      status: 'over',
      mode: 'arcade',
      floor,
      gems: 0,
      bestCombo: 0,
      wallJumps: 0,
      failureEvidence: null,
    },
    baseline: { mode: 'arcade', floor: 0, bestCombo: 0, wallJumps: 0 },
    skills: readSkillProgress(null),
  };
}

void test('first attempts offer reachable landing targets without awarding airborne or partial skills', () => {
  for (const [floor, target] of [
    [0, 1],
    [1, 3],
    [2, 3],
    [3, 5],
    [4, 5],
  ]) {
    const data = input(floor);
    const goal = getNextClimb(data)!;
    assert.equal(goal.progress[0].target, target);
    assert.equal(goal.progress[0].value, floor);
    assert.equal(goal.note, 'First skill milestone: reach floor 5.');
    assert.deepEqual(data.skills.completed, []);
  }
});

void test('prior floor progress is mode-specific and a retry does not erase the next milestone', () => {
  const data = input();
  data.baseline = { ...data.baseline, floor: 3 };
  assert.equal(getNextClimb(data)?.title, 'Reach floor 5');
  data.baseline = { ...data.baseline, mode: 'practice', floor: 100 };
  assert.equal(getNextClimb(data)?.title, 'Reach floor 1');
});

void test('uses the chosen available skill and moves on when the attempt completes it', () => {
  const data = input(6);
  data.skills = selectSkillGoal(
    advanceSkillProgress(data.skills, data.snapshot),
    'wall-1',
  );
  assert.equal(getNextClimb(data)?.title, 'Perform one wall rebound');
  data.snapshot.wallJumps = 1;
  assert.equal(getNextClimb(data)?.title, 'Collect one crystal');
  assert.match(getNextClimb(data)!.note, /^2 skill milestones/);
  assert.deepEqual(data.skills.completed, ['floor-5']);
});

void test('shared challenge stays actionable until beaten and daily retries explain layout persistence', () => {
  const data = { ...input(5), challengeFloor: 10, daily: true };
  assert.equal(getNextClimb(data)?.title, 'Beat the challenge: floor 11');
  assert.match(getNextClimb(data)!.note, /same layout/);
  data.snapshot.floor = 11;
  assert.equal(getNextClimb(data)?.title, 'Collect one crystal');
});

void test('mastered players get a near checkpoint after a rough attempt and a new record target after a best', () => {
  const data = input(8);
  data.skills = {
    version: 1,
    completed: SKILL_GOALS.map((goal) => goal.id),
    featuredId: null,
  };
  data.baseline = { ...data.baseline, floor: 100 };
  assert.equal(getNextClimb(data)?.title, 'Next checkpoint: floor 10');
  data.snapshot.floor = 101;
  assert.equal(getNextClimb(data)?.title, 'Set a new best: floor 102');
});

void test('tips use recorded failure evidence and incomplete attempts do not show a result', () => {
  const data = input();
  assert.match(getNextClimb(data)!.tip, /Hold a direction and tap jump/);
  data.snapshot.failureEvidence = { kind: 'left-ledge', floor: 0 };
  assert.match(getNextClimb(data)!.tip, /jump before reaching the edge/);
  data.snapshot.status = 'playing';
  assert.equal(getNextClimb(data), null);
});
