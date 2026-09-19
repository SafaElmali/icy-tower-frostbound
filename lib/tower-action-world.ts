import * as THREE from 'three';
import { RecoveryShield } from './recovery-shield.ts';
import { CRUMBLE_DELAY, ICICLE_WARNING_TIME, type TowerActionState, type CrumbleState } from './tower-action.ts';

type ActionSceneState = { action: TowerActionState; x: number; y: number; time: number; cameraY: number; status: string; rulesVersion: number; showHazardWarnings?: boolean };
type IceVisual = { group: THREE.Group; ice: THREE.Group; lane: THREE.Mesh; edges: THREE.Mesh[]; target: THREE.Group; timer: THREE.Mesh };
type BatVisual = { group: THREE.Group; wings: THREE.Group[]; warning: THREE.Group };
type TrailCrystal = { x: number; y: number; born: number; angle: number };
export type CrumbleVisual = { group: THREE.Group; timer: THREE.Mesh; cracks: THREE.Group; chips: THREE.Mesh[] };
const ICE_CAPACITY = 4, BAT_CAPACITY = 4, CRYSTAL_CAPACITY = 24, TRAIL_CAPACITY = 72;

/** Reusable action geometry. Simulation time owns every warning and animation. */
export class TowerActionWorld {
  readonly group = new THREE.Group();
  private geometries = new Set<THREE.BufferGeometry>();
  private materials = new Set<THREE.Material>();
  private icicles: IceVisual[] = [];
  private bats: BatVisual[] = [];
  private crystals: THREE.Mesh[] = [];
  private trail: THREE.InstancedMesh;
  private trailCrystals: TrailCrystal[] = [];
  private transform = new THREE.Object3D();
  private previous: { x: number; y: number; time: number; active: boolean } | null = null;
  private emissionTime = 0;
  private aura: THREE.Mesh;
  private shield: RecoveryShield;
  private encounter: THREE.Group;
  private disposed = false;
  private box = this.geometry(new THREE.BoxGeometry(1, 1, 1));
  private crystalGeometry = this.geometry(new THREE.OctahedronGeometry(1, 0));
  private amber = this.material(new THREE.MeshBasicMaterial({ color: 0xffbf5e, toneMapped: false }));
  private darkAmber = this.material(new THREE.MeshBasicMaterial({ color: 0x302319 }));
  private iceMaterial = this.material(new THREE.MeshPhysicalMaterial({ color: 0x88eaff, roughness: .15, metalness: .24, clearcoat: 1, emissive: 0x28798e, emissiveIntensity: .6 }));
  private crystalMaterial = this.material(new THREE.MeshPhysicalMaterial({ color: 0xa4ffdf, emissive: 0x58ffc5, emissiveIntensity: 1.2, roughness: .14, metalness: .25, clearcoat: 1 }));

