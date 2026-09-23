import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Group, InstancedMesh, Mesh, Vector3, type BufferGeometry, type Material } from 'three';
import { CRUMBLE_DELAY, freshTowerAction, ICICLE_WARNING_TIME, WRAITH_DASH_LENGTH, WRAITH_TELL_TIME, type FrostWraith } from '../lib/tower-action.ts';
import { TowerActionWorld } from '../lib/tower-action-world.ts';
import { createRaceEngine } from '../lib/race-protocol.ts';

function sceneState() {
  const state = { action: freshTowerAction(), x: 0, y: 10, time: 2, cameraY: 12, status: 'playing', rulesVersion: 7 };
  state.action.icicles.push({ id: 1, x: 0, y: 18, spawnY: 18, targetY: 10, state: 'warning', warningTime: ICICLE_WARNING_TIME, vy: 0, nearMiss: false });
  state.action.bats.push({ id: 1, x: 7.1, y: 12, originX: 7.1, originY: 12, phase: 0, alive: true, warningTime: .8 });
  state.action.crystals.push({ id: 1, x: 1, y: 12, collected: false });
  return state;
}

void test('recovery protection follows the climber and is hidden in the ready scene', () => {
  const world = new TowerActionWorld(), state = sceneState();
  state.action.invulnerableTime = 1; state.x = 2; state.y = 14;
  world.update(state, true);
  const shield = world.group.getObjectByName('Recovery shield')!;
  assert.equal(shield.visible, true); assert.deepEqual(shield.position.toArray(), [2, 14.78, .15]);
  state.status = 'ready'; world.update(state, true);
  assert.equal(shield.visible, false);
  state.status = 'playing'; state.action.invulnerableTime = 0; world.update(state, false);
  assert.equal(shield.visible, false);
  world.dispose();
});

void test('legacy danger cues stay visible in reduced motion and offstage bats warn inside the walls', () => {
  const world = new TowerActionWorld(), state = sceneState();
  world.update(state, true); world.group.updateMatrixWorld(true);
  const icicle = world.group.getObjectByName('Falling icicle')!;
  const target = icicle.getObjectByName('Icicle landing warning')!;
  const bat = world.group.getObjectByName('Frost bat')!;
  const warning = bat.getObjectByName('Bat approach warning')!;
  assert.ok(icicle.visible && target.visible && bat.visible && warning.visible);
  const warningPosition = warning.getWorldPosition(new Vector3());
  assert.equal(warningPosition.x, 5.5);
  const lane = icicle.children.find(child => child instanceof Mesh && child.scale.y === 8)!;
  assert.ok(lane?.visible, 'The entire falling lane remains marked without a shake or flash');
  const ice = icicle.children[0];
  assert.equal(ice.position.x, 0); assert.equal(ice.rotation.z, 0);
  const before = world.group.toJSON(); state.time += .25; world.update(state, true);
  assert.deepEqual(world.group.toJSON(), before, 'Reduced motion keeps visual danger static while its simulation timer is unchanged');
  state.action.icicles[0].state = 'falling'; state.action.icicles[0].y = 13;
  world.update(state, true);
  assert.equal(lane.visible, false); assert.equal(target.visible, true);
  assert.equal(ice.position.y, 3, 'The shard follows real simulation position during a fall');
  world.dispose();
});

void test('paused frenzy keeps its trail frozen and retry clears every stale action visual', () => {
  const world = new TowerActionWorld(), state = sceneState(); state.action.frenzyTime = 5; state.action.invulnerableTime = 1;
  world.update(state, false);
  state.time += .1; state.x += .5; world.update(state, false);
  const trail = world.group.getObjectByName('Frenzy crystal trail') as InstancedMesh;
  assert.ok(trail.count > 0);
  state.status = 'paused'; world.update(state, false);
  const before = Array.from(trail.instanceMatrix.array), count = trail.count;
  for (let i = 0; i < 10; i++) world.update(state, false);
  assert.deepEqual(Array.from(trail.instanceMatrix.array), before); assert.equal(trail.count, count);
  state.action = freshTowerAction(); state.time = 0; state.status = 'playing'; world.update(state, false);
  assert.equal(trail.count, 0);
  assert.equal(world.group.children.filter(child => child.visible && child !== trail).length, 0);
  world.dispose();
});

