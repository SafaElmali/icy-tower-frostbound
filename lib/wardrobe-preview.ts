import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { animateAccessories } from './character-accessories';
import { applyCharacterOutfit, climberLimbs } from './character-outfit';
import { ComboStarTrail } from './combo-star-trail';
import { ClimberMotion } from './climber-motion';
import { cosmeticFor, type Outfit } from './outfits';

/** A wardrobe-only animation clock keeps the preview independent of the paused game. */
export class WardrobePreview {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-2, 2, 2, -2, .1, 30);
  private model: THREE.Group | null = null;
  private sample = 0;
  private trail = new ComboStarTrail(() => (++this.sample * .61803398875) % 1);
  private observer: ResizeObserver;
  private disposed = false;
  private outfit: Outfit;
  private motion = new ClimberMotion();
  private baseY = 0;
  private baseScale = 1;
  private hopMotion = new ClimberMotion();
  private hopping = false;
  private time = 0;
  private lastFrame: number | null = null;
  private frame = 0;
  private playing = true;

  constructor(private canvas: HTMLCanvasElement, outfit: Outfit) {
    this.outfit = outfit;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.scene.add(new THREE.HemisphereLight(0xe4f7ff, 0x354452, 2));
    const key = new THREE.DirectionalLight(0xffffff, 3);
    key.position.set(-3, 5, 6); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x91dfff, 2);
    rim.position.set(4, 3, -3); this.scene.add(rim);
    this.scene.add(this.trail.mesh);
    // Headroom for tall hats (wizard tip, horns) above the 2.4-unit climber.
    this.camera.position.set(0, 1.42, 8); this.camera.lookAt(0, 1.42, 0);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
  }

  async load() {
    const { scene: model } = await new GLTFLoader().loadAsync('/assets/harold.glb');
    if (this.disposed) { this.disposeModel(model); return; }
    const bounds = new THREE.Box3().setFromObject(model);
    const center = bounds.getCenter(new THREE.Vector3());
    const scale = 2.4 / bounds.getSize(new THREE.Vector3()).y;
    model.scale.setScalar(scale);
    model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
    this.baseY = model.position.y; this.baseScale = scale;
    this.model = model; this.scene.add(model);
    this.setOutfit(this.outfit);
    this.resize();
    this.setPlaying(this.playing);
  }

  setOutfit(outfit: Outfit) {
    this.outfit = outfit;
    if (!this.model || this.disposed) return;
    applyCharacterOutfit(this.model, outfit);
    this.sample = 0;
    this.trail.setPalette(cosmeticFor('trail', outfit.trail).colors);
    // Pre-fill the trail so changing palettes is immediate, without restarting the pose.
    for (let i = 0; i <= 48; i++) {
      this.updateTrail(this.time - .8 + i / 60);
    }
    this.render();
  }

  setPlaying(playing: boolean) {
    this.playing = playing;
    cancelAnimationFrame(this.frame); this.frame = 0; this.lastFrame = null;
    if (playing && this.model && !this.disposed) this.frame = requestAnimationFrame(this.animate);
  }

  private updateTrail(time: number) {
    const angle = time * Math.PI / 2;
    this.trail.update({ x: -.95 + .3 * Math.cos(angle), y: .35 + .6 * Math.sin(angle),
      vx: -.3 * Math.PI / 2 * Math.sin(angle), vy: .6 * Math.PI / 2 * Math.cos(angle),
      time, grounded: false, status: 'playing', combo: 8, comboTime: 3.8 });
  }

  private animate = (now: number) => {
    if (this.disposed || !this.playing || !this.model) return;
    if (!document.hidden) {
      this.time += this.lastFrame === null ? 0 : Math.min(.05, (now - this.lastFrame) / 1000);
      this.lastFrame = now;
      // The walk, bounce, turn and one hop return smoothly to the same pose every four seconds; the hop shows off
      // squash and stretch and lets scarves and capes flutter.
      const phase = this.time % 4, hop = phase > 2.7 && phase < 3.3 ? (phase - 2.7) / .6 : -1, grounded = hop < 0;
      if (!grounded && !this.hopping) this.hopMotion.jump(0, this.time);
      this.hopping = !grounded;
      const vy = grounded ? 0 : 8 * (1 - 2 * hop);
      const body = this.hopMotion.body({ time: this.time, grounded, vx: 1.5, vy, status: 'playing' });
      const { arms, legs } = climberLimbs(this.model);
      this.motion.applyLimbs({ time: this.time * Math.PI * 4 / 12.7, grounded, vx: 1.5 }, 0, arms, legs);
      this.model.position.y = this.baseY + (grounded ? .025 * (1 - Math.cos(this.time * Math.PI * 8)) : 1.1 * hop * (1 - hop));
      this.model.scale.set(this.baseScale * body.scaleX, this.baseScale * body.scaleY, this.baseScale * body.scaleZ);
      this.model.rotation.y = .3 * Math.sin(this.time * Math.PI / 2);
      animateAccessories(this.model, { time: this.time, vx: 1.5, vy, grounded });
      this.updateTrail(this.time);
      this.render();
    } else this.lastFrame = null;
    this.frame = requestAnimationFrame(this.animate);
  };

  private resize() {
    if (this.disposed) return;
    const width = this.canvas.clientWidth, height = this.canvas.clientHeight;
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    const aspect = width / height, halfHeight = Math.max(1.62, 1.9 / aspect);
    this.camera.left = -halfHeight * aspect; this.camera.right = halfHeight * aspect;
    this.camera.top = halfHeight; this.camera.bottom = -halfHeight;
    this.camera.updateProjectionMatrix();
    this.render();
  }

  private render() {
    if (this.disposed) return;
    this.renderer.render(this.scene, this.camera);
  }

  private disposeModel(model: THREE.Group) {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    model.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    });
    for (const material of materials) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      material.dispose();
    }
    geometries.forEach(geometry => geometry.dispose()); textures.forEach(texture => texture.dispose());
  }

  dispose() {
    this.disposed = true; this.observer.disconnect();
    cancelAnimationFrame(this.frame); this.lastFrame = null;
    if (this.model) this.disposeModel(this.model);
    this.trail.dispose(); this.renderer.dispose(); this.renderer.forceContextLoss();
  }
}