  constructor() {
    this.group.name = 'Tower action';
    for (let i = 0; i < ICE_CAPACITY; i++) this.icicles.push(this.makeIcicle());
    for (let i = 0; i < BAT_CAPACITY; i++) this.bats.push(this.makeBat());
    for (let i = 0; i < CRYSTAL_CAPACITY; i++) {
      const crystal = this.mesh(this.crystalGeometry, this.crystalMaterial, this.group);
      crystal.name = 'Frenzy crystal'; crystal.scale.set(.17, .29, .17); crystal.visible = false; this.crystals.push(crystal);
    }
    const trailMaterial = this.material(new THREE.MeshBasicMaterial({ color: 0x8dffda, transparent: true, opacity: .72, depthWrite: false, toneMapped: false }));
    this.trail = new THREE.InstancedMesh(this.crystalGeometry, trailMaterial, TRAIL_CAPACITY);
    this.trail.name = 'Frenzy crystal trail'; this.trail.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.trail.frustumCulled = false; this.trail.count = 0; this.group.add(this.trail);
    const auraMaterial = this.material(new THREE.MeshBasicMaterial({ color: 0x76ffcf, transparent: true, opacity: .4, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    this.aura = this.mesh(this.geometry(new THREE.RingGeometry(.79, .87, 48)), auraMaterial, this.group);
    this.aura.name = 'Frenzy halo'; this.aura.visible = false;
    this.shield = new RecoveryShield(); this.group.add(this.shield.group);
    this.encounter = new THREE.Group(); this.encounter.name = 'Ice shower edge cue'; this.encounter.visible = false; this.group.add(this.encounter);
    const edgeMaterial = this.material(new THREE.MeshBasicMaterial({ color: 0xffbf5e, transparent: true, opacity: .13, depthWrite: false }));
    for (const side of [-1, 1]) { const edge = this.mesh(this.box, edgeMaterial, this.encounter, side * 6.7, 0, -.6); edge.scale.set(.035, 24, .02); }
  }

  private geometry<T extends THREE.BufferGeometry>(geometry: T): T { this.geometries.add(geometry); return geometry; }
  private material<T extends THREE.Material>(material: T): T { this.materials.add(material); return material; }
  private mesh(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  }
  private bar(parent: THREE.Object3D, material: THREE.Material, x: number, y: number, z: number, width: number, height: number, depth = .025) {
    const mesh = this.mesh(this.box, material, parent, x, y, z); mesh.scale.set(width, height, depth); return mesh;
  }

  private makeIcicle(): IceVisual {
    const group = new THREE.Group(); group.name = 'Falling icicle'; group.visible = false; this.group.add(group);
    const ice = new THREE.Group(); group.add(ice);
    const cone = this.geometry(new THREE.ConeGeometry(.3, 1.25, 5));
    // Physics tracks the pointed tip, so the inverted cone extends upward from y = 0.
    const shard = this.mesh(cone, this.iceMaterial, ice, 0, .625, .05); shard.rotation.z = Math.PI;
    const crown = this.mesh(this.crystalGeometry, this.iceMaterial, ice, .03, 1.155, .05); crown.scale.set(.3, .22, .25);
    const glint = this.mesh(this.crystalGeometry, this.crystalMaterial, ice, -.075, .895, .26); glint.scale.set(.04, .27, .03);
    const laneMaterial = this.material(new THREE.MeshBasicMaterial({ color: 0xffba58, transparent: true, opacity: .09, depthWrite: false }));
    const lane = this.bar(group, laneMaterial, 0, 0, -.1, 1.2, 1);
    const edgeMaterial = this.material(new THREE.MeshBasicMaterial({ color: 0xffc36a, transparent: true, opacity: .44, depthWrite: false, toneMapped: false }));
    const edges = [-.6, .6].map(x => this.bar(group, edgeMaterial, x, 0, .02, .022, 1));
    const target = new THREE.Group(); target.name = 'Icicle landing warning'; group.add(target);
    // The full collision lane stays marked even when reduced motion disables shaking.
    for (const side of [-1, 1]) {
      this.bar(target, this.amber, side * .6, .16, .7, .035, .34);
      this.bar(target, this.amber, side * .48, .015, .7, .27, .04);
      const chevron = this.bar(target, this.amber, side * .1, .47, .7, .23, .045); chevron.rotation.z = side * Math.PI / 4;
    }
    this.bar(target, this.darkAmber, 0, -.12, .71, 1.22, .09);
    const timer = this.bar(target, this.amber, 0, -.12, .74, 1.16, .04);
    return { group, ice, lane, edges, target, timer };
  }

  private makeBat(): BatVisual {
    const group = new THREE.Group(); group.name = 'Frost bat'; group.visible = false; this.group.add(group);
    const bodyMaterial = this.material(new THREE.MeshStandardMaterial({ color: 0x6687b9, roughness: .74, emissive: 0x173451, emissiveIntensity: .5 }));
    const wingMaterial = this.material(new THREE.MeshStandardMaterial({ color: 0x526693, roughness: .6, metalness: .1, side: THREE.DoubleSide }));
    const eyeMaterial = this.material(new THREE.MeshBasicMaterial({ color: 0xc1ffff, toneMapped: false }));
    const pupilMaterial = this.material(new THREE.MeshBasicMaterial({ color: 0x132437 }));
    const body = this.mesh(this.geometry(new THREE.SphereGeometry(.25, 12, 8)), bodyMaterial, group); body.scale.set(.85, 1.05, .65);
    const belly = this.mesh(this.geometry(new THREE.SphereGeometry(.17, 10, 6)), this.iceMaterial, group, 0, -.05, .12); belly.scale.set(.85, 1.05, .45);
    const face = this.geometry(new THREE.SphereGeometry(.06, 8, 6));
    for (const side of [-1, 1]) {
      const ear = this.mesh(this.geometry(new THREE.ConeGeometry(.08, .24, 4)), bodyMaterial, group, side * .14, .25); ear.rotation.z = -side * .18;
      this.mesh(face, eyeMaterial, group, side * .085, .075, .175);
      const pupil = this.mesh(face, pupilMaterial, group, side * .085, .075, .226); pupil.scale.set(.27, .8, .18);
    }
    const crest = this.mesh(this.crystalGeometry, this.iceMaterial, group, 0, .24, .13); crest.scale.set(.07, .17, .06);
    const shape = new THREE.Shape(); shape.moveTo(0, .09); shape.quadraticCurveTo(.27, .35, .57, .3);
    shape.lineTo(.7, .02); shape.quadraticCurveTo(.45, .16, .42, -.16);
    shape.quadraticCurveTo(.28, -.01, .2, -.2); shape.quadraticCurveTo(.11, -.02, 0, -.12); shape.closePath();
    const wingGeometry = this.geometry(new THREE.ShapeGeometry(shape, 5));
    const wings = [-1, 1].map(side => {
      const wing = new THREE.Group(); wing.position.x = side * .13; wing.scale.x = side * .78; group.add(wing);
      this.mesh(wingGeometry, wingMaterial, wing);
      const edge = this.bar(wing, bodyMaterial, .26, .16, .01, .52, .035); edge.rotation.z = .35;
      return wing;
    });
    const warning = new THREE.Group(); warning.name = 'Bat approach warning'; group.add(warning);
    const ring = this.mesh(this.geometry(new THREE.RingGeometry(.57, .6, 32)), this.amber, warning, 0, 0, -.1); ring.scale.x = 1.4;
    this.bar(warning, this.amber, 0, .76, .2, .065, .2);
    this.bar(warning, this.amber, 0, .6, .2, .065, .06);
    return { group, wings, warning };
  }

  /** Cracks belong to the ledge while their shared geometry belongs to this pool. */
  makeCrumble(width: number): CrumbleVisual {
    const group = new THREE.Group(); group.name = 'Cracked ice warning';
    const cracks = new THREE.Group(); group.add(cracks);
    const paths = [
      [[-.37, .49], [-.23, .15], [-.3, -.16], [-.14, -.55], [-.21, -1.09]],
      [[.22, .51], [.14, .2], [.26, -.14], [.16, -.55], [.28, -1.1]],
      [[-.23, .15], [-.02, -.04], [.14, .2]],
    ];
    for (const path of paths) for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], dx = (b[0] - a[0]) * width, dz = b[1] - a[1];
      const crack = this.bar(cracks, this.darkAmber, (a[0] + b[0]) * width / 2, .009, (a[1] + b[1]) / 2, Math.hypot(dx, dz), .017, .045);
      crack.rotation.y = -Math.atan2(dz, dx);
    }
    // Front-facing seams stay legible on narrow mobile screens.
    for (const side of [-1, 1]) { const seam = this.bar(cracks, this.amber, side * width * .24, -.14, .55, .027, .28); seam.rotation.z = side * .27; }
    this.bar(group, this.darkAmber, 0, -.29, .575, width * .8, .09);
    const timer = this.bar(group, this.amber, 0, -.29, .6, width * .8, .04); timer.visible = false;
    const chips = [-1, 0, 1].map(side => { const chip = this.mesh(this.crystalGeometry, this.iceMaterial, group, side * width * .29, -.43, .63); chip.scale.set(.1, .13, .09); chip.visible = false; return chip; });
    return { group, timer, cracks, chips };
  }

  updateCrumble(visual: CrumbleVisual, state: CrumbleState, width: number, time: number, reducedMotion: boolean) {
    const active = state.remaining !== null && !state.broken;
    const remaining = Math.max(0, Math.min(1, (state.remaining ?? CRUMBLE_DELAY) / CRUMBLE_DELAY));
    visual.group.visible = !state.broken;
    visual.timer.visible = active;
    visual.timer.scale.x = width * .8 * remaining;
    visual.timer.position.x = -width * .4 * (1 - remaining);
    visual.cracks.scale.z = 1 + (1 - remaining) * .025;
    visual.chips.forEach((chip, index) => {
      chip.visible = active && !reducedMotion;
      const fall = (time * 2.5 + index * .33) % 1;
      chip.position.y = -.43 - fall * .7; chip.scale.setScalar(.08 * (1 - fall));
    });
  }

  update(state: ActionSceneState, reducedMotion: boolean) {
    if (this.disposed) return;
    const { action, time } = state, active = state.status !== 'ready';
    const showWarnings = state.showHazardWarnings ?? state.rulesVersion < 8;
    this.icicles.forEach((visual, index) => {
      const icicle = action.icicles[index]; visual.group.visible = active && !!icicle;
      if (!icicle) return;
      const warning = icicle.state === 'warning', height = Math.max(1, icicle.spawnY - icicle.targetY);
      visual.group.position.set(icicle.x, icicle.targetY, 0);
      visual.ice.position.set(warning && !reducedMotion ? Math.sin(time * 37 + icicle.id) * .055 : 0, icicle.y - icicle.targetY, 0);
      visual.ice.rotation.z = warning && !reducedMotion ? Math.sin(time * 23 + icicle.id) * .035 : 0;
      visual.lane.visible = showWarnings && warning; visual.lane.position.y = height / 2; visual.lane.scale.y = height;
      for (const edge of visual.edges) { edge.visible = showWarnings && warning; edge.position.y = height / 2; edge.scale.y = height; }
      visual.target.visible = showWarnings && (warning || icicle.y >= icicle.targetY - .8);
      visual.timer.visible = showWarnings && warning;
      const progress = Math.max(.025, Math.min(1, icicle.warningTime / ICICLE_WARNING_TIME));
      visual.timer.scale.x = 1.16 * progress;
    });
    this.bats.forEach((visual, index) => {
      const bat = action.bats[index]; visual.group.visible = active && !!bat?.alive;
      if (!bat) return;
      visual.group.position.set(bat.x, bat.y, .05);
      visual.group.rotation.z = reducedMotion ? 0 : Math.sin(time * 3 + bat.phase) * .065;
      visual.wings.forEach((wing, index) => { wing.rotation.y = reducedMotion ? .22 : .22 + Math.sin(time * 14 + bat.phase) * .7; wing.rotation.z = reducedMotion ? 0 : (index === 0 ? 1 : -1) * Math.sin(time * 14 + bat.phase) * .13; });
      visual.warning.visible = showWarnings && bat.warningTime > 0;
      // Bats prepare outside the walls; their advance notice belongs inside the playfield.
      visual.warning.position.x = THREE.MathUtils.clamp(bat.x, -5.5, 5.5) - bat.x;
      visual.warning.rotation.z = -visual.group.rotation.z;
    });
    this.crystals.forEach((visual, index) => {
      const crystal = action.crystals[index]; visual.visible = active && !!crystal && !crystal.collected;
      if (!crystal) return;
      visual.position.set(crystal.x, crystal.y + (reducedMotion ? 0 : Math.sin(time * 2.8 + crystal.id) * .06), .15);
      visual.rotation.y = reducedMotion ? Math.PI / 4 : time * 1.6 + crystal.id;
    });
    const frenzy = active && action.frenzyTime > 0;
    this.aura.visible = frenzy; this.aura.position.set(state.x, state.y + .76, -.22);
    this.aura.scale.setScalar(reducedMotion ? 1 : 1 + Math.sin(time * 3) * .035);
    this.shield.group.position.set(state.x, state.y + .78, .15);
    this.shield.update(active ? action.invulnerableTime : 0, time, reducedMotion);
    this.encounter.visible = active && action.encounter?.kind === 'ice-shower'; this.encounter.position.y = state.cameraY;
    this.updateTrail(state, frenzy, reducedMotion);
  }

  private updateTrail(state: ActionSceneState, frenzy: boolean, reducedMotion: boolean) {
    const { time, x, y } = state;
    if (reducedMotion || state.status === 'ready' || state.status === 'over' || (this.previous && time < this.previous.time)) {
      this.trailCrystals.length = 0; this.emissionTime = 0; this.trail.count = 0;
      this.previous = { x, y, time, active: frenzy }; return;
    }
    const previous = this.previous, dt = previous ? Math.min(.1, Math.max(0, time - previous.time)) : 0;
    this.trailCrystals = this.trailCrystals.filter(crystal => time - crystal.born < .65);
    if (frenzy && previous?.active && state.status === 'playing' && Math.hypot(x - previous.x, y - previous.y) < 6) {
      this.emissionTime += dt;
      while (this.emissionTime >= 1 / 32) {
        this.emissionTime -= 1 / 32;
        const born = time - this.emissionTime, blend = dt ? Math.min(1, (born - previous.time) / dt) : 1;
        if (this.trailCrystals.length >= TRAIL_CAPACITY) this.trailCrystals.shift();
        this.trailCrystals.push({ x: THREE.MathUtils.lerp(previous.x, x, blend), y: THREE.MathUtils.lerp(previous.y, y, blend) + .65, born, angle: born * 13 });
      }
    } else if (state.status !== 'paused') this.emissionTime = 0;
    this.previous = { x, y, time, active: frenzy };
    this.trail.count = this.trailCrystals.length;
    this.trailCrystals.forEach((crystal, index) => {
      const age = Math.max(0, time - crystal.born), size = .12 * (1 - age / .65);
      this.transform.position.set(crystal.x + Math.sin(crystal.angle) * age * .35, crystal.y - age * .45, -.16);
      this.transform.rotation.set(0, crystal.angle + age * 2, .45); this.transform.scale.set(size, size * 1.6, size);
      this.transform.updateMatrix(); this.trail.setMatrixAt(index, this.transform.matrix);
    });
    this.trail.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    if (this.disposed) return; this.disposed = true;
    this.shield.dispose(); this.trail.dispose(); this.geometries.forEach(geometry => geometry.dispose()); this.materials.forEach(material => material.dispose());
    this.group.clear(); this.trailCrystals.length = 0;
  }
}
