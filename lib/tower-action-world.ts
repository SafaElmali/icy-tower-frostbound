import * as THREE from 'three';
import { RecoveryShield } from './recovery-shield.ts';
import { crackTexture, crackThreshold } from './crack-texture.ts';
import { CRUMBLE_DELAY, ICICLE_WARNING_TIME, WRAITH_DASH_LENGTH, WRAITH_DASH_TIME, WRAITH_FADE_TIME, WRAITH_TELL_TIME, type TowerActionState, type CrumbleState, type FrostWraith } from './tower-action.ts';
import type { GameEvent } from './tower-engine.ts';

type ActionSceneState = { action: TowerActionState; x: number; y: number; time: number; cameraY: number; status: string; rulesVersion: number; showHazardWarnings?: boolean };
type IceVisual = { group: THREE.Group; ice: THREE.Group; streak: THREE.Mesh; lane: THREE.Mesh; edges: THREE.Mesh[]; target: THREE.Group; timer: THREE.Mesh };
/** Enemy visuals are keyed by simulation id so a stomped enemy can finish its pop after it leaves the state. */
type EnemySlot = { id: number | null; x: number; y: number; dir: number; hitAt: number | null; popAt: number | null; vanishAt: number | null };
type BatVisual = EnemySlot & {
  group: THREE.Group; pose: THREE.Group; wings: THREE.Group[]; outer: THREE.Group[]; warning: THREE.Group;
  eyes: THREE.MeshBasicMaterial;
};
type WraithVisual = EnemySlot & {
  group: THREE.Group; stretch: THREE.Group; model: THREE.Group; arms: THREE.Mesh[]; tatters: THREE.Mesh[];
  robe: THREE.MeshPhysicalMaterial; eyes: THREE.MeshBasicMaterial; glow: THREE.ShaderMaterial; halo: THREE.Mesh;
  line: THREE.Group; segments: THREE.Mesh[]; arrow: THREE.Group; ghosts: THREE.Mesh[]; ghostMaterial: THREE.MeshBasicMaterial;
  state: FrostWraith['state']; stateTime: number;
};
type TrailCrystal = { x: number; y: number; born: number; angle: number };
type Particle = { x: number; y: number; z: number; vx: number; vy: number; vz: number; born: number; life: number; size: number; spin: number; gravity: number; color: THREE.Color; stretch: number };
type Chunk = { x: number; y: number; z: number; vx: number; vy: number; vz: number; born: number; life: number; w: number; h: number; d: number; spin: number; tumble: number; color: THREE.Color };
type Ring = { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; born: number; life: number; from: number; to: number; opacity: number; active: boolean };
/** Thin ice: hairline cracks, fissures that grow in stages once armed, a fracture seam, a countdown bar and falling chips. */
export type CrumbleVisual = { group: THREE.Group; timer: THREE.Mesh; cracks: THREE.Group; chips: THREE.Mesh[]; spread: THREE.Group[]; glow: THREE.Mesh[]; variant: number; wasBroken: boolean | null };
type CrackSet = { base: THREE.MeshBasicMaterial[]; glow: THREE.MeshBasicMaterial[][] };
/** Glowing fissure stages shown as the countdown runs: generations 1, 2, 3 and 4. */
const CRACK_STAGES = 4;
const ICE_CAPACITY = 4, BAT_CAPACITY = 4, WRAITH_CAPACITY = 2, CRYSTAL_CAPACITY = 24, TRAIL_CAPACITY = 72;
const PARTICLE_CAPACITY = 140, CHUNK_CAPACITY = 40, RING_CAPACITY = 6, DASH_SEGMENTS = 11;
const BAT_POP = .42, HIT_FLASH = .38, VANISH = .3;
const AMBER = 0xffbf5e;

const glowVertex = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
/** A soft additive disc; no textures, so it also builds in headless tests. */
const glowFragment = 'uniform vec3 color; uniform float opacity; varying vec2 vUv; void main() { float d = length(vUv - 0.5) * 2.0; float a = clamp(pow(max(0.0, 1.0 - d), 2.2) * opacity, 0.0, 1.0); gl_FragColor = vec4(color * a, a); }';
/** A vertical streak that fades out above the falling shard. */
const streakFragment = 'uniform vec3 color; uniform float opacity; varying vec2 vUv; void main() { float side = 1.0 - abs(vUv.x - 0.5) * 2.0; float a = clamp(pow(max(side, 0.0), 1.6) * pow(max(1.0 - vUv.y, 0.0), 1.4) * opacity, 0.0, 1.0); gl_FragColor = vec4(color * a, a); }';

/** Reusable action geometry. Simulation time owns every warning and animation. */
export class TowerActionWorld {
  readonly group = new THREE.Group();
  private geometries = new Set<THREE.BufferGeometry>();
  private materials = new Set<THREE.Material>();
  private icicles: IceVisual[] = [];
  private bats: BatVisual[] = [];
  private wraiths: WraithVisual[] = [];
  private crystals: THREE.Mesh[] = [];
  private trail: THREE.InstancedMesh;
  private trailCrystals: TrailCrystal[] = [];
  private particles: Particle[] = [];
  private particleMesh: THREE.InstancedMesh;
  private chunks: Chunk[] = [];
  private chunkMesh: THREE.InstancedMesh;
  private rings: Ring[] = [];
  private transform = new THREE.Object3D();
  private previous: { x: number; y: number; time: number; active: boolean } | null = null;
  private emissionTime = 0;
  private fxTime = 0;
  private fxSeed = 0x2f6b1d;
  private reducedMotion = false;
  private high = true;
  private shield: RecoveryShield;
  private encounter: THREE.Group;
  private disposed = false;
  private box = this.geometry(new THREE.BoxGeometry(1, 1, 1));
  private plane = this.geometry(new THREE.PlaneGeometry(1, 1));
  private crystalGeometry = this.geometry(new THREE.OctahedronGeometry(1, 0));
  private amber = this.material(new THREE.MeshBasicMaterial({ color: AMBER, toneMapped: false }));
  private dashLit = this.material(new THREE.MeshBasicMaterial({ color: 0xff9a2e, toneMapped: false }));
  private dimAmber = this.material(new THREE.MeshBasicMaterial({ color: 0xff9a2e, transparent: true, opacity: .38, depthWrite: false, toneMapped: false }));
  private darkAmber = this.material(new THREE.MeshBasicMaterial({ color: 0x302319 }));
  private fissure = this.material(new THREE.MeshBasicMaterial({ color: 0xffa640, toneMapped: false }));
  private iceMaterial = this.material(new THREE.MeshPhysicalMaterial({ color: 0x88eaff, roughness: .15, metalness: .24, clearcoat: 1, emissive: 0x28798e, emissiveIntensity: .6 }));
  private crystalMaterial = this.material(new THREE.MeshPhysicalMaterial({ color: 0xa4ffdf, emissive: 0x58ffc5, emissiveIntensity: 1.2, roughness: .14, metalness: .25, clearcoat: 1 }));
  private batGlow = this.material(this.glowMaterial(0x5fcfff, .5));
  private textures: THREE.Texture[] = [];
  /** Two crack patterns (top and front face) so neighbouring thin-ice ledges differ. */
  private crackSets: CrackSet[] = [0x51f3, 0x2b77].map(seed => this.crackSet(seed));

