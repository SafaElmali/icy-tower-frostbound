import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Box3, type Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ClimberMotion } from '../lib/climber-motion.ts';
import { TowerEngine, freshControls } from '../lib/tower-engine.ts';

void test('slow jumps stay upright; fast jumps spread into a full forward loop', () => {
  const motion = new ClimberMotion(); const state = { time: 10.34, grounded: false, status: 'playing' as const };
  motion.jump(5.9, 10); assert.deepEqual(motion.pose(state), { roll: 0, spread: 0 });
  motion.jump(8, 10); const middle = motion.pose(state);
  assert.ok(Math.abs(middle.roll + Math.PI) < 1e-8); assert.ok(middle.spread > .99);
  const end = motion.pose({ ...state, time: 10.67 }); assert.ok(end.roll < -6.27); assert.ok(end.spread < .05);
  assert.deepEqual(motion.pose({ ...state, time: 10.7 }), { roll: 0, spread: 0 });
});

void test('leftward jumps flip the other way and steering cannot reverse a loop midair', () => {
  const motion = new ClimberMotion(); motion.jump(-7, 2);
  const pose = motion.pose({ time: 2.34, grounded: false, status: 'playing' });
  assert.ok(Math.abs(pose.roll - Math.PI) < 1e-8);
});

void test('pause freezes the loop; landings and new runs restore the standing pose', () => {
  const motion = new ClimberMotion(); motion.jump(7, 5);
  const state = { time: 5.2, grounded: false, status: 'paused' as const };
  const pose = motion.pose(state); assert.notEqual(pose.roll, 0);
  for (let i = 0; i < 200; i++) assert.deepEqual(motion.pose(state), pose);
  assert.deepEqual(motion.pose({ ...state, grounded: true }), { roll: 0, spread: 0 });
  motion.jump(7, 5); assert.deepEqual(motion.pose({ ...state, time: 0, status: 'ready' }), { roll: 0, spread: 0 });
});

void test('a real running jump emits takeoff speed and finishes its flip before landing', () => {
  const engine = new TowerEngine(17); const motion = new ClimberMotion(); engine.start('practice');
  for (let i = 0; i < 40; i++) engine.tick(1 / 120, { left: false, right: true, jump: false });
  engine.tick(1 / 120, { left: false, right: true, jump: true });
  const jump = engine.drainEvents().find(e => e.type === 'jump'); assert.ok(jump); assert.ok(jump.value! >= 6);
  motion.jump(jump.value!, engine.time);
  let seenUpsideDown = false, uprightBeforeLanding = false;
  for (let i = 0; i < 240; i++) {
    engine.tick(1 / 120, freshControls()); const pose = motion.pose(engine);
    if (Math.abs(pose.roll) > 2.8 && Math.abs(pose.roll) < 3.5) seenUpsideDown = true;
    if (seenUpsideDown && pose.roll === 0 && !engine.grounded) uprightBeforeLanding = true;
    if (engine.grounded) break;
  }
  assert.ok(seenUpsideDown); assert.ok(uprightBeforeLanding); assert.equal(engine.grounded, true);
  assert.deepEqual(motion.pose(engine), { roll: 0, spread: 0 });
});

void test('the shipped Harold model opens all four limbs into a star and returns to standing', async () => {
  const bytes = await readFile(new URL('../public/assets/harold.glb', import.meta.url));
  const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const limbs = (names: string[]) => names.map(name => {
    const limb = scene.getObjectByName(name); assert.ok(limb, `Missing animated limb ${name}`); return limb;
  });
  const arms = limbs(['Arm_L', 'Arm_R']), legs = limbs(['Leg_L', 'Leg_R']);
  const motion = new ClimberMotion(), state = { time: 0, vx: 0, grounded: true };
  const bounds = (parts: Object3D[]) => parts.map(part => new Box3().setFromObject(part));
  motion.applyLimbs(state, 0, arms, legs);
  const standingArms = bounds(arms), standingLegs = bounds(legs);
  motion.applyLimbs({ ...state, grounded: false }, 1, arms, legs);
  const openArms = bounds(arms), openLegs = bounds(legs);
  assert.ok(openArms[0].min.x < standingArms[0].min.x - .15, 'Left hand extends outward');
  assert.ok(openArms[1].max.x > standingArms[1].max.x + .15, 'Right hand extends outward');
  for (let i = 0; i < 2; i++) assert.ok(openArms[i].max.y > standingArms[i].max.y + .2, 'Hands rise above shoulders');
  assert.ok(openLegs[0].min.x < standingLegs[0].min.x - .2, 'Left foot extends outward');
  assert.ok(openLegs[1].max.x > standingLegs[1].max.x + .2, 'Right foot extends outward');
  motion.applyLimbs(state, 0, arms, legs);
  for (const [i, bound] of bounds(legs).entries()) {
    assert.ok(bound.min.distanceTo(standingLegs[i].min) < 1e-8);
    assert.ok(bound.max.distanceTo(standingLegs[i].max) < 1e-8);
  }
});
