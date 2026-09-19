import * as THREE from 'three';

export type LandingGuideTarget = { x: number; y: number; width: number };

/** A small, reusable landing bracket; it never changes platform collision. */
export class LandingGuideWorld {
  readonly group = new THREE.Group();
  private geometry = new THREE.PlaneGeometry(1, 1);
  private material = new THREE.MeshBasicMaterial({
    color: 0xffd179, transparent: true, opacity: .92,
    depthWrite: false, depthTest: false, toneMapped: false,
  });
  private bars = Array.from({ length: 3 }, () => {
    const mesh = new THREE.Mesh(this.geometry, this.material);
    mesh.renderOrder = 30;
    this.group.add(mesh);
    return mesh;
  });
  private arrowGeometry: THREE.ShapeGeometry;
  private arrow: THREE.Mesh;

  constructor() {
    const shape = new THREE.Shape();
    shape.moveTo(-.24, .2); shape.lineTo(0, -.16);
    shape.lineTo(.24, .2); shape.closePath();
    this.arrowGeometry = new THREE.ShapeGeometry(shape);
    this.arrow = new THREE.Mesh(this.arrowGeometry, this.material);
    this.arrow.renderOrder = 30;
    this.group.add(this.arrow);
    this.group.visible = false;
  }

  update(target: LandingGuideTarget | null, time: number, reducedMotion: boolean) {
    this.group.visible = target !== null;
    if (!target) return;
    this.group.position.set(target.x, target.y + .13, .85);
    this.bars[0].scale.set(target.width * .86, .065, 1);
    this.bars[0].position.set(0, .02, 0);
    for (let i = 1; i <= 2; i++) {
      this.bars[i].scale.set(.065, .28, 1);
      this.bars[i].position.set((i === 1 ? -1 : 1) * target.width * .43, .11, 0);
    }
    this.arrow.position.y = .62 + (reducedMotion ? 0 : Math.sin(time * 3) * .045);
    this.material.opacity = reducedMotion ? .92 : .86 + Math.sin(time * 3) * .1;
  }

  dispose() {
    this.group.visible = false;
    this.geometry.dispose();
    this.arrowGeometry.dispose();
    this.material.dispose();
  }
}
