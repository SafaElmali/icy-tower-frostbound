import test from 'node:test';
import assert from 'node:assert/strict';
import { FrenzyRhythm } from '../lib/frenzy-rhythm.ts';

void test('frenzy rhythm follows simulation time and emits at most one current beat', () => {
  const rhythm = new FrenzyRhythm();
  assert.equal(rhythm.observe(0, true), null);
  assert.equal(rhythm.observe(0.29, true), null);
  assert.equal(rhythm.observe(0.3, true), 1);
  assert.equal(rhythm.observe(0.3, true), null);
  assert.equal(rhythm.observe(3, true), 2);
  assert.equal(rhythm.observe(3, true), null);
});

void test('pause, mute, and frenzy ending discard the clock with no resumption backlog', () => {
  const rhythm = new FrenzyRhythm();
  rhythm.observe(10, true);
  assert.equal(rhythm.observe(10.2, true), 2);
  assert.equal(rhythm.observe(10.2, false), null);
  assert.equal(rhythm.observe(16, false), null);
  assert.equal(rhythm.observe(16, true), null);
  assert.equal(rhythm.observe(16.2, true), 6);
  assert.equal(rhythm.observe(0, true), null);
  assert.equal(rhythm.observe(0.3, true), 1);
});
