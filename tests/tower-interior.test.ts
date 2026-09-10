import test from 'node:test';
import assert from 'node:assert/strict';
import { DataTexture, Group, Mesh, PerspectiveCamera, Vector3 } from 'three';
import { TowerInterior } from '../lib/tower-interior.ts';

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
