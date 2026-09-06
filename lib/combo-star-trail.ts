import * as THREE from 'three';
import type { TowerEngine } from './tower-engine';

type TrailState = Pick<TowerEngine, 'x' | 'y' | 'vx' | 'vy' | 'time' | 'combo' | 'comboTime' | 'grounded' | 'status'>;
type Star = { x: number; y: number; vx: number; vy: number; born: number; life: number; angle: number; spin: number; size: number; color: number };
const CAPACITY = 96;
const COLORS = [0xffd65c, 0xff71c5, 0x68daff, 0xabf767, 0xb496ff];

/** A bounded, single-draw-call trail whose stars stay on the path already traveled. */
export class ComboStarTrail {
  readonly mesh: THREE.InstancedMesh;
  private stars: Star[] = [];
  private previous: { x: number; y: number; time: number } | null = null;
  private emissionTime = 0;
  private transform = new THREE.Object3D();
  private color = new THREE.Color();
  private random: () => number;

  constructor(random = Math.random) {
    this.random = random;
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + i * Math.PI / 5, radius = i % 2 === 0 ? 1 : .43;
      const x = Math.cos(a) * radius, y = Math.sin(a) * radius;
      if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    shape.closePath();
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .9, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(new THREE.ShapeGeometry(shape), material, CAPACITY);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; this.mesh.count = 0;
  }

  update(state: TrailState) {
    if (state.status === 'ready' || state.status === 'over' || (this.previous && state.time < this.previous.time)) {
      this.stars = []; this.emissionTime = 0; this.mesh.count = 0;
      this.previous = { x: state.x, y: state.y, time: state.time }; return;
    }
    const dt = this.previous ? Math.min(.1, Math.max(0, state.time - this.previous.time)) : 0;
    this.stars = this.stars.filter(star => state.time - star.born < star.life);
    if (state.status === 'playing' && !state.grounded && state.combo >= 2 && state.comboTime > 0 && this.previous) {
      const interval = 1 / (24 + Math.min(16, state.combo));
      this.emissionTime += dt;
      const speed = Math.hypot(state.vx, state.vy);
      const dx = speed > .1 ? state.vx / speed : 0, dy = speed > .1 ? state.vy / speed : 1;
      while (this.emissionTime + 1e-9 >= interval) {
        this.emissionTime = Math.max(0, this.emissionTime - interval);
        const born = state.time - this.emissionTime;
        const blend = dt > 0 ? Math.min(1, Math.max(0, (born - this.previous.time) / dt)) : 1;
        if (this.stars.length >= CAPACITY) this.stars.shift();
        this.stars.push({
          x: THREE.MathUtils.lerp(this.previous.x, state.x, blend) - dx * .3 + (this.random() - .5) * .36,
          y: THREE.MathUtils.lerp(this.previous.y, state.y, blend) + .8 - dy * .3 + (this.random() - .5) * .36,
          vx: -dx * .45 + (this.random() - .5) * .45, vy: -dy * .3 + (this.random() - .5) * .5,
          born, life: .7 + this.random() * .4, angle: this.random() * Math.PI * 2, spin: (this.random() - .5) * 7,
          size: .095 + this.random() * .075, color: COLORS[Math.floor(this.random() * COLORS.length)],
        });
      }
    } else if (state.status !== 'paused') this.emissionTime = 0;
    this.previous = { x: state.x, y: state.y, time: state.time };
    this.mesh.count = this.stars.length;
    this.stars.forEach((star, i) => {
      const age = Math.max(0, state.time - star.born);
      this.transform.position.set(star.x + star.vx * age, star.y + star.vy * age - .35 * age * age, -.3);
      this.transform.rotation.z = star.angle + star.spin * age;
      this.transform.scale.setScalar(star.size * Math.pow(Math.max(0, 1 - age / star.life), .65));
      this.transform.updateMatrix(); this.mesh.setMatrixAt(i, this.transform.matrix);
      this.mesh.setColorAt(i, this.color.setHex(star.color).multiplyScalar(1.45));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose() { this.mesh.dispose(); this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); }
}
