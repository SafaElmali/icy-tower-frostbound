import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ClimberMotion } from './climber-motion';
import { TowerEngine, type GameEvent, type Platform } from './tower-engine';

type Ledge = { group: THREE.Group; gem?: THREE.Mesh; id: number };
type Fleck = { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number; duration: number };
const damp = (a: number, b: number, rate: number, dt: number) => THREE.MathUtils.lerp(a, b, 1 - Math.exp(-rate * dt));

export class TowerWorld {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-12, 12, 8, -8, .1, 100);
  root = new THREE.Group();
  character = new THREE.Group();
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private ledges = new Map<number, Ledge>();
  private observer: ResizeObserver;
  private high = true;
  private cameraY = 5.2;
  private shake = 0;
  private squish = 0;
  private rotation = .12;
  private legs: THREE.Object3D[] = [];
  private arms: THREE.Object3D[] = [];
  private tumble = new THREE.Group();
  private motion = new ClimberMotion();
  private backdrop?: THREE.Texture;
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
  private iceMat: THREE.MeshPhysicalMaterial;
  private gold = new THREE.MeshStandardMaterial({ color: 0x9a7350, metalness: .8, roughness: .38 });
  private gemMat = new THREE.MeshPhysicalMaterial({ color: 0x69e6ed, emissive: 0x58b9cd, emissiveIntensity: 1.5, metalness: .35, roughness: .05, clearcoat: 1 });
  private fleckGeometry = new THREE.IcosahedronGeometry(.04, 0);
  private fleckMat = new THREE.MeshBasicMaterial({ color: 0xadeaff, transparent: true });
  private groundShadow: THREE.Mesh;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.65));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.fog = new THREE.FogExp2(0x101f2c, .022);
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
    const rim = new THREE.DirectionalLight(0x58cfff, 3.5); rim.position.set(6, 8, -6); this.scene.add(rim);
    this.glow = new THREE.PointLight(0xffc692, 5, 8, 1.3); this.scene.add(this.glow);
    this.scene.add(this.root); this.root.add(this.tumble, this.columns); this.tumble.add(this.character);
    this.camera.position.set(0, 5.2, 26); this.camera.lookAt(0, 5.2, 0);
    const stoneNoise = this.makeNoiseTexture();
    this.stone = new THREE.MeshStandardMaterial({ color: 0x405a65, roughness: .89, metalness: .08, bumpMap: stoneNoise, bumpScale: .12, roughnessMap: stoneNoise });
    this.iceMat = new THREE.MeshPhysicalMaterial({ color: 0x4cbbcf, roughness: .2, metalness: .22, clearcoat: 1, clearcoatRoughness: .16, emissive: 0x185160, emissiveIntensity: .45, bumpMap: stoneNoise, bumpScale: .055 });
    this.fallbackCharacter(); this.buildColumns(); this.batchMeshes(this.columns);
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
    const texture = await new THREE.TextureLoader().loadAsync('/assets/cathedral.png');
    if (this.disposed) { texture.dispose(); return; }
    texture.colorSpace = THREE.SRGBColorSpace; this.backdrop = texture; this.scene.background = texture;
    this.scene.backgroundIntensity = .55;
    this.resize();
    // The custom GLB is optional while the playable model remains available.
    try {
      const gltf = await new GLTFLoader().loadAsync('/assets/harold.glb');
      if (this.disposed) { gltf.scene.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose(); } }); return; }
      this.character.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose(); } });
      this.character.clear();
      const model = gltf.scene; model.scale.setScalar(1);
      model.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.character.add(model);
      this.legs = ['Leg_L', 'Leg_R'].map(n => model.getObjectByName(n)).filter((x): x is THREE.Object3D => !!x);
      this.arms = ['Arm_L', 'Arm_R'].map(n => model.getObjectByName(n)).filter((x): x is THREE.Object3D => !!x);
    } catch { /* The built-in Harold model keeps the game playable offline. */ }
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
    const green = new THREE.MeshStandardMaterial({ color: 0x16bb2c, roughness: .85 });
    const blue = new THREE.MeshStandardMaterial({ color: 0x285fac, roughness: .86 });
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
      const leg = new THREE.Group(); leg.position.set(side * .145, .48, 0); this.character.add(leg); this.legs.push(leg);
      this.mesh(new THREE.CapsuleGeometry(.115, .12, 4, 12), olive, leg, 0, -.17);
      this.mesh(new RoundedBoxGeometry(.27, .16, .35, 3, .06), brown, leg, 0, -.40, .065);
      const arm = new THREE.Group(); arm.position.set(side * .28, .82, 0); this.character.add(arm); this.arms.push(arm);
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
  private makeLedge(p: Platform): Ledge {
    const group = new THREE.Group(); group.position.set(p.x, p.y, 0); this.root.add(group);
    this.mesh(new RoundedBoxGeometry(p.width, .35, 1.7, 2, .07), this.stone, group, 0, -.23, -.35);
    this.mesh(new RoundedBoxGeometry(p.width + .06, .13, 1.76, 3, .055), this.snowMat, group, 0, -.065, -.35);
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
    let gem: THREE.Mesh | undefined;
    if (p.gem) { gem = this.mesh(new THREE.OctahedronGeometry(.21, 0), this.gemMat, group, 0, 1.05, 0); gem.scale.y = 1.55; }
    this.batchMeshes(group, gem);
    return { group, gem, id: p.id };
  }
  setQuality(high: boolean) { this.high = high; this.renderer.shadowMap.enabled = high; this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, high ? 1.65 : 1)); this.resize(); }
  private resize() {
    const { width, height } = this.renderer.domElement.getBoundingClientRect();
    if (!width || !height) return;
    const aspect = width / height; const h = Math.max(15.5, 15 / aspect);
    this.camera.left = -h * aspect / 2; this.camera.right = h * aspect / 2; this.camera.top = h / 2; this.camera.bottom = -h / 2; this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false); this.composer.setSize(width, height);
    if (this.backdrop) {
      const imageAspect = 1.5;
      this.backdrop.repeat.set(Math.min(1, aspect / imageAspect), Math.min(1, imageAspect / aspect));
      this.backdrop.offset.set((1 - this.backdrop.repeat.x) / 2, (1 - this.backdrop.repeat.y) / 2);
    }
  }
  effect(e: GameEvent, time: number) {
    if (e.type === 'jump') this.motion.jump(e.value ?? 0, time);
    if (e.type === 'land') this.squish = .22;
    if (e.type === 'over') this.shake = .24;
    if (e.type === 'wall') this.shake = .055;
    if (['jump', 'land', 'gem', 'wall', 'combo'].includes(e.type)) {
      const count = e.type === 'gem' ? 22 : e.type === 'combo' ? 9 : 12;
      for (let i = 0; i < count; i++) {
        const mesh = new THREE.Mesh(this.fleckGeometry, this.fleckMat); mesh.position.set(e.x + (Math.random() - .5) * .5, e.y + .08, .2); this.root.add(mesh);
        const duration = .35 + Math.random() * .5;
        this.flecks.push({ mesh, velocity: new THREE.Vector3((Math.random() - .5) * 4, Math.random() * 3, (Math.random() - .5) * 3), life: duration, duration });
      }
    }
  }
  render(e: TowerEngine, dt: number, t: number) {
    const menu = e.status === 'ready';
    const aspect = this.renderer.domElement.clientWidth / this.renderer.domElement.clientHeight;
    this.cameraY = damp(this.cameraY, e.cameraY, e.cameraY < this.cameraY ? 10 : 6, dt);
    this.shake *= Math.exp(-12 * dt); this.squish *= Math.exp(-12 * dt);
    this.camera.position.set(Math.sin(t * 63) * this.shake, this.cameraY + 3.8 + Math.cos(t * 58) * this.shake, 26);
    this.camera.lookAt(0, this.cameraY, 0);
    this.root.position.x = damp(this.root.position.x, menu && aspect > 1 ? 3.7 : 0, 4, dt);
    this.columns.position.y = Math.floor(this.cameraY / 20) * 20;
    const keep = new Set<number>();
    for (const p of e.platforms) {
      if (p.y < this.cameraY - 15 || p.y > this.cameraY + 18) continue;
      keep.add(p.id); let ledge = this.ledges.get(p.id);
      if (!ledge) { ledge = this.makeLedge(p); this.ledges.set(p.id, ledge); }
      ledge.group.position.set(p.x, p.y, 0);
      if (ledge.gem) { ledge.gem.visible = !p.collected; ledge.gem.rotation.y = t * 1.8; ledge.gem.position.y = 1.05 + Math.sin(t * 2.4 + p.id) * .14; }
    }
    for (const [id, ledge] of this.ledges) if (!keep.has(id)) { this.root.remove(ledge.group); ledge.group.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); }); this.ledges.delete(id); }
    const running = e.grounded && Math.abs(e.vx) > .3;
    const stride = Math.sin(t * (10 + Math.abs(e.vx) * 1.8));
    const pose = this.motion.pose(e);
    this.tumble.position.set(e.x, e.y + .8 + (menu ? Math.sin(t * 2) * .014 : 0), .05);
    this.tumble.rotation.z = pose.roll;
    this.character.position.set(0, -.8, 0);
    this.rotation = damp(this.rotation, Math.abs(e.vx) > .25 ? e.facing * .9 : .12, 9, dt); this.character.rotation.y = this.rotation;
    this.character.rotation.z = damp(this.character.rotation.z, e.vx * -.018, 8, dt);
    this.character.scale.set(1 + this.squish * .45, 1 - this.squish, 1 + this.squish * .3);
    this.legs.forEach((leg, i) => { leg.rotation.x = pose.tuck > 0 ? -.95 * pose.tuck : running ? stride * (i === 0 ? 1 : -1) * .65 : e.grounded ? 0 : (i === 0 ? -.55 : .36); });
    this.arms.forEach((arm, i) => { arm.rotation.x = pose.tuck > 0 ? -.9 * pose.tuck : running ? stride * (i === 0 ? -1 : 1) * .55 : e.grounded ? Math.sin(t * 1.6) * .025 : -.5; arm.rotation.z = pose.tuck > 0 ? (i === 0 ? .12 : -.12) : e.grounded ? (i === 0 ? .08 : -.08) : (i === 0 ? .65 : -.65); });
    this.glow.position.set(e.x + this.root.position.x, e.y + 1.5, 2.8);
    this.key.position.y = this.cameraY + 9; this.key.target.position.set(0, this.cameraY, 0); this.key.target.updateMatrixWorld();
    const below = e.platforms.filter(p => p.y <= e.y + .02 && Math.abs(e.x - p.x) < p.width / 2).sort((a, b) => b.y - a.y)[0];
    this.groundShadow.visible = !!below;
    if (below) { this.groundShadow.position.set(e.x, below.y + .008, 0); const scale = 1 + Math.min(3, e.y - below.y) * .25; this.groundShadow.scale.setScalar(scale); (this.groundShadow.material as THREE.MeshBasicMaterial).opacity = .48 / scale; }
    for (let i = 0; i < this.snowSeeds.length / 3; i++) {
      this.snowPositions[i * 3] = this.snowSeeds[i * 3] + Math.sin(t * .24 + i) * .65;
      this.snowPositions[i * 3 + 1] = ((this.snowSeeds[i * 3 + 1] - t * (.17 + (i % 7) * .06)) % 34 + 34) % 34 - 17 + this.cameraY;
      this.snowPositions[i * 3 + 2] = this.snowSeeds[i * 3 + 2];
    }
    this.snow.geometry.attributes.position.needsUpdate = true;
    for (let i = this.flecks.length - 1; i >= 0; i--) {
      const f = this.flecks[i]; f.life -= dt;
      if (f.life <= 0) { this.root.remove(f.mesh); this.flecks.splice(i, 1); continue; }
      f.velocity.y -= 6 * dt; f.mesh.position.addScaledVector(f.velocity, dt); f.mesh.scale.setScalar(f.life / f.duration);
    }
    this.frost.position.y = e.stormY - 8.5; (this.frost.material as THREE.ShaderMaterial).uniforms.time.value = t;
    if (this.high) this.composer.render(dt); else this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    if (this.disposed) return; this.disposed = true; this.observer.disconnect();
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    this.scene.traverse(o => { if (o instanceof THREE.Mesh || o instanceof THREE.Points) { geometries.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m); } });
    for (const m of materials) { for (const value of Object.values(m)) if (value instanceof THREE.Texture) textures.add(value); m.dispose(); }
    geometries.forEach(g => g.dispose()); textures.forEach(t => t.dispose()); this.backdrop?.dispose(); this.env.dispose(); this.fleckGeometry.dispose(); this.fleckMat.dispose(); this.composer.dispose(); this.bloom.dispose(); this.renderer.dispose();
  }
}
