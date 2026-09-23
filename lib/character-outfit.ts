import * as THREE from 'three';
import { HAROLD_HAT_ORIGIN, createAccessory, hidesBeanie, resetAccessoryMotion, type AccessoryOptions } from './character-accessories.ts';
import { SLOT_DEFAULTS, cosmeticFor, equippedId, normalizeOutfit, type Outfit } from './outfits.ts';

const isHatShellMaterial = (material: THREE.Material) => /beanie|knit ribs/i.test(material.name) && !/badge/i.test(material.name);
const materialsOf = (mesh: THREE.Mesh) => Array.isArray(mesh.material) ? mesh.material : [mesh.material];

/**
 * Tag the beanie meshes by structure, not material name, so clones whose materials are swapped (the ghost) can still
 * hide the beanie under a crown. Call before cloning; the boolean survives Object3D.clone.
 */
export function tagCharacterParts(character: THREE.Object3D) {
  character.traverse(object => {
    if (object instanceof THREE.Mesh && !object.userData.accessoryPart && materialsOf(object).some(isHatShellMaterial)) object.userData.hatShell = true;
  });
}

/**
 * Share outfit rendering between the live climber, ghost, race rivals and the wardrobe preview: tint the model's knit
 * materials, swap the beanie for hat shapes, and attach scarves or capes. `material` overrides accessory materials
 * (the translucent ghost).
 */
export function applyCharacterOutfit(character: THREE.Object3D, value: Outfit, options: AccessoryOptions = {}) {
  const outfit = normalizeOutfit(value);
  const hat = cosmeticFor('hat', outfit.hat), accessory = cosmeticFor('accessory', equippedId(outfit, 'accessory'));
  const hideBeanie = hidesBeanie(hat);
  character.traverse(object => {
    if (!(object instanceof THREE.Mesh) || object.userData.accessoryPart) return;
    if (object.userData.hatShell || materialsOf(object).some(isHatShellMaterial)) object.visible = !hideBeanie;
    for (const material of materialsOf(object)) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      const slot = isHatShellMaterial(material) ? 'hat' : /sweatshirt/i.test(material.name) ? 'sweater' : null;
      if (!slot) continue;
      material.userData.originalColor ??= material.color.clone();
      if (outfit[slot] === SLOT_DEFAULTS[slot]) material.color.copy(material.userData.originalColor);
      else {
        material.color.setHex(cosmeticFor(slot, outfit[slot]).colors[0]);
        if (/seams|trim/i.test(material.name)) material.color.multiplyScalar(.5);
        else if (/ribs/i.test(material.name)) material.color.multiplyScalar(1.15);
      }
    }
  });
  dressAccessories(character, [hat, accessory], options);
}

function dressAccessories(character: THREE.Object3D, items: ReturnType<typeof cosmeticFor>[], options: AccessoryOptions) {
  const stale: THREE.Object3D[] = [];
  character.traverse(object => { if (typeof object.userData.accessorySlot === 'string') stale.push(object); });
  for (const object of stale) {
    object.removeFromParent();
    // Geometry is shared through the accessory cache; only this character's own materials are released.
    object.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      for (const material of materialsOf(child)) if (material !== options.material && material.userData.accessoryOwner === character.uuid) material.dispose();
    });
  }
  const anchor = character.getObjectByName('Body') ?? character;
  for (const item of items) {
    const accessory = createAccessory(item, character.uuid, options);
    if (!accessory) continue;
    if (accessory.anchor === 'head') accessory.object.position.set(...HAROLD_HAT_ORIGIN);
    anchor.add(accessory.object);
  }
  resetAccessoryMotion(character);
}
