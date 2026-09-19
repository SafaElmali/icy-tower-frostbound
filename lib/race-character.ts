import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

/** Share geometry and textures, but give every player their own tintable materials and skeleton. */
export function cloneRaceCharacter(source: THREE.Group): THREE.Group {
  const character = clone(source) as THREE.Group;
  const materials = new Map<THREE.Material, THREE.Material>();
  character.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const independent = (original: THREE.Material) => {
      let material = materials.get(original);
      if (!material) {
        material = original.clone();
        // Three serializes userData while cloning; preserve the actual Color used to restore outfits.
        if (original.userData.originalColor instanceof THREE.Color)
          material.userData.originalColor = original.userData.originalColor.clone();
        material.transparent = false;
        material.opacity = 1;
        material.depthWrite = true;
        materials.set(original, material);
      }
      return material;
    };
    object.material = Array.isArray(object.material) ? object.material.map(independent) : independent(object.material);
    object.castShadow = true;
    object.receiveShadow = true;
  });
  return character;
}

/** One reusable canvas per rival; names are drawn as text, never interpreted as markup. */
export class PlayerNameplate {
  readonly sprite: THREE.Sprite;
  private canvas = document.createElement('canvas');
  private texture: THREE.CanvasTexture;
  private name = '';

  constructor() {
    this.canvas.width = 512;
    this.canvas.height = 80;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture, depthWrite: false, depthTest: false, toneMapped: false }));
    this.sprite.scale.set(2.6, .40625, 1);
    this.sprite.renderOrder = 20;
    this.sprite.visible = false;
  }

  setName(value: string) {
    const name = Array.from(value.trim()).slice(0, 20).join('');
    if (name === this.name) return;
    this.name = name;
    this.sprite.visible = !!name;
    const context = this.canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    context.font = '600 32px system-ui, sans-serif';
    const width = Math.min(504, context.measureText(name).width + 36);
    context.fillStyle = 'rgba(7, 18, 30, .86)';
    context.beginPath();
    context.roundRect((512 - width) / 2, 8, width, 64, 20);
    context.fill();
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#f0faff';
    context.fillText(name, 256, 40, 468);
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.sprite.removeFromParent();
    this.texture.dispose();
    this.sprite.material.dispose();
  }
}