void test('current solo runs and multiplayer render hazards without landing lanes, countdowns, or bat spawn circles', () => {
  const world = new TowerActionWorld(), state = sceneState();
  const race = createRaceEngine(17);
  race.action = sceneState().action;
  // Reuse a legacy scene first to catch stale warning visibility after a restart.
  world.update(state, false);
  state.rulesVersion = 8;
  const icicle = world.group.getObjectByName('Falling icicle')!;
  const bat = world.group.getObjectByName('Frost bat')!;
  for (const scene of [state, race]) for (const reducedMotion of [false, true]) for (const phase of ['warning', 'falling'] as const) {
    scene.action.icicles[0].state = phase;
    world.update(scene, reducedMotion);
    assert.ok(icicle.visible && icicle.children[0].visible && bat.visible);
    assert.ok(icicle.children.slice(1).every(child => !child.visible), 'All lane, edge and target markers stay hidden');
    assert.equal(icicle.getObjectByName('Icicle landing warning')!.children.at(-1)!.visible, false);
    assert.equal(bat.getObjectByName('Bat approach warning')!.visible, false);
  }
  world.dispose();
});

void test('the visible icicle tip follows the collision tip through warning and falling', () => {
  const world = new TowerActionWorld(), state = sceneState();
  const icicle = state.action.icicles[0];
  const geometry = world.group.getObjectByName('Falling icicle')!.children[0];
  for (const reducedMotion of [false, true]) for (const phase of ['warning', 'falling'] as const) {
    icicle.state = phase; icicle.y = phase === 'warning' ? 18 : 11.45;
    world.update(state, reducedMotion); world.group.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(geometry, true);
    assert.ok(Math.abs(bounds.min.y - icicle.y) < 1e-8, 'The lowest rendered point must equal the swept collision point');
    assert.ok(bounds.max.y > icicle.y + 1.2, 'The body extends above the tip');
  }
  world.dispose();
});

void test('crumble countdown stays readable without motion and broken surfaces lose their decorations', () => {
  const world = new TowerActionWorld(), visual = world.makeCrumble(3.7);
  world.updateCrumble(visual, { remaining: null, broken: false }, 3.7, 0, true);
  assert.equal(visual.timer.visible, false); assert.equal(visual.cracks.visible, true);
  world.updateCrumble(visual, { remaining: .5, broken: false }, 3.7, 1, true);
  assert.equal(visual.timer.visible, true); assert.ok(visual.timer.scale.x > 0 && visual.timer.scale.x < 3.7 * .8);
  assert.ok(visual.chips.every(chip => !chip.visible));
  world.updateCrumble(visual, { remaining: 0, broken: true }, 3.7, 2, false);
  assert.equal(visual.group.visible, false); assert.ok(visual.chips.every(chip => !chip.visible));
  world.dispose();
});

void test('action rendering reuses its geometry and disposes shared ledge resources once', () => {
  const world = new TowerActionWorld(), state = sceneState();
  const geometryDisposals = new Map<BufferGeometry, number>(), materialDisposals = new Map<Material, number>();
  const capture = (mesh: Mesh) => {
    if (!geometryDisposals.has(mesh.geometry)) { geometryDisposals.set(mesh.geometry, 0); mesh.geometry.addEventListener('dispose', () => geometryDisposals.set(mesh.geometry, geometryDisposals.get(mesh.geometry)! + 1)); }
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!materialDisposals.has(material)) { materialDisposals.set(material, 0); material.addEventListener('dispose', () => materialDisposals.set(material, materialDisposals.get(material)! + 1)); }
    }
  };
  world.group.traverse(object => { if (object instanceof Mesh) capture(object); });
  const childCount = world.group.children.length, initialGeometryCount = geometryDisposals.size;
  for (let i = 0; i < 120; i++) { state.time += .1; state.action.icicles[0].id++; world.update(state, false); }
  const crumble = world.makeCrumble(3.7); crumble.group.traverse(object => { if (object instanceof Mesh) capture(object); });
  assert.equal(world.group.children.length, childCount);
  assert.equal(geometryDisposals.size, initialGeometryCount, 'Crumbling platforms also use the shared geometry pool');
  world.dispose(); world.dispose();
  assert.ok([...geometryDisposals.values()].every(count => count === 1));
  assert.ok([...materialDisposals.values()].every(count => count === 1));
});

const wraithScene = (state: FrostWraith['state'], time = 0) => {
  const scene = sceneState(); scene.rulesVersion = 9; scene.action.icicles = []; scene.action.bats = [];
  scene.action.wraiths.push({ id: 7, x: 3, y: 13, side: 1, state, time, dirX: -.8, dirY: -.6, startX: 3, startY: 13, alive: true });
  return scene;
};

