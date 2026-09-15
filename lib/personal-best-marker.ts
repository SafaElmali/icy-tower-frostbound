import * as THREE from 'three';
import { FLOOR_HEIGHT, type TowerEngine } from './tower-engine.ts';

/** A small wall plaque, never a line across the player's landing area. */
export class PersonalBestMarker {
  readonly group = new THREE.Group();
  private floor = 0;
  private passedAt: number | null = null;
  private material = new THREE.MeshBasicMaterial({ color: 0xf1d69a, transparent: true, opacity: .85, depthWrite: false });
  private geometry = new THREE.BoxGeometry(.22, .045, .04);
  private plaque: THREE.Sprite | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private texture: THREE.CanvasTexture | null = null;

  constructor() {
    for (const x of [-6.15, 6.15]) {
      const tick = new THREE.Mesh(this.geometry, this.material);
      tick.position.set(x, 0, .65); this.group.add(tick);
    }
    if (typeof document !== 'undefined') {
      this.canvas = document.createElement('canvas'); this.canvas.width = 512; this.canvas.height = 96;
      this.texture = new THREE.CanvasTexture(this.canvas); this.texture.colorSpace = THREE.SRGBColorSpace;
      this.plaque = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture, transparent: true, depthWrite: false }));
      this.plaque.position.set(-4.65, .4, .65); this.plaque.scale.set(2.7, .51, 1); this.group.add(this.plaque);
    }
    this.group.visible = false;
  }

  setFloor(floor: number) {
    this.floor = Number.isSafeInteger(floor) && floor > 0 ? floor : 0;
    this.passedAt = null; this.group.position.y = this.floor * FLOOR_HEIGHT;
    this.group.visible = this.floor > 0; this.group.scale.setScalar(1);
    this.material.color.setHex(0xf1d69a); this.material.opacity = .85;
    this.drawLabel(`YOUR BEST · ${this.floor}`);
  }

  private drawLabel(label: string) {
    const context = this.canvas?.getContext('2d');
    if (!context || !this.canvas || !this.texture) return;
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    context.fillStyle = '#102632'; context.fillRect(0, 0, 512, 96);
    context.strokeStyle = '#edd399'; context.lineWidth = 3; context.strokeRect(2, 2, 508, 92);
    context.fillStyle = '#f7e7ba'; context.font = 'bold 34px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillText(label, 256, 48); this.texture.needsUpdate = true;
  }

  update(engine: Pick<TowerEngine, 'floor' | 'time' | 'cameraY' | 'status'>, reducedMotion = false) {
    if (!this.floor || engine.status === 'ready') { this.group.visible = false; return; }
    if (this.passedAt === null && engine.floor > this.floor) {
      this.passedAt = engine.time; this.material.color.setHex(0xc8efb9); this.drawLabel('NEW FLOOR BEST!');
    }
    const age = this.passedAt === null ? 0 : Math.max(0, engine.time - this.passedAt);
    this.group.visible = Math.abs(this.group.position.y - engine.cameraY) < 14 && (this.passedAt === null || age < 2.2);
    // A single gentle plaque lift keeps the center of the tower unobstructed.
    if (this.plaque) this.plaque.position.y = .4 + (this.passedAt !== null && !reducedMotion ? Math.min(age, 1) * .2 : 0);
    const opacity = this.passedAt === null ? 1 : Math.min(1, Math.max(0, (2.2 - age) / .7));
    this.material.opacity = .85 * opacity;
    if (this.plaque) this.plaque.material.opacity = opacity;
  }

  dispose() {
    this.group.removeFromParent(); this.geometry.dispose(); this.material.dispose();
    this.texture?.dispose(); this.plaque?.material.dispose();
  }
}
