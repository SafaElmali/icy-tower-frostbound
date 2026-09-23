import * as THREE from 'three';
import { HAROLD_HAT_ORIGIN, createAccessory, hidesBeanie, resetAccessoryMotion, type AccessoryOptions } from './character-accessories.ts';
import { createPenguin } from './character-penguin.ts';
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
  const active = selectClimber(character, equippedId(outfit, 'climber'), options);
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
  dressAccessories(character, active, [hat, accessory], options);
}

/**
 * Show the chosen climber model and return the root to dress and animate. Pip is built on first use next to the
 * loaded Harold model; the offline fallback model (no `Harold` node) always stays Harold.
 */
function selectClimber(character: THREE.Object3D, id: string, options: AccessoryOptions): THREE.Object3D {
  limbCache.delete(character);
  const harold = character.getObjectByName('Harold');
  if (!harold?.parent) return character;
  let pip = character.getObjectByName('Pip');
  if (id === 'pip-penguin' && !pip) {
    pip = createPenguin(options.material, options.shadows ?? true);
    pip.position.copy(harold.position); harold.parent.add(pip);
  }
  harold.visible = !pip || id !== 'pip-penguin';
  if (pip) pip.visible = !harold.visible;
  return harold.visible ? harold : pip!;
}

const limbCache = new WeakMap<THREE.Object3D, { arms: THREE.Object3D[]; legs: THREE.Object3D[] }>();
/** The visible climber's Arm_L/Arm_R and Leg_L/Leg_R pivots, in the order ClimberMotion expects. */
export function climberLimbs(character: THREE.Object3D) {
  let limbs = limbCache.get(character);
  if (!limbs) {
    const pip = character.getObjectByName('Pip'), model = pip?.visible ? pip : character.getObjectByName('Harold') ?? character;
    const find = (names: string[]) => names.map(name => model.getObjectByName(name)).filter((part): part is THREE.Object3D => !!part);
    limbs = { arms: find(['Arm_L', 'Arm_R']), legs: find(['Leg_L', 'Leg_R']) };
    limbCache.set(character, limbs);
  }
  return limbs;
}

function dressAccessories(character: THREE.Object3D, active: THREE.Object3D, items: ReturnType<typeof cosmeticFor>[], options: AccessoryOptions) {
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
  const anchor = active.getObjectByName('Pip_Body') ?? active.getObjectByName('Body') ?? active;
  for (const item of items) {
    const accessory = createAccessory(item, character.uuid, options);
    if (!accessory) continue;
    if (accessory.anchor === 'head') {
      // Each climber's body node says where its hat band sits; Harold's is the reference.
      const origin = anchor.userData.hatOrigin ?? HAROLD_HAT_ORIGIN, scale = anchor.userData.hatScale ?? 1;
      accessory.object.position.set(origin[0], origin[1], origin[2]); accessory.object.scale.setScalar(scale);
    } else if (anchor.userData.bodyScale) accessory.object.scale.fromArray(anchor.userData.bodyScale);
    anchor.add(accessory.object);
  }
  resetAccessoryMotion(character);
}
