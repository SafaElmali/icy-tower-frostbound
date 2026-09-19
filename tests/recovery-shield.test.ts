import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Mesh,
  MeshBasicMaterial,
  ShaderMaterial,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import { RecoveryShield } from '../lib/recovery-shield.ts';

void test('the shield is one closed faceted volume with no detached ring and no degenerate faces', () => {
  const shield = new RecoveryShield();
  const shell = shield.group.getObjectByName('Frost shield shell') as Mesh<
    BufferGeometry,
    ShaderMaterial
  >;
  assert.equal(
    shield.group.children.filter(
      (child) =>
        child instanceof Mesh && child.material instanceof ShaderMaterial,
    ).length,
    1,
  );
  assert.equal(shield.group.getObjectByName('Shield outline'), undefined);
  assert.equal(shield.group.getObjectByName('Shield orbit'), undefined);
  const positions = shell.geometry.getAttribute('position');
  assert.ok(
    positions.count <= 500,
    'the shell stays small enough for four mobile climbers',
  );
  const edges = new Map<string, number>();
  for (let i = 0; i < positions.count; i += 3) {
    const vertices = [0, 1, 2].map((offset) =>
      new Vector3().fromBufferAttribute(positions, i + offset),
    );
    assert.ok(
      vertices[1]
        .clone()
        .sub(vertices[0])
        .cross(vertices[2].clone().sub(vertices[0]))
        .lengthSq() > 1e-8,
    );
    const keys = vertices.map((vertex) =>
      vertex
        .toArray()
        .map((value) => Math.round(value * 100_000) / 100_000)
        .join(','),
    );
    for (let edge = 0; edge < 3; edge++) {
      const key = [keys[edge], keys[(edge + 1) % 3]].sort().join('|');
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  assert.ok(
    [...edges.values()].every((count) => count === 2),
    'each edge joins exactly two faces',
  );
  shield.dispose();
});

void test('shield fades its shell and every accent together before protection expires', () => {
  const shield = new RecoveryShield();
  const shell = shield.group.getObjectByName('Frost shield shell') as Mesh<
    BufferGeometry,
    ShaderMaterial
  >;
  const shard = shield.group.getObjectByName('Shield ice shard 1') as Mesh<
    BufferGeometry,
    MeshBasicMaterial
  >;
  assert.equal(shield.group.visible, false);
  shield.update(1, 2, false);
  assert.equal(shield.group.visible, true);
  assert.equal(shell.material.uniforms.opacity.value, 1);
  const fullOpacity = shard.material.opacity;
  shield.update(0.2, 2, false);
  assert.equal(shell.material.uniforms.opacity.value, 0.5);
  assert.equal(shard.material.opacity, fullOpacity / 2);
  shield.update(0, 2, false);
  assert.equal(shield.group.visible, false);
  assert.equal(shell.material.uniforms.opacity.value, 0);
  shield.group.traverse((object) => {
    if (object instanceof Mesh && object.material instanceof MeshBasicMaterial)
      assert.equal(object.material.opacity, 0);
  });
  shield.update(-1, 3, false);
  assert.equal(shield.group.visible, false);
  assert.equal(shard.material.opacity, 0);
  shield.dispose();
});

void test('reduced motion freezes shield ornamentation while keeping the protective silhouette', () => {
  const shield = new RecoveryShield();
  shield.update(1, 2, true);
  const before = shield.group.toJSON();
  shield.update(1, 22, true);
  assert.deepEqual(shield.group.toJSON(), before);
  assert.equal(shield.group.visible, true);
  assert.deepEqual(shield.group.scale.toArray(), [1, 1, 1]);
  shield.update(1, 22, false);
  assert.notDeepEqual(
    shield.group.toJSON(),
    before,
    'Motion is restored when the preference is disabled',
  );
  shield.dispose();
});

void test('shield frames reuse all objects and dispose each shared resource exactly once', () => {
  const shield = new RecoveryShield();
  const resources = new Map<BufferGeometry | Material, number>();
  const objects: string[] = [];
  shield.group.traverse((object) => {
    objects.push(object.uuid);
    if (!(object instanceof Mesh)) return;
    for (const resource of [
      object.geometry,
      ...(Array.isArray(object.material) ? object.material : [object.material]),
    ]) {
      if (resources.has(resource)) continue;
      resources.set(resource, 0);
      resource.addEventListener('dispose', () =>
        resources.set(resource, resources.get(resource)! + 1),
      );
    }
  });
  for (let frame = 0; frame < 120; frame++)
    shield.update((frame % 20) / 10, frame / 60, frame % 2 === 0);
  const after: string[] = [];
  shield.group.traverse((object) => {
    after.push(object.uuid);
    if (object instanceof Mesh) {
      assert.ok(resources.has(object.geometry));
      assert.ok(resources.has(object.material));
    }
  });
  assert.deepEqual(after, objects);
  shield.dispose();
  shield.dispose();
  shield.update(1, 3, false);
  assert.equal(shield.group.visible, false);
  assert.equal(shield.group.children.length, 0);
  assert.ok([...resources.values()].every((count) => count === 1));
});
