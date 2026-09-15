import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Mesh, MeshStandardMaterial } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { applyCharacterOutfit } from '../lib/character-outfit.ts';
import { COSMETICS, DEFAULT_OUTFIT } from '../lib/outfits.ts';

void test('the real climber previews every clothing color and restores the original materials', async () => {
  const bytes = await readFile(new URL('../public/assets/harold.glb', import.meta.url));
  const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
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
  for (const item of COSMETICS.filter(item => item.target > 0 && item.slot !== 'trail')) {
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
