import test from 'node:test';
import assert from 'node:assert/strict';
import { Mesh, MeshBasicMaterial, ShaderMaterial, type BufferGeometry, type Material } from 'three';
import { RecoveryShield } from '../lib/recovery-shield.ts';

void test('shield fades its shell and every accent together before protection expires', () => {
  const shield = new RecoveryShield();
  const shell = shield.group.getObjectByName('Frost shield shell') as Mesh<BufferGeometry, ShaderMaterial>;
  const outline = shield.group.getObjectByName('Shield outline') as Mesh<BufferGeometry, MeshBasicMaterial>;
  assert.equal(shield.group.visible, false);
  shield.update(1, 2, false);
  assert.equal(shield.group.visible, true); assert.equal(shell.material.uniforms.opacity.value, 1);
  const fullOpacity = outline.material.opacity;
  shield.update(.2, 2, false);
  assert.equal(shell.material.uniforms.opacity.value, .5);
  assert.equal(outline.material.opacity, fullOpacity / 2);
  shield.update(0, 2, false);
  assert.equal(shield.group.visible, false); assert.equal(shell.material.uniforms.opacity.value, 0);
  shield.group.traverse(object => {
    if (object instanceof Mesh && object.material instanceof MeshBasicMaterial) assert.equal(object.material.opacity, 0);
  });
  shield.update(-1, 3, false);
  assert.equal(shield.group.visible, false); assert.equal(outline.material.opacity, 0);
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
  assert.notDeepEqual(shield.group.toJSON(), before, 'Motion is restored when the preference is disabled');
  shield.dispose();
});

void test('shield frames reuse all objects and dispose each shared resource exactly once', () => {
  const shield = new RecoveryShield();
  const resources = new Map<BufferGeometry | Material, number>();
  const objects: string[] = [];
  shield.group.traverse(object => {
    objects.push(object.uuid);
    if (!(object instanceof Mesh)) return;
    for (const resource of [object.geometry, ...(Array.isArray(object.material) ? object.material : [object.material])]) {
      if (resources.has(resource)) continue;
      resources.set(resource, 0);
      resource.addEventListener('dispose', () => resources.set(resource, resources.get(resource)! + 1));
    }
  });
  for (let frame = 0; frame < 120; frame++) shield.update(frame % 20 / 10, frame / 60, frame % 2 === 0);
  const after: string[] = [];
  shield.group.traverse(object => {
    after.push(object.uuid);
    if (object instanceof Mesh) {
      assert.ok(resources.has(object.geometry));
      assert.ok(resources.has(object.material));
    }
  });
  assert.deepEqual(after, objects);
  shield.dispose(); shield.dispose(); shield.update(1, 3, false);
  assert.equal(shield.group.visible, false); assert.equal(shield.group.children.length, 0);
  assert.ok([...resources.values()].every(count => count === 1));
});
