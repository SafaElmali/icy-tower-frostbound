import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { applyCharacterOutfit } from './character-outfit';
import { cloneRaceCharacter, PlayerNameplate } from './race-character';
import { ClimberMotion } from './climber-motion';
import { ComboStarTrail } from './combo-star-trail';
import { cosmeticFor, normalizeOutfit, type Outfit } from './outfits';
import { TowerInterior } from './tower-interior';
import { PersonalBestMarker } from './personal-best-marker';
import { LandingGuideWorld, type LandingGuideTarget } from './landing-guide-world';
import { getTowerSection } from './tower-sections';
import { TowerEngine, type GameEvent, type Platform } from './tower-engine';
import { TowerActionWorld, type CrumbleVisual } from './tower-action-world';
import { RecoveryShield } from './recovery-shield';

type ClimberView = {
  engine: Pick<TowerEngine, 'x' | 'y' | 'vx' | 'vy' | 'facing' | 'grounded' | 'time' | 'status'>;
  motion: ClimberMotion; finished: boolean;
  appearance?: 'player'; outfit?: Outfit; name?: string; protected?: boolean;
};

type FloorPlaque = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
type Ledge = { group: THREE.Group; gem?: THREE.Mesh; plaque?: FloorPlaque; crumble?: CrumbleVisual; platform: Platform; id: number };
type Fleck = { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number; duration: number };
const damp = (a: number, b: number, rate: number, dt: number) => THREE.MathUtils.lerp(a, b, 1 - Math.exp(-rate * dt));

export class TowerWorld {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(34, 1, .1, 110);
  root = new THREE.Group();
  character = new THREE.Group();
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private ledges = new Map<number, Ledge>();
  private observer: ResizeObserver;
  private high = true;
  private cameraY = 5.2;
  private shake = 0;
  private reducedMotion = false;
  private squish = 0;
  private rotation = .12;
  private legs: THREE.Object3D[] = [];
  private arms: THREE.Object3D[] = [];
  private tumble = new THREE.Group();
  private motion = new ClimberMotion();
  private rivals: { tumble: THREE.Group; character: THREE.Group; arms: THREE.Object3D[]; legs: THREE.Object3D[]; nameplate: PlayerNameplate; shield: RecoveryShield; outfitKey: string }[] = [];
  private ghostTumble = new THREE.Group();
  private ghostCharacter = new THREE.Group();
  private ghostArms: THREE.Object3D[] = [];
  private ghostLegs: THREE.Object3D[] = [];
  private starTrail = new ComboStarTrail();
  private actionWorld = new TowerActionWorld();
  private lastEngineTime = 0;
  private interior: TowerInterior;
  private bestMarker = new PersonalBestMarker();
  private landingGuide = new LandingGuideWorld();
  private sectionColor = new THREE.Color();
  private rim: THREE.DirectionalLight;
  private routeMat = new THREE.MeshStandardMaterial({ color: 0xe0b762, roughness: .55, emissive: 0x75511a, emissiveIntensity: .18 });
  private cameraX = 0;
  private flecks: Fleck[] = [];
  private columns = new THREE.Group();
  private snow: THREE.Points;
  private snowPositions: Float32Array;
  private snowSeeds: Float32Array;
  private frost: THREE.Mesh;
  private glow: THREE.PointLight;
  private key: THREE.DirectionalLight;
  private disposed = false;
  private env: THREE.WebGLRenderTarget;
  private stone: THREE.MeshStandardMaterial;
  private snowMat = new THREE.MeshStandardMaterial({ color: 0xc2dfdf, roughness: .79, metalness: .03 });
  private crackedIceMat = new THREE.MeshPhysicalMaterial({ color: 0xd6b779, roughness: .35, metalness: .12, clearcoat: .8, emissive: 0x765020, emissiveIntensity: .32 });
  private iceMat: THREE.MeshPhysicalMaterial;
  private gold = new THREE.MeshStandardMaterial({ color: 0x9a7350, metalness: .8, roughness: .38 });
  private springMat = new THREE.MeshStandardMaterial({ color: 0xff70bf, emissive: 0xb02677, emissiveIntensity: .55, metalness: .4, roughness: .3 });
  private partyGemMat = new THREE.MeshPhysicalMaterial({ color: 0xffbcf0, emissive: 0xed64c3, emissiveIntensity: 1.5, metalness: .35, roughness: .05, clearcoat: 1 });
  private gemMat = new THREE.MeshPhysicalMaterial({ color: 0x69e6ed, emissive: 0x58b9cd, emissiveIntensity: 1.5, metalness: .35, roughness: .05, clearcoat: 1 });
  private fleckGeometry = new THREE.IcosahedronGeometry(.04, 0);
  private fleckMat = new THREE.MeshBasicMaterial({ color: 0xadeaff, transparent: true });
  private impactFleckMat = new THREE.MeshBasicMaterial({ color: 0xffc477, transparent: true, toneMapped: false });
  private frenzyFleckMat = new THREE.MeshBasicMaterial({ color: 0x8affd5, transparent: true, toneMapped: false });
  private groundShadow: THREE.Mesh;