void test('the wraith tell draws its whole locked dash line, filling toward the dash, even in reduced motion', () => {
  const world = new TowerActionWorld();
  const wraith = world.group.getObjectByName('Frost wraith')!, line = world.group.getObjectByName('Wraith dash line')!;
  world.update(wraithScene('drift'), false);
  assert.ok(wraith.visible); assert.equal(line.visible, false, 'drifting never shows the attack line');
  const lit = () => line.children.filter(child => child instanceof Mesh && (child.material as Material).opacity === 1).length;
  for (const reducedMotion of [false, true]) {
    world.update(wraithScene('tell', WRAITH_TELL_TIME * .25), reducedMotion);
    assert.ok(line.visible);
    assert.deepEqual(line.position.toArray(), [3, 13, 0]);
    assert.ok(Math.abs(line.rotation.z - Math.atan2(-.6, -.8)) < 1e-9, 'the line points along the locked direction');
    const early = lit();
    world.update(wraithScene('tell', WRAITH_TELL_TIME * .95), reducedMotion);
    assert.ok(lit() > early, 'the line fills as the dash approaches');
    line.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(line, true), tip = new Vector3(3 - .8 * WRAITH_DASH_LENGTH, 13 - .6 * WRAITH_DASH_LENGTH, .6);
    assert.ok(bounds.expandByScalar(.3).containsPoint(tip), 'the drawn path reaches the end of the dash');
  }
  world.update(wraithScene('fade'), false);
  assert.equal(line.visible, false);
  const race = createRaceEngine(17); world.update(race, false);
  assert.equal(wraith.visible, false);
  world.dispose();
});

void test('stomped bats pop after leaving the simulation, and reduced motion removes them at once', () => {
  for (const reducedMotion of [false, true]) {
    const world = new TowerActionWorld(), state = sceneState(); state.rulesVersion = 9; state.action.icicles = [];
    const bat = state.action.bats[0]; bat.x = 1; bat.warningTime = 0;
    world.update(state, reducedMotion);
    const visual = world.group.getObjectByName('Frost bat')!;
    world.effect({ type: 'stomp', x: 1, y: 12.35, value: 350 }, state.time);
    state.action.bats = []; state.time += .1; world.update(state, reducedMotion);
    assert.equal(visual.visible, !reducedMotion, 'the pop outlives the simulated bat only with motion');
    assert.equal(world.group.getObjectByName('Hazard burst particles')!.visible, !reducedMotion);
    state.time += .5; world.update(state, reducedMotion);
    assert.equal(visual.visible, false);
    world.dispose();
  }
});

void test('ice shatters, near misses sparkle, and cracked ledges spread then drop debris', () => {
  const world = new TowerActionWorld(), state = sceneState(); state.action.icicles = []; state.action.bats = [];
  world.update(state, false);
  world.effect({ type: 'icicle-shatter', x: 0, y: 10 }, state.time);
  world.effect({ type: 'dodge', x: 0, y: 10, value: 75 }, state.time);
  state.time += .05; world.update(state, false);
  const particles = world.group.getObjectByName('Hazard burst particles') as InstancedMesh;
  assert.ok(particles.visible && particles.count >= 20);
  state.time += 2; world.update(state, false);
  assert.equal(particles.visible, false, 'bursts expire');

  const ledge = new Group(); ledge.position.set(2, 20, 0); world.group.add(ledge);
  const visual = world.makeCrumble(3); ledge.add(visual.group);
  world.updateCrumble(visual, { remaining: null, broken: false }, 3, state.time, false);
  assert.ok(visual.spread.every(stage => !stage.visible), 'unarmed cracks do not spread');
  world.updateCrumble(visual, { remaining: CRUMBLE_DELAY * .1, broken: false }, 3, state.time, true);
  assert.ok(visual.spread.every(stage => stage.visible), 'nearly broken ice shows every fissure, steady in reduced motion');
  world.updateCrumble(visual, { remaining: 0, broken: true }, 3, state.time, false);
  state.time += .05; world.update(state, false);
  const debris = world.group.getObjectByName('Collapsed ledge debris') as InstancedMesh;
  assert.ok(debris.visible && debris.count > 0);
  ledge.removeFromParent();
  world.dispose();
});
