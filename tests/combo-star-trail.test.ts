import test from 'node:test';
import assert from 'node:assert/strict';
import { Color, Matrix4, Vector3 } from 'three';
import { ComboStarTrail } from '../lib/combo-star-trail.ts';

type State = Parameters<ComboStarTrail['update']>[0];
const state = (): State => ({ x: 0, y: 5, vx: 8, vy: 4, time: 0, combo: 3, comboTime: 3, grounded: false, status: 'playing' });
function random() {
  let seed = 17;
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
function fly(trail: ComboStarTrail, player: State, seconds: number, fps = 60) {
  for (let i = 0; i < Math.round(seconds * fps); i++) {
    player.time += 1 / fps; player.x += player.vx / fps; player.y += player.vy / fps; trail.update(player);
  }
}
function matrix(trail: ComboStarTrail, i = 0) {
  const value = new Matrix4(); trail.mesh.getMatrixAt(i, value); return value;
}

void test('an airborne combo leaves multicolored stars behind the character', () => {
  const trail = new ComboStarTrail(random()), player = state(); trail.update(player); fly(trail, player, .5);
  assert.ok(trail.mesh.count > 10);
  const colors = new Set<string>();
  for (let i = 0; i < trail.mesh.count; i++) {
    const position = new Vector3().setFromMatrixPosition(matrix(trail, i));
    assert.ok(position.x < player.x); assert.ok(position.z < 0, 'Stars render behind Harold');
    const color = new Color(); trail.mesh.getColorAt(i, color); colors.add(color.getHexString());
  }
  assert.ok(colors.size >= 3); trail.dispose();
});

void test('ordinary jumps, expired combos, and standing still produce no trail', () => {
  for (const change of [{ combo: 0 }, { comboTime: 0 }, { grounded: true }]) {
    const trail = new ComboStarTrail(random()), player = { ...state(), ...change };
    trail.update(player); fly(trail, player, .5); assert.equal(trail.mesh.count, 0); trail.dispose();
  }
});

void test('stars stay on the traveled path, shrink, and expire after the combo ends', () => {
  const trail = new ComboStarTrail(random()), player = state(); trail.update(player); fly(trail, player, .5);
  const before = matrix(trail), previousCount = trail.mesh.count;
  player.comboTime = 0; player.x += 30; player.time += .1; trail.update(player);
  const after = matrix(trail);
  assert.equal(trail.mesh.count, previousCount);
  assert.ok(new Vector3().setFromMatrixPosition(before).distanceTo(new Vector3().setFromMatrixPosition(after)) < .2);
  assert.ok(new Vector3().setFromMatrixScale(after).x < new Vector3().setFromMatrixScale(before).x);
  fly(trail, player, 1.2); assert.equal(trail.mesh.count, 0); trail.dispose();
});

void test('pausing freezes existing stars and resuming continues emission', () => {
  const trail = new ComboStarTrail(random()), player = state(); trail.update(player); fly(trail, player, .5);
  const count = trail.mesh.count, frozen = [...trail.mesh.instanceMatrix.array];
  player.status = 'paused'; for (let i = 0; i < 120; i++) trail.update(player);
  assert.equal(trail.mesh.count, count); assert.deepEqual([...trail.mesh.instanceMatrix.array], frozen);
  player.status = 'playing'; fly(trail, player, .1); assert.ok(trail.mesh.count > count); trail.dispose();
});

void test('new games and game over remove all leftover stars', () => {
  for (const change of [{ status: 'ready' as const }, { status: 'over' as const }, { time: 0 }]) {
    const trail = new ComboStarTrail(random()), player = state(); trail.update(player); fly(trail, player, .5);
    assert.ok(trail.mesh.count > 0); Object.assign(player, change); trail.update(player);
    assert.equal(trail.mesh.count, 0); trail.dispose();
  }
});

void test('the trail stays bounded and follows the same path at 30, 60, and 120 fps', () => {
  const trails = [30, 60, 120].map(fps => {
    const trail = new ComboStarTrail(random()), player = state(); trail.update(player); fly(trail, player, 10, fps); return trail;
  });
  assert.ok(trails[0].mesh.count > 0 && trails[0].mesh.count < 96);
  for (const trail of trails.slice(1)) {
    assert.equal(trail.mesh.count, trails[0].mesh.count);
    for (let i = 0; i < trail.mesh.count; i++) {
      const expected = matrix(trails[0], i).elements, actual = matrix(trail, i).elements;
      assert.ok(actual.every((value, j) => Math.abs(value - expected[j]) < 1e-5));
    }
  }
  trails.forEach(trail => trail.dispose());
});

void test('equipped palettes color emitted stars and changing palettes clears old colors', () => {
  const trail = new ComboStarTrail(random()), player = state();
  trail.setPalette([0x68daff]); trail.update(player); fly(trail, player, .5);
  assert.ok(trail.mesh.count > 0);
  const expected = new Color(0x68daff).multiplyScalar(1.45);
  for (let i = 0; i < trail.mesh.count; i++) {
    const color = new Color(); trail.mesh.getColorAt(i, color);
    assert.ok(Math.abs(color.r - expected.r) < 1e-6 && Math.abs(color.g - expected.g) < 1e-6 && Math.abs(color.b - expected.b) < 1e-6);
  }
  trail.setPalette([]); assert.equal(trail.mesh.count, 0);
  fly(trail, player, .5);
  const colors = new Set<string>();
  for (let i = 0; i < trail.mesh.count; i++) { const color = new Color(); trail.mesh.getColorAt(i, color); colors.add(color.getHexString()); }
  assert.ok(colors.size >= 3); trail.dispose();
});