  constructor() {
    this.group.name = 'Tower action';
    for (let i = 0; i < ICE_CAPACITY; i++) this.icicles.push(this.makeIcicle());
    for (let i = 0; i < BAT_CAPACITY; i++) this.bats.push(this.makeBat());
    for (let i = 0; i < WRAITH_CAPACITY; i++) this.wraiths.push(this.makeWraith());
    for (let i = 0; i < CRYSTAL_CAPACITY; i++) {
      const crystal = this.mesh(this.crystalGeometry, this.crystalMaterial, this.group);
      crystal.name = 'Frenzy crystal'; crystal.scale.set(.17, .29, .17); crystal.visible = false; this.crystals.push(crystal);
    }
    const trailMaterial = this.material(new THREE.MeshBasicMaterial({ color: 0x8dffda, transparent: true, opacity: .72, depthWrite: false, toneMapped: false }));
    this.trail = new THREE.InstancedMesh(this.crystalGeometry, trailMaterial, TRAIL_CAPACITY);
    this.trail.name = 'Frenzy crystal trail'; this.trail.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.trail.frustumCulled = false; this.trail.count = 0; this.group.add(this.trail);
    // Hazard bursts: shards, sparkles and puffs share one instanced draw.
    const particleMaterial = this.material(new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    this.particleMesh = new THREE.InstancedMesh(this.crystalGeometry, particleMaterial, PARTICLE_CAPACITY);
    this.particleMesh.name = 'Hazard burst particles';
    this.chunkMesh = new THREE.InstancedMesh(this.box, this.material(new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: .12, metalness: .08, clearcoat: 1, emissive: 0x1d5f73, emissiveIntensity: .35 })), CHUNK_CAPACITY);
    this.chunkMesh.name = 'Collapsed ledge debris';
    for (const mesh of [this.particleMesh, this.chunkMesh]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.count = 0; mesh.visible = false;
      for (let i = 0; i < mesh.instanceMatrix.count; i++) mesh.setColorAt(i, new THREE.Color(0xffffff));
      this.group.add(mesh);
    }
    const ringGeometry = this.geometry(new THREE.RingGeometry(.78, 1, 40));
    for (let i = 0; i < RING_CAPACITY; i++) {
      const material = this.material(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      const mesh = this.mesh(ringGeometry, material, this.group); mesh.name = 'Hazard burst ring'; mesh.visible = false;
      this.rings.push({ mesh, material, born: 0, life: 1, from: 0, to: 1, opacity: 0, active: false });
    }
    this.shield = new RecoveryShield(); this.group.add(this.shield.group);
    this.encounter = new THREE.Group(); this.encounter.name = 'Ice shower edge cue'; this.encounter.visible = false; this.group.add(this.encounter);
    const edgeMaterial = this.material(new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: .13, depthWrite: false }));
    for (const side of [-1, 1]) { const edge = this.mesh(this.box, edgeMaterial, this.encounter, side * 6.7, 0, -.6); edge.scale.set(.035, 24, .02); }
  }

  private geometry<T extends THREE.BufferGeometry>(geometry: T): T { this.geometries.add(geometry); return geometry; }
  private crackSet(seed: number): CrackSet {
    const faces = [crackTexture(256, 96, seed, 'top'), crackTexture(256, 32, seed + 7, 'front')];
    this.textures.push(...faces);
    // Glowing fissures are brighter than white so the bloom pass makes them burn.
    const material = (map: THREE.Texture, color: number, generation: number, glow: boolean) => this.material(new THREE.MeshBasicMaterial({
      map, color: glow ? new THREE.Color(color).multiplyScalar(1.7) : color, alphaTest: crackThreshold(generation), transparent: false, toneMapped: !glow, polygonOffset: true, polygonOffsetFactor: glow ? -3 : -2,
    }));
    // Unarmed ice shows only its first hairline fractures, in a deep ice blue.
    return { base: faces.map(map => material(map, 0x0c2a3a, 1, false)),
      glow: faces.map(map => Array.from({ length: CRACK_STAGES }, (_, stage) => material(map, AMBER, stage + 1, true))) };
  }
  private material<T extends THREE.Material>(material: T): T { this.materials.add(material); return material; }
  private glowMaterial(color: number, opacity: number, fragmentShader = glowFragment) {
    return new THREE.ShaderMaterial({ transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending,
      uniforms: { color: { value: new THREE.Color(color) }, opacity: { value: opacity } }, vertexShader: glowVertex, fragmentShader });
  }
  private mesh(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  }
  private bar(parent: THREE.Object3D, material: THREE.Material, x: number, y: number, z: number, width: number, height: number, depth = .025) {
    const mesh = this.mesh(this.box, material, parent, x, y, z); mesh.scale.set(width, height, depth); return mesh;
  }
  private random() { this.fxSeed = (Math.imul(1664525, this.fxSeed) + 1013904223) >>> 0; return this.fxSeed / 4294967296; }
  private slot(): EnemySlot { return { id: null, x: 0, y: 0, dir: 1, hitAt: null, popAt: null, vanishAt: null }; }

  /** Performance quality keeps every cue but trims burst counts and dash afterimages. */
  setQuality(high: boolean) { this.high = high; }

  private makeIcicle(): IceVisual {
    const group = new THREE.Group(); group.name = 'Falling icicle'; group.visible = false; this.group.add(group);
    const ice = new THREE.Group(); group.add(ice);
    const cone = this.geometry(new THREE.ConeGeometry(.3, 1.25, 5));
    // Physics tracks the pointed tip, so the inverted cone extends upward from y = 0.
    const shard = this.mesh(cone, this.iceMaterial, ice, 0, .625, .05); shard.rotation.z = Math.PI;
    const crown = this.mesh(this.crystalGeometry, this.iceMaterial, ice, .03, 1.155, .05); crown.scale.set(.3, .22, .25);
    const glint = this.mesh(this.crystalGeometry, this.crystalMaterial, ice, -.075, .895, .26); glint.scale.set(.04, .27, .03);
    for (const side of [-1, 1]) { const spur = this.mesh(this.crystalGeometry, this.iceMaterial, ice, side * .2, 1.02, 0); spur.scale.set(.07, .2, .07); spur.rotation.z = side * -.5; }
    // The motion streak starts above the tip so the tip remains the lowest rendered point.
    const streak = this.mesh(this.plane, this.material(this.glowMaterial(0xbff4ff, 1, streakFragment)), ice, 0, 1.2, -.05); streak.name = 'Icicle fall streak'; streak.visible = false;
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
    return { group, ice, streak, lane, edges, target, timer };
  }

  private makeBat(): BatVisual {
    const group = new THREE.Group(); group.name = 'Frost bat'; group.visible = false; this.group.add(group);
    // The pose group bobs, squashes and turns; the warning stays level on the group.
    const pose = new THREE.Group(); group.add(pose);
    const fur = this.material(new THREE.MeshStandardMaterial({ color: 0x262d5c, roughness: .7, emissive: 0x151b48, emissiveIntensity: .6 }));
    const membrane = this.material(new THREE.MeshStandardMaterial({ color: 0x5a4fb0, roughness: .55, metalness: .08, emissive: 0x2b2383, emissiveIntensity: .55, side: THREE.DoubleSide }));
    const bone = this.material(new THREE.MeshStandardMaterial({ color: 0x9fe8ff, roughness: .3, emissive: 0x3aa8d0, emissiveIntensity: .5 }));
    const eyes = this.material(new THREE.MeshBasicMaterial({ color: 0xc8fbff, toneMapped: false }));
    const pupilMaterial = this.material(new THREE.MeshBasicMaterial({ color: 0x0d1830 }));
    const fangMaterial = this.material(new THREE.MeshBasicMaterial({ color: 0xf2fbff }));
    const glow = this.mesh(this.plane, this.batGlow, pose, 0, 0, -.35); glow.scale.setScalar(2.3);
    const body = this.mesh(this.geometry(new THREE.SphereGeometry(.3, 14, 10)), fur, pose); body.scale.set(1, 1.05, .8);
    const belly = this.mesh(this.geometry(new THREE.SphereGeometry(.2, 10, 8)), this.iceMaterial, pose, 0, -.08, .15); belly.scale.set(.9, 1, .5);
    const eye = this.geometry(new THREE.SphereGeometry(.085, 10, 8));
    const earGeometry = this.geometry(new THREE.ConeGeometry(.11, .34, 4)), fangGeometry = this.geometry(new THREE.ConeGeometry(.026, .09, 4));
    for (const side of [-1, 1]) {
      const ear = this.mesh(earGeometry, fur, pose, side * .17, .33, -.02); ear.rotation.z = -side * .3;
      const inner = this.mesh(earGeometry, this.iceMaterial, pose, side * .165, .31, .04); inner.scale.setScalar(.55); inner.rotation.z = -side * .3;
      const white = this.mesh(eye, eyes, pose, side * .105, .08, .23); white.scale.set(1, 1.15, .6);
      const pupil = this.mesh(eye, pupilMaterial, pose, side * .095, .07, .27); pupil.scale.set(.42, .78, .3);
      // Angled brows give the silhouette an unmistakably hostile face.
      this.bar(pose, bone, side * .1, .185, .25, .13, .035, .03).rotation.z = side * .38;
      const fang = this.mesh(fangGeometry, fangMaterial, pose, side * .05, -.07, .25); fang.rotation.z = Math.PI;
    }
    const crest = this.mesh(this.crystalGeometry, this.iceMaterial, pose, 0, .3, .1); crest.scale.set(.07, .17, .06);
    // Two-part membrane wings hinge at the shoulder and wrist, mirrored by scale.
    const innerShape = new THREE.Shape(); innerShape.moveTo(0, .1); innerShape.quadraticCurveTo(.22, .26, .46, .24);
    innerShape.lineTo(.46, -.14); innerShape.quadraticCurveTo(.32, -.04, .22, -.2); innerShape.quadraticCurveTo(.12, -.04, 0, -.12); innerShape.closePath();
    const outerShape = new THREE.Shape(); outerShape.moveTo(0, .24); outerShape.quadraticCurveTo(.28, .38, .62, .26);
    outerShape.quadraticCurveTo(.46, .16, .5, -.02); outerShape.quadraticCurveTo(.36, .02, .3, -.2);
    outerShape.quadraticCurveTo(.18, -.06, 0, -.14); outerShape.closePath();
    const innerGeometry = this.geometry(new THREE.ShapeGeometry(innerShape, 4)), outerGeometry = this.geometry(new THREE.ShapeGeometry(outerShape, 4));
    const wings: THREE.Group[] = [], outer: THREE.Group[] = [];
    for (const side of [-1, 1]) {
      const root = new THREE.Group(); root.position.set(side * .24, .06, -.02); root.scale.x = side; pose.add(root);
      const shoulder = new THREE.Group(); root.add(shoulder);
      this.mesh(innerGeometry, membrane, shoulder);
      this.bar(shoulder, bone, .23, .19, .01, .48, .04).rotation.z = -.07;
      const wrist = new THREE.Group(); wrist.position.set(.45, 0, 0); shoulder.add(wrist);
      this.mesh(outerGeometry, membrane, wrist);
      for (const [length, angle] of [[.64, .28], [.52, -.05], [.36, -.62]]) {
        const finger = this.bar(wrist, bone, Math.cos(angle) * length / 2, .24 + Math.sin(angle) * length / 2 - .02, .01, length, .026);
        finger.rotation.z = angle;
      }
      const claw = this.mesh(this.crystalGeometry, this.iceMaterial, wrist, 0, .25, .02); claw.scale.set(.04, .08, .04);
      wings.push(shoulder); outer.push(wrist);
    }
    const warning = new THREE.Group(); warning.name = 'Bat approach warning'; group.add(warning);
    const ring = this.mesh(this.geometry(new THREE.RingGeometry(.57, .6, 32)), this.amber, warning, 0, 0, -.1); ring.scale.x = 1.4;
    this.bar(warning, this.amber, 0, .76, .2, .065, .2);
    this.bar(warning, this.amber, 0, .6, .2, .065, .06);
    return { ...this.slot(), group, pose, wings, outer, warning, eyes };
  }

  private makeWraith(): WraithVisual {
    const group = new THREE.Group(); group.name = 'Frost wraith'; group.visible = false; this.group.add(group);
    // stretch is aligned to the dash; model counter-rotates so the body stays upright.
    const stretch = new THREE.Group(); group.add(stretch);
    const model = new THREE.Group(); stretch.add(model);
    const robe = this.material(new THREE.MeshPhysicalMaterial({ color: 0x1d2850, roughness: .4, metalness: .05, clearcoat: .7, emissive: 0x2f64a8, emissiveIntensity: .4, transparent: true, opacity: .95, side: THREE.DoubleSide }));
    const eyes = this.material(new THREE.MeshBasicMaterial({ color: 0x9ffcff, toneMapped: false }));
    const voidMaterial = this.material(new THREE.MeshBasicMaterial({ color: 0x040913 }));
    const glow = this.material(this.glowMaterial(0x6fdcff, .55));
    const halo = this.mesh(this.plane, glow, model, 0, 0, -.45); halo.scale.setScalar(3.1);
    const profile = [[.001, .66], [.18, .63], [.31, .5], [.36, .27], [.33, .02], [.37, -.3], [.46, -.62], [.55, -.84]].map(([x, y]) => new THREE.Vector2(x, y));
    const robeGeometry = this.geometry(new THREE.LatheGeometry(profile, 14));
    this.mesh(robeGeometry, robe, model);
    const face = this.mesh(this.geometry(new THREE.SphereGeometry(.22, 12, 8)), voidMaterial, model, 0, .3, .17); face.scale.set(1, 1.12, .55);
    const eye = this.geometry(new THREE.SphereGeometry(.09, 8, 6));
    for (const side of [-1, 1]) { const e = this.mesh(eye, eyes, model, side * .095, .32, .3); e.scale.set(1.15, .75, .5); }
    const shardGeometry = this.geometry(new THREE.ConeGeometry(.085, .4, 4));
    const tatters = [-.44, -.26, -.08, .1, .28, .45].map((x, i) => {
      const tatter = this.mesh(shardGeometry, robe, model, x, -.95 - (i % 2) * .06, .05 + Math.abs(x) * -.2); tatter.rotation.z = Math.PI; return tatter;
    });
    const arms = [-1, 1].map(side => {
      const arm = this.mesh(shardGeometry, robe, model, side * .4, -.05, .08); arm.scale.set(.8, 1.3, .8); arm.rotation.z = Math.PI + side * .5; return arm;
    });
    for (const [x, y, s] of [[0, .76, .12], [-.14, .7, .08], [.14, .7, .08]]) { const crown = this.mesh(this.crystalGeometry, this.iceMaterial, model, x, y, .02); crown.scale.set(s * .55, s * 1.4, s * .55); }
    // Afterimages live in world space so they hold still behind a dash.
    const ghostMaterial = this.material(new THREE.MeshBasicMaterial({ color: 0x9fe6ff, transparent: true, opacity: .2, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
    const ghosts = [0, 1, 2].map(() => { const ghost = this.mesh(robeGeometry, ghostMaterial, this.group); ghost.name = 'Wraith afterimage'; ghost.visible = false; return ghost; });
    // The tell: the complete dash path, filling as the dash approaches.
    const line = new THREE.Group(); line.name = 'Wraith dash line'; line.visible = false; this.group.add(line);
    const segments = Array.from({ length: DASH_SEGMENTS }, (_, i) => this.bar(line, this.dimAmber, (i + .5) * WRAITH_DASH_LENGTH / DASH_SEGMENTS, 0, .6, WRAITH_DASH_LENGTH / DASH_SEGMENTS * .66, .17, .02));
    const arrow = new THREE.Group(); arrow.position.set(WRAITH_DASH_LENGTH, 0, .6); line.add(arrow);
    for (const side of [-1, 1]) this.bar(arrow, this.dashLit, -.22, side * .18, 0, .56, .15, .02).rotation.z = side * -.65;
    return { ...this.slot(), group, stretch, model, arms, tatters, robe, eyes, glow, halo, line, segments, arrow, ghosts, ghostMaterial, state: 'drift', stateTime: 0 };
  }

  /** Cracks belong to the ledge while their shared geometry and materials belong to this pool. */
  makeCrumble(width: number, seed = 0): CrumbleVisual {
    const group = new THREE.Group(); group.name = 'Cracked ice warning';
    const variant = Math.abs(seed) % this.crackSets.length, set = this.crackSets[variant];
    // Planes sit just proud of the thin-ice slab: its top at y 0, its front face at z .53.
    const top = (material: THREE.Material, parent: THREE.Object3D) => {
      const mesh = this.mesh(this.plane, material, parent, 0, .006, -.35); mesh.rotation.x = -Math.PI / 2; mesh.scale.set(width - .1, 1.62, 1); return mesh;
    };
    const front = (material: THREE.Material, parent: THREE.Object3D) => {
      const mesh = this.mesh(this.plane, material, parent, 0, -.15, .545); mesh.scale.set(width - .1, .28, 1); return mesh;
    };
    const cracks = new THREE.Group(); cracks.name = 'Hairline cracks'; group.add(cracks);
    top(set.base[0], cracks); front(set.base[1], cracks);
    // Once armed the fissures glow amber and grow outward in stages; the seam splits the slab near the end.
    const spread = [new THREE.Group(), new THREE.Group()];
    for (const stage of spread) { stage.visible = false; group.add(stage); }
    const glow = [top(set.glow[0][0], spread[0]), front(set.glow[1][0], spread[0])];
    const seamX = (variant ? -.12 : .08) * width;
    const seam = this.bar(spread[1], this.fissure, seamX, -.15, .56, .045, .3); seam.rotation.z = variant ? .18 : -.14;
    this.bar(spread[1], this.fissure, seamX + (variant ? -.06 : .06), .008, -.35, .05, .008, 1.5).rotation.y = variant ? .12 : -.1;
    this.bar(group, this.darkAmber, 0, -.36, .6, width * .8, .07);
    const timer = this.bar(group, this.amber, 0, -.36, .63, width * .8, .035); timer.visible = false;
    const chips = [-1, 0, 1].map(side => { const chip = this.mesh(this.crystalGeometry, this.iceMaterial, group, side * width * .29, -.45, .5); chip.scale.set(.1, .13, .09); chip.visible = false; return chip; });
    return { group, timer, cracks, chips, spread, glow, variant, wasBroken: null };
  }

  updateCrumble(visual: CrumbleVisual, state: CrumbleState, width: number, time: number, reducedMotion: boolean) {
    const active = state.remaining !== null && !state.broken;
    const remaining = Math.max(0, Math.min(1, (state.remaining ?? CRUMBLE_DELAY) / CRUMBLE_DELAY));
    const progress = active ? 1 - remaining : 0;
    visual.group.visible = !state.broken;
    visual.timer.visible = active;
    visual.timer.scale.x = width * .8 * remaining;
    visual.timer.position.x = -width * .4 * (1 - remaining);
    // Fissures grow in four steps as the countdown runs, starting the moment the ice is armed.
    const stage = Math.min(CRACK_STAGES - 1, Math.floor(progress * CRACK_STAGES));
    const set = this.crackSets[visual.variant];
    visual.glow[0].material = set.glow[0][stage]; visual.glow[1].material = set.glow[1][stage];
    visual.spread[0].visible = active;
    // The final split flickers only with motion allowed; it is steady otherwise.
    visual.spread[1].visible = active && progress > .55 && (reducedMotion || progress > .85 || Math.sin(time * 38) > -.35);
    visual.chips.forEach((chip, index) => {
      chip.visible = active && !reducedMotion;
      const fall = (time * (2.2 + progress * 2) + index * .33) % 1;
      chip.position.y = -.45 - fall * .8; chip.scale.setScalar(.08 * (1 - fall) * (1 + progress * .8));
    });
    // The ledge owns this visual; debris is spawned into the action pool on the break.
    if (visual.wasBroken === false && state.broken && !reducedMotion && visual.group.parent) {
      const { x, y } = visual.group.parent.position;
      this.shatterLedge(x, y, width, time);
    }
    visual.wasBroken = state.broken;
  }

  /** Visual-only reactions to simulation events. Nothing here feeds back into the run. */
  effect(event: GameEvent, time: number) {
    if (this.disposed) return;
    if (time < this.fxTime - 1e-6) this.clearEffects();
    this.fxTime = time;
    const motion = !this.reducedMotion;
    if (event.type === 'crumble' && motion) {
      // The first crack puffs frost off the slab.
      this.burst(event.x, event.y + .05, 8, time, { colors: [0xf2fbff, 0xbfefff], speed: 1.6, up: 1.2, size: .08, life: .55, gravity: 4 });
    } else if (event.type === 'crumble-creak' && motion) {
      // Each creak shakes loose a few shards from under the ledge.
      this.burst(event.x, event.y - .3, 4 + (event.value ?? 1) * 3, time, { colors: [0x9fe8ff, 0xe4f8ff], speed: 1.4, up: 0, size: .07, life: .6, gravity: 11 });
    }
    if (event.type === 'stomp') {
      const enemy = this.nearestEnemy(event.x, event.y - .4, 1.4);
      if (enemy) { if (motion) enemy.popAt = time; else enemy.popAt = null; }
      if (!motion) return;
      const wraith = enemy && this.wraiths.includes(enemy as WraithVisual);
      const x = enemy?.x ?? event.x, y = enemy?.y ?? event.y - .35;
      this.ring(x, y, .15, 1.9, .4, wraith ? 0xc9f3ff : 0xb9a8ff, 1, time);
      this.burst(x, y, 18, time, { colors: wraith ? [0x9ffcff, 0x2f64a8, 0xffffff] : [0x7a6fd8, 0xc8fbff, 0x8dffda], speed: 4.6, up: 2.5, size: .13, life: .6 });
      this.burst(x, y + .2, 8, time, { colors: [0xfff3c4], speed: 2.4, up: 3.5, size: .1, life: .75, gravity: 3, stretch: 2 });
    } else if (event.type === 'hurt') {
      const enemy = this.nearestEnemy(event.x, event.y + .7, 2.2);
      if (enemy) enemy.hitAt = time;
      if (motion) this.ring(event.x, event.y + .75, .15, 1.1, .28, AMBER, .75, time);
    } else if (event.type === 'icicle-shatter' && motion) {
      const flat = this.ring(event.x, event.y + .03, .15, 1.9, .42, 0xbff4ff, 1, time);
      if (flat) flat.mesh.rotation.x = -Math.PI / 2 * .82;
      this.burst(event.x, event.y + .1, 22, time, { colors: [0x88eaff, 0xdffaff, 0x5fc6e8], speed: 4.4, up: 4.6, size: .14, life: .75, gravity: 16, stretch: 1.8 });
      this.burst(event.x, event.y + .15, 7, time, { colors: [0xf2fbff], speed: 1.3, up: .9, size: .24, life: .55, gravity: -.6 });
    } else if (event.type === 'dodge' && motion) {
      // A near miss: a quick ring of mint glints around the climber.
      this.ring(event.x, event.y + .8, .4, 1.7, .45, 0x8dffda, 1, time);
      this.burst(event.x, event.y + .9, 16, time, { colors: [0x8dffda, 0xffffff, 0xa4ffdf], speed: 3.6, up: 1.2, size: .13, life: .6, gravity: 1.5, stretch: 2.6 });
    } else if (event.type === 'wraith' && motion) {
      this.burst(event.x, event.y, 12, time, { colors: [0xd9ecff, 0x8ff6ff], speed: 1.6, up: .6, size: .1, life: .8, gravity: -.8 });
    } else if (event.type === 'wraith-dash' && motion) {
      this.ring(event.x, event.y, .2, 1.9, .34, 0xffb35a, 1, time);
      this.burst(event.x, event.y, 10, time, { colors: [0xffd08a, 0xffffff], speed: 3.4, up: .4, size: .07, life: .4, gravity: 0, stretch: 2.4 });
    }
  }

  private nearestEnemy(x: number, y: number, radius: number): EnemySlot | null {
    let best: EnemySlot | null = null, distance = radius;
    for (const enemy of [...this.bats, ...this.wraiths]) {
      if (enemy.id === null || enemy.popAt !== null) continue;
      const d = Math.hypot(enemy.x - x, enemy.y - y);
      if (d < distance) { distance = d; best = enemy; }
    }
    return best;
  }

  private burst(x: number, y: number, count: number, time: number, o: { colors: number[]; speed: number; up: number; size: number; life: number; gravity?: number; stretch?: number }) {
    const total = this.high ? count : Math.ceil(count / 2);
    for (let i = 0; i < total; i++) {
      if (this.particles.length >= PARTICLE_CAPACITY) this.particles.shift();
      const angle = this.random() * Math.PI * 2, speed = o.speed * (.35 + this.random() * .65);
      this.particles.push({ x, y, z: .25, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed * .6 + o.up * this.random(), vz: (this.random() - .5) * 2,
        born: time, life: o.life * (.6 + this.random() * .4), size: o.size * (.6 + this.random() * .6), spin: (this.random() - .5) * 14,
        gravity: o.gravity ?? 9, color: new THREE.Color(o.colors[i % o.colors.length]), stretch: o.stretch ?? 1 });
    }
  }

  private ring(x: number, y: number, from: number, to: number, life: number, color: number, opacity: number, time: number) {
    const ring = this.rings.find(r => !r.active) ?? this.rings.reduce((a, b) => (a.born < b.born ? a : b));
    Object.assign(ring, { born: time, life, from, to, opacity, active: true });
    ring.material.color.setHex(color); ring.mesh.position.set(x, y, .3); ring.mesh.rotation.set(0, 0, 0); ring.mesh.visible = true;
    return ring;
  }

  /** Thin ice breaks into slabs of itself that tumble away, with shards, frost powder and a flash of cold air. */
  private shatterLedge(x: number, y: number, width: number, time: number) {
    const count = this.high ? 14 : 8, palette = [0x9fdcf0, 0x6fc6e3, 0xbfe9f7, 0x5fbfe0];
    for (let i = 0; i < count; i++) {
      if (this.chunks.length >= CHUNK_CAPACITY) this.chunks.shift();
      const along = (i + .5) / count - .5, big = i % 3 !== 2;
      this.chunks.push({ x: x + along * width * .9, y: y - .1 - this.random() * .12, z: -.35 + (this.random() - .5) * .9,
        vx: along * 2.8 + (this.random() - .5) * 1.4, vy: .4 + this.random() * 2, vz: (this.random() - .5) * 1.2,
        born: time, life: 1.05 + this.random() * .45, w: width / count * (big ? 1.25 : .7), h: big ? .16 + this.random() * .12 : .1,
        d: big ? .5 + this.random() * .6 : .3, spin: (this.random() - .5) * 10, tumble: (this.random() - .5) * 7,
        color: new THREE.Color(palette[i % palette.length]) });
    }
    this.burst(x, y - .1, this.high ? 22 : 12, time, { colors: [0xdffaff, 0x88eaff, 0xffffff], speed: 3.4, up: 2.4, size: .09, life: .7, gravity: 12, stretch: 1.6 });
    this.burst(x, y + .05, this.high ? 14 : 8, time, { colors: [0xf2fbff], speed: 1.2, up: .6, size: .12, life: 1.1, gravity: 1.5 });
    const dust = this.ring(x, y - .05, .3, Math.max(1.6, width * .6), .5, 0xd9f6ff, .6, time);
    if (dust) dust.mesh.rotation.x = -Math.PI / 2 * .82;
  }

  private clearEffects() {
    this.particles.length = 0; this.chunks.length = 0;
    for (const ring of this.rings) { ring.active = false; ring.mesh.visible = false; }
    for (const enemy of [...this.bats, ...this.wraiths]) { enemy.id = null; enemy.popAt = enemy.hitAt = enemy.vanishAt = null; }
  }

  update(state: ActionSceneState, reducedMotion: boolean) {
    if (this.disposed) return;
    const { action, time } = state, active = state.status !== 'ready';
    this.reducedMotion = reducedMotion;
    if (!active || time < this.fxTime - 1e-6) this.clearEffects();
    const dt = Math.min(.1, Math.max(0, time - this.fxTime)); this.fxTime = time;
    if (reducedMotion) { this.particles.length = 0; this.chunks.length = 0; for (const ring of this.rings) { ring.active = false; ring.mesh.visible = false; } }
    const showWarnings = state.showHazardWarnings ?? state.rulesVersion < 8;
    this.icicles.forEach((visual, index) => {
      const icicle = action.icicles[index]; visual.group.visible = active && !!icicle;
      if (!icicle) return;
      const warning = icicle.state === 'warning', height = Math.max(1, icicle.spawnY - icicle.targetY);
      visual.group.position.set(icicle.x, icicle.targetY, 0);
      visual.ice.position.set(warning && !reducedMotion ? Math.sin(time * 37 + icicle.id) * .055 : 0, icicle.y - icicle.targetY, 0);
      visual.ice.rotation.z = warning && !reducedMotion ? Math.sin(time * 23 + icicle.id) * .035 : 0;
      const streak = Math.min(3.6, Math.abs(icicle.vy) * .16);
      visual.streak.visible = !warning && !reducedMotion && streak > .4;
      visual.streak.scale.set(.6, streak, 1); visual.streak.position.y = 1.1 + streak / 2;
      visual.lane.visible = showWarnings && warning; visual.lane.position.y = height / 2; visual.lane.scale.y = height;
      for (const edge of visual.edges) { edge.visible = showWarnings && warning; edge.position.y = height / 2; edge.scale.y = height; }
      visual.target.visible = showWarnings && (warning || icicle.y >= icicle.targetY - .8);
      visual.timer.visible = showWarnings && warning;
      const progress = Math.max(.025, Math.min(1, icicle.warningTime / ICICLE_WARNING_TIME));
      visual.timer.scale.x = 1.16 * progress;
    });
    this.updateBats(state, active, showWarnings, reducedMotion);
    this.updateWraiths(state, active, reducedMotion);
    this.crystals.forEach((visual, index) => {
      const crystal = action.crystals[index]; visual.visible = active && !!crystal && !crystal.collected;
      if (!crystal) return;
      visual.position.set(crystal.x, crystal.y + (reducedMotion ? 0 : Math.sin(time * 2.8 + crystal.id) * .06), .15);
      visual.rotation.y = reducedMotion ? Math.PI / 4 : time * 1.6 + crystal.id;
    });
    const frenzy = active && action.frenzyTime > 0;
    this.shield.group.position.set(state.x, state.y + .78, .15);
    this.shield.update(active ? action.invulnerableTime : 0, time, reducedMotion);
    this.encounter.visible = active && action.encounter?.kind === 'ice-shower'; this.encounter.position.y = state.cameraY;
    this.updateTrail(state, frenzy, reducedMotion);
    if (!reducedMotion) this.updateEffects(time, dt);
    else { this.particleMesh.visible = this.chunkMesh.visible = false; }
  }

  /** Match live ids to pooled visuals; missing ids either pop, fade, or free the slot. */
  private claim<T extends EnemySlot>(pool: T[], ids: Set<number>, time: number, reducedMotion: boolean) {
    for (const visual of pool) {
      if (visual.id === null || ids.has(visual.id)) continue;
      if (reducedMotion) { visual.id = null; visual.popAt = visual.vanishAt = null; continue; }
      if (visual.popAt !== null) { if (time - visual.popAt > BAT_POP) { visual.id = null; visual.popAt = null; } continue; }
      if (visual.vanishAt === null) visual.vanishAt = time;
      if (time - visual.vanishAt > VANISH || Math.abs(visual.x) > 6.9) { visual.id = null; visual.vanishAt = null; }
    }
    const map = new Map<number, T>();
    for (const visual of pool) if (visual.id !== null && ids.has(visual.id)) map.set(visual.id, visual);
    for (const id of ids) {
      if (map.has(id)) continue;
      const free = pool.find(visual => visual.id === null);
      if (!free) continue;
      Object.assign(free, { id, hitAt: null, popAt: null, vanishAt: null });
      map.set(id, free);
    }
    return map;
  }

  private updateBats(state: ActionSceneState, active: boolean, showWarnings: boolean, reducedMotion: boolean) {
    const { time } = state, live = state.action.bats.filter(bat => bat.alive);
    const map = this.claim(this.bats, new Set(live.map(bat => bat.id)), time, reducedMotion);
    for (const visual of this.bats) visual.group.visible = false;
    for (const bat of live) {
      const visual = map.get(bat.id); if (!visual) continue;
      visual.x = bat.x; visual.y = bat.y; visual.dir = -Math.sign(bat.originX) || 1;
      visual.group.visible = active;
      visual.group.position.set(bat.x, bat.y, .05);
      visual.warning.visible = showWarnings && bat.warningTime > 0;
      // Bats prepare outside the walls; their advance notice belongs inside the playfield.
      visual.warning.position.x = THREE.MathUtils.clamp(bat.x, -5.5, 5.5) - bat.x;
      this.poseBat(visual, time, reducedMotion, bat.phase);
    }
    // Finished pops and fades keep their last position.
    for (const visual of this.bats) {
      if (visual.id === null || map.has(visual.id) || !active) continue;
      visual.group.visible = true; visual.warning.visible = false;
      visual.group.position.set(visual.x, visual.y, .05);
      this.poseBat(visual, time, reducedMotion, 0);
    }
  }

  private poseBat(visual: BatVisual, time: number, reducedMotion: boolean, phase: number) {
    const hit = visual.hitAt !== null && time - visual.hitAt < HIT_FLASH ? 1 - (time - visual.hitAt) / HIT_FLASH : 0;
    visual.eyes.color.setHex(hit > 0 ? AMBER : 0xc8fbff);
    if (reducedMotion) {
      visual.pose.position.set(0, 0, 0); visual.pose.rotation.set(0, 0, 0); visual.pose.scale.setScalar(1);
      visual.wings.forEach(wing => { wing.rotation.z = .12; }); visual.outer.forEach(wing => { wing.rotation.z = -.1; });
      return;
    }
    const flap = Math.sin(time * 15 + phase * 2 + (visual.id ?? 0));
    // Down-strokes lift the body; the wrist trails the shoulder for a whip-like beat.
    visual.pose.position.set(0, -flap * .07, 0);
    visual.pose.rotation.set(0, visual.dir * .35, visual.dir * -.1 + Math.sin(time * 3 + phase) * .06);
    visual.wings.forEach(wing => { wing.rotation.z = flap * .75 + .08; });
    visual.outer.forEach(wing => { wing.rotation.z = Math.sin(time * 15 + phase * 2 + (visual.id ?? 0) - .9) * .6 - .05; });
    let sx = 1 + flap * .04, sy = 1 - flap * .05;
    if (hit > 0) { const pulse = Math.sin(hit * Math.PI) * .28; sx += pulse; sy += pulse; visual.pose.position.x = -visual.dir * hit * .18; }
    if (visual.popAt !== null) {
      // Stomp pop: flatten under the boot, then burst away while spinning.
      const t = Math.min(1, (time - visual.popAt) / BAT_POP);
      if (t < .3) { sx = 1 + t / .3 * .75; sy = 1 - t / .3 * .72; }
      else { const shrink = 1 - (t - .3) / .7; sx = 1.75 * shrink; sy = .28 * shrink + .02; visual.pose.rotation.z += (t - .3) * 6; }
      visual.pose.position.y = -.12 * Math.min(1, t / .3);
    } else if (visual.vanishAt !== null) {
      const t = Math.min(1, (time - visual.vanishAt) / VANISH); sx *= 1 - t; sy *= 1 - t;
    }
    visual.pose.scale.set(Math.max(.001, sx), Math.max(.001, sy), 1);
  }

  private updateWraiths(state: ActionSceneState, active: boolean, reducedMotion: boolean) {
    const { time } = state, live = (state.action.wraiths ?? []).filter(wraith => wraith.alive);
    const map = this.claim(this.wraiths, new Set(live.map(wraith => wraith.id)), time, reducedMotion);
    for (const visual of this.wraiths) { visual.group.visible = visual.line.visible = false; for (const ghost of visual.ghosts) ghost.visible = false; }
    for (const wraith of live) {
      const visual = map.get(wraith.id); if (!visual) continue;
      visual.x = wraith.x; visual.y = wraith.y; visual.state = wraith.state; visual.stateTime = wraith.time;
      visual.group.visible = active;
      this.poseWraith(visual, wraith, time, reducedMotion);
    }
    for (const visual of this.wraiths) {
      if (visual.id === null || map.has(visual.id) || !active) continue;
      visual.group.visible = true;
      this.poseWraith(visual, null, time, reducedMotion);
    }
  }

  private poseWraith(visual: WraithVisual, wraith: FrostWraith | null, time: number, reducedMotion: boolean) {
    const state = wraith?.state ?? visual.state, t = wraith?.time ?? visual.stateTime;
    const hit = visual.hitAt !== null && time - visual.hitAt < HIT_FLASH ? 1 - (time - visual.hitAt) / HIT_FLASH : 0;
    const tell = state === 'tell' ? Math.min(1, t / WRAITH_TELL_TIME) : 0;
    const angle = wraith ? Math.atan2(wraith.dirY, wraith.dirX) : 0;
    let x = visual.x, y = visual.y, opacity = .95, stretch = 1, glow = .55, glowColor = 0x6fdcff, eyeColor = 0x8ff6ff, scale = 1;
    if (state === 'tell') {
      // The tell: amber eyes and halo that swell, arms raised, a slight wind-up away from the line.
      glowColor = AMBER; eyeColor = 0xffd08a; glow = .55 + tell * .7; scale = 1 + tell * .12;
      if (wraith && !reducedMotion) { x -= wraith.dirX * tell * .22; y -= wraith.dirY * tell * .22; x += Math.sin(time * 55) * .03 * tell; }
    } else if (state === 'dash') {
      glowColor = 0xfff0d0; eyeColor = 0xffffff; glow = 1.1; stretch = reducedMotion ? 1 : 1.55;
    } else if (state === 'fade') {
      const fade = Math.min(1, t / WRAITH_FADE_TIME); opacity = .95 * (1 - fade); glow = .5 * (1 - fade); scale = 1 + fade * .25;
    } else if (!reducedMotion) y += Math.sin(time * 2.6 + (visual.id ?? 0)) * .12;
    if (visual.popAt !== null && !reducedMotion) {
      const p = Math.min(1, (time - visual.popAt) / BAT_POP);
      opacity = .95 * (1 - p); scale = p < .3 ? 1 : 1 - (p - .3) * 1.2; glow = .9 * (1 - p);
      visual.model.scale.set(1 + Math.min(1, p / .3) * .6, 1 - Math.min(1, p / .3) * .6, 1);
    } else if (visual.vanishAt !== null && !reducedMotion) {
      const p = Math.min(1, (time - visual.vanishAt) / VANISH); opacity *= 1 - p; glow *= 1 - p; scale *= 1 + p * .3;
      visual.model.scale.setScalar(1);
    } else visual.model.scale.setScalar(1);
    if (hit > 0) { eyeColor = AMBER; scale *= 1 + Math.sin(hit * Math.PI) * .2; }
    visual.group.position.set(x, y, .3);
    visual.group.scale.setScalar(Math.max(.001, scale));
    visual.stretch.rotation.z = angle; visual.stretch.scale.set(stretch, 1 / Math.sqrt(stretch), 1);
    visual.model.rotation.z = -angle;
    // The robe itself heats to amber through the tell, then flashes white on the dash.
    visual.robe.opacity = opacity;
    visual.robe.emissive.setHex(state === 'tell' ? 0xff8f2a : state === 'dash' ? 0x9fdcff : 0x2f64a8);
    visual.robe.emissiveIntensity = state === 'tell' ? .35 + tell * 1.1 : state === 'dash' ? 1.1 : .4;
    visual.eyes.color.setHex(eyeColor);
    (visual.glow.uniforms.color.value as THREE.Color).setHex(glowColor);
    visual.glow.uniforms.opacity.value = Math.min(1, reducedMotion ? glow : glow * (1 + Math.sin(time * 18) * .12 * tell));
    visual.arms.forEach((arm, i) => {
      const side = i === 0 ? -1 : 1, sway = reducedMotion ? 0 : Math.sin(time * 3.1 + i) * .12;
      arm.rotation.z = Math.PI + side * (.5 + tell * 1.1 + sway);
    });
    visual.tatters.forEach((tatter, i) => { tatter.rotation.z = Math.PI + (reducedMotion ? 0 : Math.sin(time * 5 + i * 1.7) * .22) + (state === 'dash' ? -Math.sign(wraith?.dirX ?? 0) * .5 : 0); });
    // The dash line is drawn from the locked start along the locked direction.
    const lineVisible = !!wraith && (state === 'tell' || (state === 'dash' && t < WRAITH_DASH_TIME * .85)) && visual.popAt === null;
    visual.line.visible = lineVisible && visual.group.visible;
    if (wraith && lineVisible) {
      visual.line.position.set(wraith.startX, wraith.startY, 0); visual.line.rotation.z = angle;
      const fill = state === 'tell' ? tell : 1;
      visual.segments.forEach((segment, i) => { segment.material = (i + 1) / DASH_SEGMENTS <= fill + 1e-6 ? this.dashLit : this.dimAmber; });
      visual.arrow.visible = true;
    }
    const trails = state === 'dash' && !reducedMotion && this.high && !!wraith;
    visual.ghosts.forEach((ghost, i) => {
      ghost.visible = trails && visual.group.visible;
      if (!ghost.visible || !wraith) return;
      const back = (i + 1) * .55;
      ghost.position.set(wraith.x - wraith.dirX * back, wraith.y - wraith.dirY * back, -.05 - i * .02); ghost.scale.setScalar(1 - i * .12);
    });
    visual.ghostMaterial.opacity = .22;
  }

  private updateEffects(time: number, dt: number) {
    this.particles = this.particles.filter(p => time - p.born < p.life);
    this.particles.forEach((p, index) => {
      p.vy -= p.gravity * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const age = Math.max(0, time - p.born) / p.life, size = p.size * Math.pow(1 - age, .7);
      this.transform.position.set(p.x, p.y, p.z);
      this.transform.rotation.set(0, 0, p.stretch > 1 ? Math.atan2(p.vy, p.vx) - Math.PI / 2 : p.spin * age);
      this.transform.scale.set(size, size * p.stretch, size);
      this.transform.updateMatrix(); this.particleMesh.setMatrixAt(index, this.transform.matrix); this.particleMesh.setColorAt(index, p.color);
    });
    this.particleMesh.count = this.particles.length; this.particleMesh.visible = this.particles.length > 0;
    this.particleMesh.instanceMatrix.needsUpdate = true; if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    this.chunks = this.chunks.filter(c => time - c.born < c.life);
    this.chunks.forEach((c, index) => {
      c.vy -= 14 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
      const age = Math.max(0, time - c.born), shrink = Math.min(1, (c.life - age) / .25);
      this.transform.position.set(c.x, c.y, c.z); this.transform.rotation.set(age * c.tumble, age * c.spin * .3, age * c.spin);
      this.transform.scale.set(c.w * shrink, c.h * shrink, c.d * shrink);
      this.transform.updateMatrix(); this.chunkMesh.setMatrixAt(index, this.transform.matrix); this.chunkMesh.setColorAt(index, c.color);
    });
    this.chunkMesh.count = this.chunks.length; this.chunkMesh.visible = this.chunks.length > 0;
    this.chunkMesh.instanceMatrix.needsUpdate = true; if (this.chunkMesh.instanceColor) this.chunkMesh.instanceColor.needsUpdate = true;
    for (const ring of this.rings) {
      if (!ring.active) continue;
      const age = (time - ring.born) / ring.life;
      if (age >= 1) { ring.active = false; ring.mesh.visible = false; continue; }
      const ease = 1 - Math.pow(1 - age, 3);
      ring.mesh.scale.setScalar(ring.from + (ring.to - ring.from) * ease); ring.material.opacity = ring.opacity * (1 - age);
    }
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
    this.shield.dispose(); this.trail.dispose(); this.particleMesh.dispose(); this.chunkMesh.dispose();
    this.geometries.forEach(geometry => geometry.dispose()); this.materials.forEach(material => material.dispose());
    this.textures.forEach(texture => texture.dispose());
    this.group.clear(); this.trailCrystals.length = 0; this.particles.length = 0; this.chunks.length = 0;
  }
}
