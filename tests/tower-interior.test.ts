import test from 'node:test';
import assert from 'node:assert/strict';
import { Color, DataTexture, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, ShaderMaterial, Vector3 } from 'three';
import { TowerInterior } from '../lib/tower-interior.ts';
import { TOWER_SECTIONS } from '../lib/tower-sections.ts';

void test('climbing recycles only distant architecture and falling restores the same world positions', () => {
  const interior = new TowerInterior(new DataTexture());
  const bays = interior.group.children.filter(child => child instanceof Group);
  const initial = bays.map(bay => bay.position.y);
  interior.update(17.99, 2, true); assert.deepEqual(bays.map(bay => bay.position.y), initial);
  interior.update(18.01, 3, true);
  assert.equal(bays.filter((bay, i) => bay.position.y !== initial[i]).length, 1);
  for (const height of [500, 10000, -30, 5.2]) {
    interior.update(height, 4, true);
    const positions = bays.map(bay => bay.position.y).sort((a, b) => a - b);
    assert.equal(positions.length, 7);
    assert.ok(positions[0] < height - 36 && positions.at(-1)! > height + 36);
    for (let i = 1; i < positions.length; i++) assert.equal(positions[i] - positions[i - 1], 18);
  }
  assert.deepEqual(bays.map(bay => bay.position.y), initial);
});

void test('section transitions smoothly recolor the same pooled architecture and shader resources', () => {
  const interior = new TowerInterior(new DataTexture());
  const meshes: Mesh[] = [];
  interior.group.traverse(object => { if (object instanceof Mesh) meshes.push(object); });
  const geometries = meshes.map(mesh => mesh.geometry);
  const materials = meshes.map(mesh => mesh.material);
  const stone = materials.find(material => material instanceof MeshStandardMaterial && material.color.getHex() === TOWER_SECTIONS[0].palette.stone) as MeshStandardMaterial;
  const window = materials.find(material => material instanceof ShaderMaterial && material.uniforms.aurora) as ShaderMaterial;
  assert.ok(stone); assert.ok(window);
  const warm = stone.color.clone();
  interior.update(80, 3, true, TOWER_SECTIONS[1], 1 / 60);
  assert.notDeepEqual(stone.color, warm);
  assert.notEqual(stone.color.getHex(), TOWER_SECTIONS[1].palette.stone, 'A milestone blends instead of flashing to a new palette');
  for (const section of TOWER_SECTIONS) {
    interior.update(section.startsAtFloor * 2, 4, true, section, 10);
    assert.equal(stone.color.getHex(), section.palette.stone);
    assert.ok(Math.abs(window.uniforms.aurora.value - section.auroraStrength) < 1e-10);
    assert.ok(window.uniforms.highColor.value instanceof Color);
    assert.equal(window.uniforms.highColor.value.getHex(), section.palette.windowHigh);
    assert.deepEqual(meshes.map(mesh => mesh.geometry), geometries);
    assert.deepEqual(meshes.map(mesh => mesh.material), materials);
  }
  const currentMeshes: Mesh[] = [];
  interior.group.traverse(object => { if (object instanceof Mesh) currentMeshes.push(object); });
  assert.deepEqual(currentMeshes, meshes, 'No section loads or allocates additional scenery');
});

void test('the interior uses shared 3D geometry without loading a background image', () => {
  const interior = new TowerInterior(new DataTexture()), geometries = new Set(); let meshes = 0;
  interior.group.traverse(object => {
    if (!(object instanceof Mesh)) return;
    meshes++; geometries.add(object.geometry);
    const positions = object.geometry.attributes.position;
    for (const value of positions.array) assert.ok(Number.isFinite(value));
  });
  assert.ok(meshes > 20 && geometries.size < 12, 'Bays share geometry instead of allocating a new tower on each climb');
  const camera = new PerspectiveCamera(34, 1.5, .1, 110); camera.position.set(0, 8, 26); camera.lookAt(0, 5, 0); camera.updateMatrixWorld();
  const front = new Vector3(3, 5, 0).project(camera), back = new Vector3(3, 5, -12).project(camera);
  assert.ok(front.x > back.x * 1.3, 'Background architecture has real perspective depth');
});
