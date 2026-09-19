import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Bone, BoxGeometry, Color, Group, Mesh, MeshStandardMaterial, Skeleton, SkinnedMesh } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { applyCharacterOutfit } from '../lib/character-outfit.ts';
import { cloneRaceCharacter } from '../lib/race-character.ts';
import { cosmeticFor, DEFAULT_OUTFIT } from '../lib/outfits.ts';
import { RaceRival } from '../lib/race-rival.ts';

function materials(character: Group) {
  const result = new Set<MeshStandardMaterial>();
  character.traverse(object => {
    if (!(object instanceof Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material instanceof MeshStandardMaterial) result.add(material);
    }
  });
  return [...result];
}

void test('three race opponents retain solid materials and independent outfits from the real climber', async () => {
  const bytes = await readFile(new URL('../public/assets/harold.glb', import.meta.url));
  const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  applyCharacterOutfit(scene, { ...DEFAULT_OUTFIT, hat: 'summit-beanie' });
  const original = new Map(materials(scene).map(material => [material, material.color.clone()]));
  const rivals = Array.from({ length: 3 }, () => cloneRaceCharacter(scene));
  const hats = ['frost-beanie', 'summit-beanie', 'blue-beanie'];
  const sweaters = ['berry-knit', 'aurora-knit', 'green-knit'];
  rivals.forEach((rival, index) => {
    applyCharacterOutfit(rival, { hat: hats[index], sweater: sweaters[index], trail: 'rainbow' });
    const own = materials(rival);
    for (const material of own) {
      assert.equal(material.opacity, 1);
      assert.equal(material.transparent, false);
      assert.equal(material.depthWrite, true);
      assert.ok(!original.has(material));
      for (const other of rivals.filter(other => other !== rival)) assert.ok(!materials(other).includes(material));
      if (material.userData.originalColor) assert.ok(material.userData.originalColor instanceof Color);
    }
    const hat = own.find(material => /beanie/i.test(material.name) && !/badge|ribs|trim|seams/i.test(material.name))!;
    const sweater = own.find(material => /sweatshirt/i.test(material.name) && !/trim|seams/i.test(material.name))!;
    assert.ok(hat); assert.ok(sweater);
    if (hats[index] !== DEFAULT_OUTFIT.hat) assert.equal(hat.color.getHex(), cosmeticFor('hat', hats[index]).colors[0]);
    else assert.ok(hat.color.equals(hat.userData.originalColor));
    if (sweaters[index] !== DEFAULT_OUTFIT.sweater) assert.equal(sweater.color.getHex(), cosmeticFor('sweater', sweaters[index]).colors[0]);
    else assert.ok(sweater.color.equals(sweater.userData.originalColor));
  });
  for (const [material, color] of original) assert.ok(material.color.equals(color), `${material.name} on the local player is unchanged`);
  const secondColors = materials(rivals[1]).map(material => material.color.clone());
  applyCharacterOutfit(rivals[0], DEFAULT_OUTFIT);
  materials(rivals[1]).forEach((material, index) => assert.ok(material.color.equals(secondColors[index])));
});

void test('race character cloning also isolates a skinned character skeleton', () => {
  const source = new Group();
  const bone = new Bone();
  const mesh = new SkinnedMesh(new BoxGeometry(), new MeshStandardMaterial());
  mesh.add(bone); mesh.bind(new Skeleton([bone])); source.add(mesh);
  const clone = cloneRaceCharacter(source);
  const copied = clone.children[0] as SkinnedMesh;
  assert.notEqual(copied.skeleton, mesh.skeleton);
  assert.notEqual(copied.skeleton.bones[0], bone);
  copied.skeleton.bones[0].rotation.z = 1;
  assert.equal(bone.rotation.z, 0);
});

void test('race rivals explicitly opt into player rendering without sharing default outfits', () => {
  const first = new RaceRival(), second = new RaceRival();
  assert.equal(first.appearance, 'player');
  assert.equal(first.name, '');
  assert.deepEqual(first.outfit, DEFAULT_OUTFIT);
  first.outfit.hat = 'frost-beanie';
  assert.deepEqual(second.outfit, DEFAULT_OUTFIT);
});
