import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, type Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { animateAccessories } from '../lib/character-accessories.ts';
import { applyCharacterOutfit, tagCharacterParts } from '../lib/character-outfit.ts';
import { COSMETICS, DEFAULT_OUTFIT } from '../lib/outfits.ts';

async function harold() {
  const bytes = await readFile(new URL('../public/assets/harold.glb', import.meta.url));
  return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
}
const accessories = (root: Object3D) => { const found: Object3D[] = []; root.traverse(object => { if (object.userData.accessorySlot) found.push(object); }); return found; };
const beanies = (root: Object3D) => { const found: Mesh[] = []; root.traverse(object => { if (object instanceof Mesh && object.userData.hatShell) found.push(object); }); return found; };

void test('the real climber previews every clothing color and restores the original materials', async () => {
  const scene = await harold();
  const materials = new Set<MeshStandardMaterial>();
  scene.traverse(object => {
    if (!(object instanceof Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material instanceof MeshStandardMaterial) materials.add(material);
    }
  });
  const original = new Map([...materials].map(material => [material, material.color.clone()]));
  const hat = [...materials].find(material => /beanie/i.test(material.name) && !/badge|ribs|trim|seams/i.test(material.name));
  const sweater = [...materials].find(material => /sweatshirt/i.test(material.name) && !/trim|seams/i.test(material.name));
  assert.ok(hat); assert.ok(sweater);
  for (const item of COSMETICS.filter(item => item.target > 0 && (item.slot === 'hat' || item.slot === 'sweater'))) {
    applyCharacterOutfit(scene, { ...DEFAULT_OUTFIT, [item.slot]: item.id });
    assert.equal((item.slot === 'hat' ? hat : sweater).color.getHex(), item.colors[0]);
    const untouched = item.slot === 'hat' ? sweater : hat;
    assert.ok(untouched.color.equals(original.get(untouched)!));
  }
  applyCharacterOutfit(scene, { ...DEFAULT_OUTFIT, trail: 'sunset' });
  for (const [material, color] of original) assert.ok(material.color.equals(color), `${material.name} restores exactly`);
  applyCharacterOutfit(scene, { hat: 'invalid', sweater: 'invalid', trail: 'invalid' });
  for (const [material, color] of original) assert.ok(material.color.equals(color));
});

void test('hat shapes replace the beanie and every re-dress swaps attachments instead of stacking them', async () => {
  const scene = await harold();
  tagCharacterParts(scene);
  assert.ok(beanies(scene).length >= 2, 'beanie and ribs are tagged by structure');
  const body = scene.getObjectByName('Body')!;
  applyCharacterOutfit(scene, { ...DEFAULT_OUTFIT, hat: 'summit-beanie', accessory: 'royal-cape' });
  assert.deepEqual(accessories(scene).map(object => String(object.userData.accessorySlot)).sort((a, b) => a.localeCompare(b)), ['accessory', 'hat']);
  assert.ok(accessories(scene).every(object => object.parent === body), 'attachments ride the animated body');
  assert.ok(beanies(scene).every(mesh => !mesh.visible), 'the crown hides the beanie');
  applyCharacterOutfit(scene, { ...DEFAULT_OUTFIT, hat: 'frost-beanie' });
  assert.deepEqual(accessories(scene).map(object => object.userData.accessorySlot), ['hat']);
  assert.ok(beanies(scene).every(mesh => mesh.visible), 'the bobble hat keeps the knit beanie');
  applyCharacterOutfit(scene, DEFAULT_OUTFIT);
  assert.equal(accessories(scene).length, 0);
  assert.ok(beanies(scene).every(mesh => mesh.visible));
});

void test('a ghost clone with swapped materials still hides the beanie and uses only the ghost material', async () => {
  const scene = await harold();
  tagCharacterParts(scene);
  const ghost = scene.clone(true), ghostMaterial = new MeshBasicMaterial({ transparent: true, opacity: .32 });
  let disposed = false; ghostMaterial.addEventListener('dispose', () => { disposed = true; });
  ghost.traverse(object => { if (object instanceof Mesh) object.material = ghostMaterial; });
  for (const hat of ['starfall-beanie', 'glacier-beanie', 'propeller-cap']) {
    applyCharacterOutfit(ghost, { ...DEFAULT_OUTFIT, hat, accessory: 'bat-cape' }, { material: ghostMaterial, shadows: false });
    assert.ok(beanies(ghost).every(mesh => !mesh.visible));
    ghost.traverse(object => { if (object instanceof Mesh) { assert.equal(object.material, ghostMaterial); if (object.userData.accessoryPart) assert.equal(object.castShadow, false); } });
  }
  assert.equal(disposed, false, 'the shared ghost material survives re-dressing');
  assert.equal(accessories(scene).length, 0, 'the player model is untouched');
});

void test('every shaped cosmetic builds small, opaque geometry that animates without touching the catalog colors', () => {
  for (const item of COSMETICS.filter(item => item.shape)) {
    const character = new Group(); character.name = 'Harold';
    applyCharacterOutfit(character, { ...DEFAULT_OUTFIT, [item.slot]: item.id });
    let triangles = 0, meshes = 0;
    character.traverse(object => {
      if (!(object instanceof Mesh)) return;
      meshes++; triangles += object.geometry.attributes.position.count / 3;
      const material = object.material as MeshStandardMaterial;
      assert.equal(material.transparent, false); assert.equal(material.depthWrite, true);
      assert.doesNotMatch(material.name, /beanie|sweatshirt|knit ribs/i, 'accessories are never recolored as clothing');
    });
    assert.ok(meshes >= 1 && meshes <= 8, `${item.id} uses ${meshes} meshes`);
    assert.ok(triangles < 9000, `${item.id} has ${triangles} triangles`);
    // Motion is driven by simulation time: a paused clock leaves every pivot where it was.
    for (let i = 0; i < 20; i++) animateAccessories(character, { time: i / 60, vx: 7, vy: -9, grounded: false });
    const pose = () => { const angles: number[] = []; character.traverse(object => angles.push(object.rotation.x, object.rotation.y, object.rotation.z)); return angles; };
    const frozen = pose();
    animateAccessories(character, { time: 19 / 60, vx: 7, vy: -9, grounded: false });
    assert.deepEqual(pose(), frozen);
  }
});
