import * as THREE from 'three';
import { DEFAULT_OUTFIT, cosmeticFor, normalizeOutfit, type Outfit } from './outfits.ts';

/** Share material tinting between the live climber and the wardrobe preview. */
export function applyCharacterOutfit(character: THREE.Object3D, value: Outfit) {
  const outfit = normalizeOutfit(value);
  character.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      const slot = /beanie|knit ribs/i.test(material.name) && !/badge/i.test(material.name) ? 'hat' : /sweatshirt/i.test(material.name) ? 'sweater' : null;
      if (!slot) continue;
      material.userData.originalColor ??= material.color.clone();
      if (outfit[slot] === DEFAULT_OUTFIT[slot]) material.color.copy(material.userData.originalColor);
      else {
        material.color.setHex(cosmeticFor(slot, outfit[slot]).colors[0]);
        if (/seams|trim/i.test(material.name)) material.color.multiplyScalar(.5);
        else if (/ribs/i.test(material.name)) material.color.multiplyScalar(1.15);
      }
    }
  });
}