  constructor(canvas: HTMLCanvasElement, performanceMode = false) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !performanceMode, alpha: true, powerPreference: performanceMode ? 'low-power' : 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, performanceMode ? 1 : 1.65));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.background = new THREE.Color(0x07121e);
    this.scene.fog = new THREE.FogExp2(0x101f2c, .018);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const environment = new RoomEnvironment();
    this.env = pmrem.fromScene(environment, .04);
    this.scene.environment = this.env.texture; this.scene.environmentIntensity = .36;
    environment.dispose(); pmrem.dispose();
    this.scene.add(new THREE.HemisphereLight(0x9de5ff, 0x192330, 2));
    this.key = new THREE.DirectionalLight(0xe0f6ff, 3.3); this.key.position.set(-4, 10, 8);
    this.key.castShadow = true; this.key.shadow.mapSize.set(1024, 1024);
    Object.assign(this.key.shadow.camera, { left: -10, right: 10, top: 12, bottom: -12, far: 45, near: .1 });
    this.key.shadow.bias = -.0006;
    this.scene.add(this.key, this.key.target);
    this.rim = new THREE.DirectionalLight(0x58cfff, 3.5); this.rim.position.set(6, 8, -6); this.scene.add(this.rim);
    this.glow = new THREE.PointLight(0xffc692, 5, 8, 1.3); this.scene.add(this.glow);
    this.scene.add(this.root); this.root.add(this.tumble, this.columns, this.starTrail.mesh, this.bestMarker.group, this.actionWorld.group, this.landingGuide.group); this.tumble.add(this.character);
    this.camera.position.set(0, 5.2, 26); this.camera.lookAt(0, 5.2, 0);
    const stoneNoise = this.makeNoiseTexture();
    this.stone = new THREE.MeshStandardMaterial({ color: 0x405a65, roughness: .89, metalness: .08, bumpMap: stoneNoise, bumpScale: .12, roughnessMap: stoneNoise });
    this.iceMat = new THREE.MeshPhysicalMaterial({ color: 0x4cbbcf, roughness: .2, metalness: .22, clearcoat: 1, clearcoatRoughness: .16, emissive: 0x185160, emissiveIntensity: .45, bumpMap: stoneNoise, bumpScale: .055 });
    this.fallbackCharacter(); this.buildColumns(); this.batchMeshes(this.columns);
    this.interior = new TowerInterior(stoneNoise); this.root.add(this.interior.group);
    const shadowTexture = this.radialTexture();
    this.groundShadow = new THREE.Mesh(new THREE.PlaneGeometry(1.6, .42), new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, opacity: .48, depthWrite: false, color: 0x071320 }));
    this.groundShadow.rotation.x = -Math.PI / 2; this.root.add(this.groundShadow);
    const count = 800;
    this.snowPositions = new Float32Array(count * 3); this.snowSeeds = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) { this.snowSeeds[i * 3] = Math.random() * 38 - 19; this.snowSeeds[i * 3 + 1] = Math.random() * 34 - 17; this.snowSeeds[i * 3 + 2] = Math.random() * 16 - 7; }
    const snowGeo = new THREE.BufferGeometry(); snowGeo.setAttribute('position', new THREE.BufferAttribute(this.snowPositions, 3));
    this.snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ size: .055, map: shadowTexture, transparent: true, opacity: .64, depthWrite: false, color: 0xc8e9f5, blending: THREE.AdditiveBlending }));
    this.snow.frustumCulled = false; this.scene.add(this.snow);
    this.frost = new THREE.Mesh(new THREE.PlaneGeometry(48, 18), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { time: { value: 0 } }, vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: 'varying vec2 vUv; uniform float time; void main(){float wave=sin(vUv.x*29.+time)*.025+sin(vUv.x*58.-time*.7)*.015; float a=(1.-smoothstep(.62,1.,vUv.y+wave));gl_FragColor=vec4(mix(vec3(.12,.3,.39),vec3(.28,.64,.73),vUv.y),a*.9);}' }));
    this.frost.position.z = 2; this.root.add(this.frost);
    this.composer = new EffectComposer(this.renderer); this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1024, 768), .32, .5, .85); this.composer.addPass(this.bloom); this.composer.addPass(new OutputPass());
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(canvas); this.resize();
  }
  async load() {
    // The custom GLB is optional while the playable model remains available.
    try {
      // A stalled optional model must not leave Play disabled indefinitely.
      const response = await fetch('/assets/harold.glb', { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error('Climber model unavailable');
      const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '/assets/');
      if (this.disposed) { gltf.scene.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose(); } }); return; }
      this.character.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose(); } });
      this.character.clear();
      const model = gltf.scene; model.scale.setScalar(1);
      model.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.character.add(model);
      this.legs = ['Leg_L', 'Leg_R'].map(n => model.getObjectByName(n)).filter((x): x is THREE.Object3D => !!x);
      this.arms = ['Arm_L', 'Arm_R'].map(n => model.getObjectByName(n)).filter((x): x is THREE.Object3D => !!x);
    } catch { /* The built-in Harold model keeps the game playable offline. */ }
    if (this.disposed) return;
    this.ghostCharacter = this.character.clone(true);
    const ghostMaterial = new THREE.MeshBasicMaterial({ color: 0x91dfff, transparent: true, opacity: .32, depthWrite: false });
    this.ghostCharacter.traverse(o => {
      if (o instanceof THREE.Mesh) { o.material = ghostMaterial; o.castShadow = false; o.receiveShadow = false; }
    });
    this.ghostArms = ['Arm_L', 'Arm_R'].map(n => this.ghostCharacter.getObjectByName(n)).filter((x): x is THREE.Object3D => !!x);
    this.ghostLegs = ['Leg_L', 'Leg_R'].map(n => this.ghostCharacter.getObjectByName(n)).filter((x): x is THREE.Object3D => !!x);
    this.ghostTumble.add(this.ghostCharacter); this.ghostTumble.visible = false; this.root.add(this.ghostTumble);
    for (let index = 0; index < 3; index++) {
      const character = cloneRaceCharacter(this.character), tumble = new THREE.Group();
      const nameplate = new PlayerNameplate(); this.root.add(nameplate.sprite);
      const shield = new RecoveryShield(); this.root.add(shield.group);
      tumble.add(character); tumble.visible = false; this.root.add(tumble);
      this.rivals.push({ tumble, character, nameplate, shield, outfitKey: '',
        arms: ['Arm_L', 'Arm_R'].map(n => character.getObjectByName(n)).filter((o): o is THREE.Object3D => !!o),
        legs: ['Leg_L', 'Leg_R'].map(n => character.getObjectByName(n)).filter((o): o is THREE.Object3D => !!o) });
    }
  }
  setOutfit(value: Outfit) {
    const outfit = normalizeOutfit(value);
    applyCharacterOutfit(this.character, outfit);
    this.starTrail.setPalette(cosmeticFor('trail', outfit.trail).colors);
  }
  private makeNoiseTexture() {
    const size = 128, data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const v = 100 + Math.random() * 100 + Math.sin(x * .38 + Math.sin(y * .2)) * 25;
      data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
    }
    const t = new THREE.DataTexture(data, size, size); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true; return t;
  }
  private radialTexture() {
    const data = new Uint8Array(64 * 64 * 4);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const i = (y * 64 + x) * 4; const d = Math.hypot(x - 31.5, y - 31.5) / 32; data[i] = data[i + 1] = data[i + 2] = 255; data[i + 3] = Math.max(0, (1 - d) ** 3) * 255; }
    const t = new THREE.DataTexture(data, 64, 64); t.needsUpdate = true; return t;
  }
  private mesh(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  }
  private fallbackCharacter() {
    const green = new THREE.MeshStandardMaterial({ name: 'Classic bright green sweatshirt', color: 0x16bb2c, roughness: .85 });
    const blue = new THREE.MeshStandardMaterial({ name: 'Harold blue knit beanie', color: 0x285fac, roughness: .86 });
    const olive = new THREE.MeshStandardMaterial({ color: 0x727537, roughness: .9 });
    const brown = new THREE.MeshStandardMaterial({ color: 0x69422d, roughness: .78 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xf6ab75, roughness: .8 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xe8c753, roughness: .65 });
    this.mesh(new THREE.CapsuleGeometry(.26, .12, 6, 16), green, this.character, 0, .7);
    const head = this.mesh(new THREE.SphereGeometry(.29, 24, 16), skin, this.character, 0, 1.09); head.scale.y = .72;
    const beanie = this.mesh(new THREE.SphereGeometry(.32, 24, 16), blue, this.character, -.035, 1.35); beanie.scale.set(1, 1.04, .82);
    this.mesh(new RoundedBoxGeometry(.64, .10, .51, 4, .045), blue, this.character, 0, 1.18);
    this.mesh(new THREE.SphereGeometry(.079, 16, 12), skin, this.character, 0, 1.10, .255);
    this.mesh(new THREE.BoxGeometry(.14, .09, .015), gold, this.character, 0, .73, .269);
    for (const side of [-1, 1]) {
      this.mesh(new THREE.SphereGeometry(.075, 12, 8), skin, this.character, side * .3, 1.1);
      const leg = new THREE.Group(); leg.name = side < 0 ? 'Leg_L' : 'Leg_R'; leg.position.set(side * .145, .48, 0); this.character.add(leg); this.legs.push(leg);
      this.mesh(new THREE.CapsuleGeometry(.115, .12, 4, 12), olive, leg, 0, -.17);
      this.mesh(new RoundedBoxGeometry(.27, .16, .35, 3, .06), brown, leg, 0, -.40, .065);
      const arm = new THREE.Group(); arm.name = side < 0 ? 'Arm_L' : 'Arm_R'; arm.position.set(side * .28, .82, 0); this.character.add(arm); this.arms.push(arm);
      this.mesh(new THREE.CapsuleGeometry(.1, .17, 4, 12), green, arm, side * .04, -.16);
      this.mesh(new THREE.SphereGeometry(.075, 12, 8), skin, arm, side * .04, -.34);
    }
  }
  private buildColumns() {
    for (const x of [-7.15, 7.15]) {
      for (let y = -12; y < 40; y += 2.5) {
        const block = this.mesh(new RoundedBoxGeometry(.65, 2.46, 1.4, 2, .08), this.stone, this.columns, x, y, -.6);
        block.rotation.y = Math.sign(x) * .12;
        this.mesh(new THREE.BoxGeometry(.85, .16, 1.7), this.stone, this.columns, x, y + 1.15, -.6);
        this.mesh(new THREE.CylinderGeometry(.09, .09, 2.4, 10), this.iceMat, this.columns, x - Math.sign(x) * .3, y, .06);
      }
    }
  }
  private batchMeshes(group: THREE.Group, excluded?: THREE.Mesh) {
    const batches = new Map<THREE.Material, THREE.Mesh[]>();
    for (const child of group.children) {
      if (!(child instanceof THREE.Mesh) || child === excluded || Array.isArray(child.material)) continue;
      const list = batches.get(child.material) ?? []; list.push(child); batches.set(child.material, list);
    }
    for (const [material, meshes] of batches) {
      if (meshes.length < 2) continue;
      const geometries = meshes.map(mesh => { mesh.updateMatrix(); const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone(); return geometry.applyMatrix4(mesh.matrix); });
      const merged = mergeGeometries(geometries, false);
      geometries.forEach(g => g.dispose());
      if (!merged) continue;
      meshes.forEach(mesh => { group.remove(mesh); mesh.geometry.dispose(); });
      this.mesh(merged, material, group);
    }
  }
  private makeFloorPlaque(id: number, group: THREE.Group): FloorPlaque {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 320;
    const ctx = canvas.getContext('2d')!;
    const wood = ctx.createLinearGradient(0, 0, 0, 320);
    wood.addColorStop(0, '#93663b'); wood.addColorStop(.5, '#694525'); wood.addColorStop(1, '#4b2e1a');
    ctx.fillStyle = wood; ctx.fillRect(0, 0, 512, 320);
    // Horizontal seams give the sign a wooden-plank face, like the original milestones.
    for (const y of [80, 160, 240]) {
      ctx.fillStyle = '#3b271a'; ctx.fillRect(0, y, 512, 5);
      ctx.fillStyle = '#a47a47'; ctx.fillRect(0, y + 5, 512, 2);
    }
    ctx.strokeStyle = '#c3985c'; ctx.lineWidth = 9; ctx.strokeRect(13, 13, 486, 294);
    ctx.font = `900 ${Math.min(190, 640 / String(id).length)}px Georgia, serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = '#28190f'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 6;
    ctx.fillStyle = '#fff0c3'; ctx.fillText(String(id), 256, 168, 434);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const width = 1.22, height = .76;
    this.mesh(new RoundedBoxGeometry(width + .1, height + .1, .18, 2, .055), this.gold, group, 0, -.4, .68);
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
    plaque.name = `Floor ${id}`; plaque.position.set(0, -.4, .78); group.add(plaque);
    return plaque;
  }
  private makeLedge(p: Platform, party: boolean): Ledge {
    const group = new THREE.Group(); group.position.set(p.x, p.y, 0); this.root.add(group);
    this.mesh(new RoundedBoxGeometry(p.width, .35, 1.7, 2, .07), this.stone, group, 0, -.23, -.35);
    this.mesh(new RoundedBoxGeometry(p.width + .06, .13, 1.76, 3, .055), p.crumble ? this.crackedIceMat : p.spring ? this.springMat : p.route === 'shortcut' ? this.routeMat : this.snowMat, group, 0, -.065, -.35);
    this.mesh(new THREE.BoxGeometry(p.width - .12, .05, .05), this.iceMat, group, 0, -.12, .53);
    this.mesh(new THREE.BoxGeometry(p.width - .15, .055, 1.6), this.gold, group, 0, -.4, -.35);
    for (let i = 0; i < Math.ceil(p.width * 2.8); i++) {
      const depth = .14 + Math.abs(Math.sin(i * 7.13 + p.id)) * .57;
      const icicle = this.mesh(new THREE.ConeGeometry(.045 + (i % 3) * .013, depth, 5), this.iceMat, group, -p.width / 2 + .14 + i * .35, -.31 - depth / 2, .4);
      icicle.rotation.z = Math.PI + Math.sin(i * 5.7) * .13;
    }
    for (const side of [-1, 1]) {
      const bracket = this.mesh(new THREE.BoxGeometry(.13, .56, .32), this.stone, group, side * (p.width / 2 - .32), -.65, -.72); bracket.rotation.x = -.4;
      this.mesh(new THREE.IcosahedronGeometry(.075, 1), this.gold, group, side * (p.width / 2 - .15), -.24, .52);
    }
    if (p.spring) {
      for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
        const coil = this.mesh(new THREE.TorusGeometry(.16, .035, 6, 16), this.springMat, group, side * p.width * .28, -.46 - i * .12, .3);
        coil.rotation.x = Math.PI / 2;
      }
    }
    let gem: THREE.Mesh | undefined;
    if (p.gem) { gem = this.mesh(new THREE.OctahedronGeometry(.21, 0), party ? this.partyGemMat : this.gemMat, group, 0, 1.05, 0); gem.scale.y = 1.55; }
    this.batchMeshes(group, gem);
    const plaque = p.id > 0 && p.id % 10 === 0 ? this.makeFloorPlaque(p.id, group) : undefined;
    const crumble = p.crumble ? this.actionWorld.makeCrumble(p.width) : undefined;
    if (crumble) group.add(crumble.group);
    return { group, gem, plaque, crumble, platform: p, id: p.id };
  }
  private removeLedge(ledge: Ledge) {
    this.root.remove(ledge.group);
    // The action renderer owns shared crack/chip resources across all ledges.
    ledge.crumble?.group.removeFromParent();
    ledge.group.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    ledge.plaque?.material.map?.dispose(); ledge.plaque?.material.dispose();
    this.ledges.delete(ledge.id);
  }
  setQuality(high: boolean) { this.high = high; this.actionWorld.setQuality(high); this.renderer.shadowMap.enabled = high; this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, high ? 1.65 : 1)); this.resize(); }
  setPersonalBest(floor: number) { this.bestMarker.setFloor(floor); }
  setReducedMotion(reduced: boolean) {
    this.reducedMotion = reduced;
    if (reduced) { this.shake = 0; this.squish = 0; }
    this.starTrail.mesh.visible = !reduced;
    if (reduced) { for (const fleck of this.flecks) this.root.remove(fleck.mesh); this.flecks.length = 0; }
  }
  private resize() {
    const { width, height } = this.renderer.domElement.getBoundingClientRect();
    if (!width || !height) return;
    const aspect = width / height;
    // Bring portrait phone views closer while keeping both playable walls in frame.
    const viewWidth = width <= 768 && aspect < 1 ? 13.2 : 15;
    const h = Math.max(15.5, viewWidth / aspect);
    this.camera.aspect = aspect; this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(h / 52)); this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false); this.composer.setSize(width, height);

  }
  effect(e: GameEvent, time: number) {
    this.motion.event(e, time);
    this.actionWorld.effect(e, time);
    if (e.type === 'land' && !this.reducedMotion) this.squish = .22;
    if (e.type === 'over' && !this.reducedMotion) this.shake = .24;
    if (e.type === 'wall' && !this.reducedMotion) this.shake = .055;
    if (e.type === 'hurt' && !this.reducedMotion) this.shake = .11;
    if (e.type === 'stomp' && !this.reducedMotion) { this.shake = .05; this.squish = .13; }
    if (!this.reducedMotion && ['jump', 'land', 'gem', 'wall', 'combo', 'collapse', 'hurt', 'stomp', 'dodge', 'frenzy'].includes(e.type)) {
      const count = e.type === 'gem' || e.type === 'frenzy' ? 22 : e.type === 'combo' || e.type === 'dodge' ? 9 : 12;
      const material = ['hurt', 'collapse'].includes(e.type) ? this.impactFleckMat : ['frenzy', 'stomp', 'dodge'].includes(e.type) ? this.frenzyFleckMat : this.fleckMat;
      for (let i = 0; i < count; i++) {
        if (this.flecks.length >= 240) this.root.remove(this.flecks.shift()!.mesh);
        const mesh = new THREE.Mesh(this.fleckGeometry, material); mesh.position.set(e.x + (Math.random() - .5) * .5, e.y + .08, .2); this.root.add(mesh);
        const duration = .35 + Math.random() * .5;
        this.flecks.push({ mesh, velocity: new THREE.Vector3((Math.random() - .5) * 4, Math.random() * 3, (Math.random() - .5) * 3), life: duration, duration });
      }
    }
  }
  render(e: TowerEngine, dt: number, t: number, ghosts: ClimberView | ClimberView[] | null = null, landingTarget: LandingGuideTarget | null = null) {
    // Ambient snow, lighting and the menu idle pose honor reduced motion too.
    if (this.reducedMotion) t = 0;
    const menu = e.status === 'ready';
    const simulationDt = e.status === 'playing' ? dt : 0;
    if (menu || e.time < this.lastEngineTime) { for (const fleck of this.flecks) this.root.remove(fleck.mesh); this.flecks.length = 0; this.shake = this.squish = 0; }
    this.lastEngineTime = e.time;
    const actionTime = menu ? t : e.time;
    const aspect = this.renderer.domElement.clientWidth / this.renderer.domElement.clientHeight;
    this.cameraY = damp(this.cameraY, e.cameraY, e.cameraY < this.cameraY ? 10 : 6, dt);
    this.shake *= Math.exp(-12 * simulationDt); this.squish *= Math.exp(-12 * simulationDt);
    this.cameraX = damp(this.cameraX, menu ? -.45 : e.x * .16, 2.5, dt);
    this.camera.position.set(this.cameraX + Math.sin(actionTime * 63) * this.shake, this.cameraY + 3.8 + Math.cos(actionTime * 58) * this.shake, 26);
    this.camera.lookAt(0, this.cameraY, 0);
    this.root.position.x = damp(this.root.position.x, menu && aspect > 1 ? 3.7 : 0, 4, dt);
    this.columns.position.y = Math.floor(this.cameraY / 20) * 20;
    const section = getTowerSection(e.floor);
    const blend = this.reducedMotion ? 1 : 1 - Math.exp(-3 * dt);
    (this.scene.background as THREE.Color).lerp(this.sectionColor.setHex(section.palette.background), blend);
    this.scene.fog!.color.lerp(this.sectionColor.setHex(section.palette.fog), blend);
    this.key.color.lerp(this.sectionColor.setHex(section.palette.keyLight), blend);
    this.rim.color.lerp(this.sectionColor.setHex(section.palette.rimLight), blend);
    this.interior.update(this.cameraY, menu ? t : e.time, this.high, section, this.reducedMotion ? 10 : dt);
    this.bestMarker.update(e, this.reducedMotion);
    this.landingGuide.update(e.status === 'playing' ? landingTarget : null, e.time, this.reducedMotion);
    const keep = new Set<number>();
    for (const p of e.platforms) {
      if (p.y < this.cameraY - 15 || p.y > this.cameraY + 18) continue;
      keep.add(p.id); let ledge = this.ledges.get(p.id);
      // Encounters can mark or restore an already-visible platform in place.
      if (ledge && (ledge.platform !== p || !!ledge.crumble !== !!p.crumble)) { this.removeLedge(ledge); ledge = undefined; }
      if (!ledge) { ledge = this.makeLedge(p, e.mode === 'party'); this.ledges.set(p.id, ledge); }
      ledge.group.position.set(p.x, p.y, 0);
      ledge.group.visible = !p.crumble?.broken;
      if (p.crumble && ledge.crumble) {
        this.actionWorld.updateCrumble(ledge.crumble, p.crumble, p.width, e.time, this.reducedMotion);
        if (!this.reducedMotion && p.crumble.remaining !== null && !p.crumble.broken) ledge.group.position.x += Math.sin(e.time * 39 + p.id) * .018;
      }
      if (ledge.gem) { ledge.gem.visible = !p.collected && !p.crumble?.broken; ledge.gem.rotation.y = this.reducedMotion ? .5 : actionTime * 1.8; ledge.gem.position.y = 1.05 + (this.reducedMotion ? 0 : Math.sin(actionTime * 2.4 + p.id) * .14); }
    }
    for (const [id, ledge] of this.ledges) if (!keep.has(id)) {
      this.removeLedge(ledge);
    }
    const pose = this.motion.pose(e);
    this.tumble.position.set(e.x, e.y + .8 + (menu ? Math.sin(t * 2) * .014 : 0), .05);
    this.tumble.rotation.z = this.reducedMotion ? 0 : pose.roll;
    this.character.position.set(0, -.8, 0);
    this.rotation = damp(this.rotation, Math.abs(e.vx) > .25 ? e.facing * .9 : .12, 9, dt); this.character.rotation.y = this.rotation * (1 - pose.spread * .9);
    this.character.rotation.z = damp(this.character.rotation.z, e.vx * -.018 * (1 - pose.spread), 8, dt);
    this.character.scale.set(1 + this.squish * .45, 1 - this.squish, 1 + this.squish * .3);
    this.motion.applyLimbs(e, pose.spread, this.arms, this.legs);
    const views = Array.isArray(ghosts) ? ghosts : ghosts ? [ghosts] : [];
    const playerViews = views.filter(view => view.appearance === 'player');
    const replay = views.find(view => view.appearance !== 'player');
    const models = [{ tumble: this.ghostTumble, character: this.ghostCharacter, arms: this.ghostArms, legs: this.ghostLegs }, ...this.rivals];
    models.forEach((model, index) => {
      const ghost = index === 0 ? replay : playerViews[index - 1];
      model.tumble.visible = !!ghost && !menu && !ghost.finished;
      const rival = index > 0 ? this.rivals[index - 1] : null;
      if (rival) {
        rival.shield.update(model.tumble.visible && ghost?.protected ? 1 : 0, t, this.reducedMotion);
        rival.nameplate.setName(ghost?.name ?? '');
        rival.nameplate.sprite.visible = model.tumble.visible && !!ghost?.name?.trim();
        if (ghost) {
          const outfit = normalizeOutfit(ghost.outfit), key = `${outfit.hat}/${outfit.sweater}/${outfit.trail}`;
          if (key !== rival.outfitKey) { applyCharacterOutfit(model.character, outfit); rival.outfitKey = key; }
        }
      }
      if (!ghost || !model.tumble.visible) return;
      const g = ghost.engine, ghostPose = ghost.motion.pose(g);
      model.tumble.position.set(g.x, g.y + .8, -.35 - index * .12);
      // Stack nearby labels so shared spawn/checkpoint positions stay readable.
      const nearbyLabels = rival ? playerViews.slice(0, index - 1).filter(other =>
        !other.finished && Math.abs(other.engine.x - g.x) < 2.6 && Math.abs(other.engine.y - g.y) < .6).length : 0;
      rival?.nameplate.sprite.position.set(g.x, g.y + 2.05 + nearbyLabels * .45, .25);
      rival?.shield.group.position.set(g.x, g.y + .78, .15 - index * .12);
      model.tumble.rotation.z = this.reducedMotion ? 0 : ghostPose.roll;
      model.character.position.set(0, -.8, 0);
      model.character.rotation.set(0, (Math.abs(g.vx) > .25 ? g.facing * .9 : .12) * (1 - ghostPose.spread * .9), g.vx * -.018 * (1 - ghostPose.spread));
      ghost.motion.applyLimbs(g, ghostPose.spread, model.arms, model.legs);
    });
    this.starTrail.update(e);
    this.actionWorld.update(e, this.reducedMotion);
    this.glow.position.set(e.x + this.root.position.x, e.y + 1.5, 2.8);
    this.glow.color.setHex(e.action.frenzyTime > 0 ? 0x78ffd1 : 0xffc692);
    this.glow.intensity = e.action.frenzyTime > 0 ? 6 : 5;
    this.key.position.y = this.cameraY + 9; this.key.target.position.set(0, this.cameraY, 0); this.key.target.updateMatrixWorld();
    const below = e.platforms.filter(p => !p.crumble?.broken && p.y <= e.y + .02 && Math.abs(e.x - p.x) < p.width / 2).sort((a, b) => b.y - a.y)[0];
    this.groundShadow.visible = !!below;
    if (below) { this.groundShadow.position.set(e.x, below.y + .008, 0); const scale = 1 + Math.min(3, e.y - below.y) * .25; this.groundShadow.scale.setScalar(scale); (this.groundShadow.material as THREE.MeshBasicMaterial).opacity = .48 / scale; }
    for (let i = 0; i < this.snowSeeds.length / 3; i++) {
      this.snowPositions[i * 3] = this.snowSeeds[i * 3] + Math.sin(t * .24 + i) * .65;
      this.snowPositions[i * 3 + 1] = ((this.snowSeeds[i * 3 + 1] - t * (.17 + (i % 7) * .06)) % 34 + 34) % 34 - 17 + this.cameraY;
      this.snowPositions[i * 3 + 2] = this.snowSeeds[i * 3 + 2];
    }
    this.snow.geometry.attributes.position.needsUpdate = true;
    for (let i = this.flecks.length - 1; i >= 0; i--) {
      const f = this.flecks[i]; f.life -= simulationDt;
      if (f.life <= 0) { this.root.remove(f.mesh); this.flecks.splice(i, 1); continue; }
      f.velocity.y -= 6 * simulationDt; f.mesh.position.addScaledVector(f.velocity, simulationDt); f.mesh.scale.setScalar(f.life / f.duration);
    }
    this.frost.position.y = e.stormY - 8.5; (this.frost.material as THREE.ShaderMaterial).uniforms.time.value = t;
    if (this.high) this.composer.render(dt); else this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    if (this.disposed) return; this.disposed = true; this.observer.disconnect();
    this.root.remove(this.starTrail.mesh); this.starTrail.dispose();
    this.root.remove(this.actionWorld.group);
    for (const ledge of this.ledges.values()) ledge.crumble?.group.removeFromParent();
    this.actionWorld.dispose();
    this.bestMarker.dispose();
    this.root.remove(this.landingGuide.group);
    this.landingGuide.dispose();
    this.rivals.forEach(rival => { rival.nameplate.dispose(); rival.shield.group.removeFromParent(); rival.shield.dispose(); });
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>([this.springMat, this.partyGemMat, this.gemMat, this.routeMat, this.crackedIceMat, this.impactFleckMat, this.frenzyFleckMat]), textures = new Set<THREE.Texture>();
    this.scene.traverse(o => { if (o instanceof THREE.Mesh || o instanceof THREE.Points) { geometries.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m); } });
    for (const m of materials) { for (const value of Object.values(m)) if (value instanceof THREE.Texture) textures.add(value); m.dispose(); }
    geometries.forEach(g => g.dispose()); textures.forEach(t => t.dispose()); this.env.dispose(); this.fleckGeometry.dispose(); this.fleckMat.dispose(); this.composer.dispose(); this.bloom.dispose(); this.renderer.dispose();
  }
}
