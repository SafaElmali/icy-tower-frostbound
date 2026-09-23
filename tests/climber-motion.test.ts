import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Box3, type Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ClimberMotion } from '../lib/climber-motion.ts';
import { TowerEngine, WALL, freshControls } from '../lib/tower-engine.ts';

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

void test('stationary double jumps spin in the facing direction and still allow only one boost', () => {
  for (const facing of [-1, 1]) {
    const engine = new TowerEngine(17), motion = new ClimberMotion(); engine.start('party');
    engine.platforms = [engine.platforms[0]];
    engine.tick(1 / 120, { ...freshControls(), jump: true });
    for (let i = 0; i < 20; i++) engine.tick(1 / 120, freshControls());
    engine.drainEvents(); engine.facing = facing; engine.doubleJumpTime = 5;
    engine.tick(1 / 120, { ...freshControls(), jump: true });
    const jump = engine.drainEvents().find(event => event.type === 'jump'); assert.ok(jump);
    assert.equal(jump.value, 0); assert.equal(jump.spinDirection, facing);
    motion.event(jump, engine.time);
    assert.ok(Math.abs(motion.pose({ time: engine.time + .34, grounded: engine.grounded, status: engine.status }).roll + facing * Math.PI) < 1e-8);
    engine.tick(1 / 120, freshControls()); engine.tick(1 / 120, { ...freshControls(), jump: true });
    assert.equal(engine.drainEvents().some(event => event.type === 'jump'), false);
  }
});

void test('manual wall jumps and low-speed airborne wall rebounds start spins away from either wall', () => {
  for (const side of [-1, 1]) for (const manual of [false, true]) {
    const engine = new TowerEngine(17), motion = new ClimberMotion(); engine.start('practice');
    engine.platforms = [engine.platforms[0]];
    engine.tick(1 / 120, { ...freshControls(), jump: true });
    for (let i = 0; i < 20; i++) engine.tick(1 / 120, freshControls());
    engine.drainEvents(); engine.x = side * (WALL - .29); engine.vx = manual ? 0 : side * 4.5;
    engine.tick(1 / 120, { ...freshControls(), jump: manual });
    const events = engine.drainEvents(), spin = events.find(event => event.spinDirection !== undefined);
    assert.ok(spin); assert.equal(spin.type, manual ? 'jump' : 'wall'); assert.equal(spin.spinDirection, -side);
    for (const event of events) motion.event(event, engine.time);
    assert.ok(Math.abs(motion.pose({ time: engine.time + .34, grounded: engine.grounded, status: engine.status }).roll - side * Math.PI) < 1e-8);
  }
});

void test('a grounded wall rebound stays upright', () => {
  const engine = new TowerEngine(17), motion = new ClimberMotion(); engine.start('practice');
  engine.x = WALL - .29; engine.vx = 5;
  engine.tick(1 / 120, freshControls());
  const wall = engine.drainEvents().find(event => event.type === 'wall'); assert.ok(wall);
  assert.equal(wall.spinDirection, undefined); motion.event(wall, engine.time);
  assert.deepEqual(motion.pose({ time: engine.time + .34, grounded: engine.grounded, status: engine.status }), { roll: 0, spread: 0 });
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

const air = (time: number, vy = -12) => ({ time, grounded: false, vx: 0, vy, status: 'playing' as const, facing: 1 });
const ground = (time: number, vx = 0) => ({ time, grounded: true, vx, vy: 0, status: 'playing' as const, facing: 1 });

void test('takeoff crouches then stretches; landings squash from the grounded flag alone, like race rivals', () => {
  const motion = new ClimberMotion();
  motion.body(ground(1));
  motion.jump(3, 1);
  assert.ok(motion.body(air(1.005, 12)).scaleY < .85, 'push-off crouch');
  assert.ok(motion.body(air(1.09, 12)).scaleY > 1.1, 'springy stretch');
  // No land event: a rival only reports grounded state.
  for (let time = 1.2; time < 1.8; time += 1 / 60) motion.body(air(time, -18));
  const impact = motion.body(ground(1.8));
  assert.ok(impact.scaleY < .75, `deep landing squash ${impact.scaleY}`);
  assert.ok(impact.scaleX > 1.1, 'squash keeps volume');
  const rebound = motion.body(ground(1.8 + Math.PI / 17));
  assert.ok(rebound.scaleY > 1, 'rebounds past upright');
  const settled = motion.body(ground(3));
  assert.ok(Math.abs(settled.scaleY - 1) < .02, 'settles into gentle breathing');
});

void test('reduced motion, the menu and pauses hold the body still', () => {
  const motion = new ClimberMotion();
  motion.body(air(1)); motion.jump(4, 1);
  assert.deepEqual(motion.body(ground(1.1), true), { scaleX: 1, scaleY: 1, scaleZ: 1, lift: 0, lean: 0 });
  assert.deepEqual(motion.body({ ...ground(0), status: 'ready' }), { scaleX: 1, scaleY: 1, scaleZ: 1, lift: 0, lean: 0 });
  motion.body(air(2)); const paused = motion.body({ ...ground(2.05), status: 'paused' });
  for (let i = 0; i < 20; i++) assert.deepEqual(motion.body({ ...ground(2.05), status: 'paused' }), paused);
});

void test('hurt flinch, wall kick and combo milestones pose the limbs and then return to normal', () => {
  const limb = () => ({ rotation: { x: 0, y: 0, z: 0 } }) as unknown as Object3D;
  const arms = [limb(), limb()], legs = [limb(), limb()], motion = new ClimberMotion();
  motion.event({ type: 'hurt', x: 0, y: 0 }, 5);
  motion.applyLimbs({ time: 5.15, grounded: false, vx: 0 }, 0, arms, legs);
  assert.ok(arms.every(arm => arm.rotation.x < -1.8), 'arms guard the face');
  assert.ok(motion.body(air(5.05)).lean > .2, 'recoils backward');
  motion.applyLimbs({ time: 5.15, grounded: false, vx: 0 }, 0, arms, legs, true);
  assert.ok(arms.every(arm => Math.abs(arm.rotation.x + .5) < 1e-9), 'reduced motion skips reaction poses');
  motion.event({ type: 'wall', x: 6.1, y: 0 }, 8);
  assert.ok(motion.body(air(8.02)).lean > .1, 'tips away from the right wall');
  motion.applyLimbs({ time: 8.08, grounded: false, vx: -5 }, 0, arms, legs);
  assert.ok(legs[0].rotation.x > .5, 'one leg pushes off');
  // 3× and 4× are not milestones; jumping from 4× to 6× crosses 5×.
  motion.event({ type: 'combo', x: 0, y: 0, value: 3 }, 10);
  motion.event({ type: 'combo', x: 0, y: 0, value: 4 }, 10.5);
  motion.applyLimbs({ time: 10.7, grounded: true, vx: 0 }, 0, arms, legs);
  assert.ok(arms.every(arm => Math.abs(arm.rotation.z) < .5));
  motion.event({ type: 'combo', x: 0, y: 0, value: 6 }, 11);
  motion.applyLimbs({ time: 11.3, grounded: true, vx: 0 }, 0, arms, legs);
  assert.ok(arms.every(arm => Math.abs(arm.rotation.z) > 2), 'arms up in a V');
  motion.applyLimbs({ time: 13, grounded: true, vx: 0 }, 0, arms, legs);
  assert.ok(arms.every(arm => Math.abs(arm.rotation.z) < .1), 'back to standing');
});
