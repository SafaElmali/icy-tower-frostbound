import test from 'node:test';
import assert from 'node:assert/strict';
import { ComboFeedbackTracker, COMBO_MILESTONES, comboMilestoneLabel } from '../lib/combo-feedback.ts';

void test('each milestone plays once per live combo chain, never for ordinary landings', () => {
  const tracker = new ComboFeedbackTracker();
  const emitted = [];
  for (let combo = 1; combo <= 25; combo++) {
    const cue = tracker.observe(combo, 3.8);
    if (cue !== null) emitted.push(cue);
    assert.equal(tracker.observe(combo, 3.7), null);
  }
  assert.deepEqual(emitted, COMBO_MILESTONES);
});

void test('large jumps emit only the highest crossing and do not queue skipped cues', () => {
  const tracker = new ComboFeedbackTracker();
  assert.equal(tracker.observe(2, 3.8), null);
  assert.equal(tracker.observe(12, 3.8), 10);
  assert.equal(tracker.observe(14, 3.8), null);
  assert.equal(tracker.observe(20, 3.8), 15);
  assert.equal(tracker.observe(20, 3.7), null);
});

void test('expiration rearms milestones including when count briefly remains stale', () => {
  const tracker = new ComboFeedbackTracker();
  assert.equal(tracker.observe(5, 3.8), 5);
  assert.equal(tracker.observe(5, 0), null);
  assert.equal(tracker.observe(3, 3.8), 3);
  assert.equal(tracker.observe(5, 3.8), 5);
  assert.equal(tracker.observe(0, 0), null);
  assert.equal(tracker.observe(5, 3.8), 5);
});

void test('pause or repeated snapshots do not replay cues or expire the simulation chain', () => {
  const tracker = new ComboFeedbackTracker();
  assert.equal(tracker.observe(3, 3.8), 3);
  for (let frame = 0; frame < 300; frame++) assert.equal(tracker.observe(3, 2), null);
  assert.equal(tracker.observe(5, 3.8), 5);
});

void test('a run reset and a decreasing count both start fresh chains', () => {
  const tracker = new ComboFeedbackTracker();
  assert.equal(tracker.observe(15, 3.8), 15);
  tracker.reset();
  assert.equal(tracker.observe(15, 3.8), 15);
  assert.equal(tracker.observe(3, 3.8), 3);
});

void test('observing while muted consumes crossings without a backlog when unmuted', () => {
  const tracker = new ComboFeedbackTracker();
  // Muted consumers discard the sound, while the visual cue can still be shown.
  tracker.observe(3, 3.8);
  tracker.observe(10, 3.8);
  assert.equal(tracker.observe(10, 3), null);
  assert.equal(tracker.observe(12, 3.8), null);
  assert.equal(tracker.observe(15, 3.8), 15);
});

void test('every milestone has distinct visual feedback usable without sound or motion', () => {
  assert.equal(new Set(COMBO_MILESTONES.map(comboMilestoneLabel)).size, COMBO_MILESTONES.length);
  const tracker = new ComboFeedbackTracker();
  assert.equal(tracker.observe(Number.NaN, 3.8), null);
  assert.equal(tracker.observe(3, Number.POSITIVE_INFINITY), null);
  assert.equal(tracker.observe(3, 3.8), 3);
});
