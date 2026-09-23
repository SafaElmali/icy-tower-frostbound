import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FLOOR_HEIGHT } from './tower-engine.ts';
import { getTowerSection, TOWER_SECTIONS, type TowerSection } from './tower-sections.ts';

/** Palette-tracked materials owned by the interior; decor reuses them so it recolors with each section. */
export interface SharedDecorMaterials { stone: THREE.Material; trim: THREE.Material; dark: THREE.Material; metal: THREE.Material; ice: THREE.Material }
export type Sway = { object: THREE.Object3D; phase: number; amplitude: number; speed: number; gust: number };
export type Spin = { object: THREE.Object3D; speed: number };
/** One section's decor inside one bay: a cloned template plus the parts that move. */
export type DecorInstance = { group: THREE.Group; sways: Sway[]; spins: Spin[]; highOnly: THREE.Object3D[] };

/** A bay shows the decor of the section its lowest floor belongs to, so new decor never appears below its milestone. */
export function decorSectionForBay(index: number, bayHeight: number): TowerSection {
  return getTowerSection(Math.max(0, index * bayHeight / FLOOR_HEIGHT));
}

const rng = (seed: number) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const QUAD_VERTEX = 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';

/**
 * Builds merged, shared templates for every section once. Bays clone them (sharing geometry and materials),
 * and only visibility changes when a recycled bay moves into another section.
 * Everything sits on the far wall (z <= -10) or in the side aisles (|x| >= 8.6, z <= -1), well behind the playfield plane;
 * pieces behind the lane itself stay dark or small so pale ledges remain the brightest shapes.
 */
export class SectionDecor {
  readonly time = { value: 0 };
  private templates = new Map<string, THREE.Group>();
  private owned: THREE.Material[] = [];
  private candleFlame: THREE.MeshBasicMaterial;
  private crystal: THREE.MeshStandardMaterial;
  private stormGlow: THREE.MeshBasicMaterial;
  private starGlow: THREE.MeshBasicMaterial;
  private auroraGlow: THREE.MeshBasicMaterial;

  constructor(shared: SharedDecorMaterials) {
    const own = <T extends THREE.Material>(material: T) => { this.owned.push(material); return material; };
    const cloth = own(this.ripple(new THREE.MeshStandardMaterial({ color: 0x5c1d24, roughness: .92, side: THREE.DoubleSide })));
    const clothTrim = own(this.ripple(new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: .7, metalness: .3, side: THREE.DoubleSide })));
    const wax = own(new THREE.MeshStandardMaterial({ color: 0xcdb898, roughness: .8 }));
    this.candleFlame = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb35a).multiplyScalar(2.2), toneMapped: false }));
    const web = own(new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, vertexShader: QUAD_VERTEX,
      fragmentShader: `varying vec2 vUv; void main(){
        vec2 p=vec2(vUv.x,1.-vUv.y); float r=length(p); float a=atan(p.y,p.x)/1.5708;
        float wobble=sin(a*23.)*.02+sin(a*9.+r*5.)*.015;
        float spoke=1.-smoothstep(0.,.022,abs(fract(a*5.+wobble*3.)-.5)*r*1.3);
        float sag=r+pow(abs(fract(a*5.)-.5),2.)*.18;
        float ring=1.-smoothstep(0.,.05,abs(fract(sag*6.+wobble)-.5));
        float strand=max(spoke,ring*step(.1,r))*(1.-smoothstep(.6,.95,r+wobble*2.));
        gl_FragColor=vec4(vec3(.7,.68,.66),strand*.2);
      }`,
    }));
    const bronze = own(new THREE.MeshStandardMaterial({ color: 0x75603f, metalness: .78, roughness: .4 }));
    this.crystal = own(new THREE.MeshStandardMaterial({ color: 0x7a55d8, emissive: 0x4a1fb0, emissiveIntensity: .6, roughness: .18, metalness: .15, flatShading: true }));
    const glints = own(new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { time: this.time },
      vertexShader: `attribute float phase; uniform float time; varying float vGlow;
        void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); vGlow=pow(max(0.,sin(time*1.4+phase*6.2832)),10.);
          gl_PointSize=(4.+vGlow*26.)*(30./-mv.z); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `varying float vGlow; void main(){ vec2 c=abs(gl_PointCoord-.5);
        float star=max(0.,1.-c.x*c.y*90.)*(1.-smoothstep(.1,.5,length(c)));
        gl_FragColor=vec4(vec3(.95,.85,1.)*star*(.25+vGlow*.9),1.); }`,
    }));
    const veil = own(new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: { time: this.time },
      vertexShader: `varying vec2 vUv; varying vec3 vPoint; uniform float time;
        void main(){ vUv=uv; vec3 p=position; p.z+=sin(p.x*.35+time*.4)*.6; vPoint=p; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.); }`,
      fragmentShader: `varying vec2 vUv; varying vec3 vPoint; uniform float time;
        void main(){ float rays=pow(.5+.5*sin(vPoint.x*1.7+sin(vPoint.x*.23+time*.3)*2.5+time*.25),3.)*(.55+.45*sin(vPoint.x*6.3-time*.8));
          float fade=smoothstep(0.,.35,vUv.y)*(1.-smoothstep(.55,1.,vUv.y))*smoothstep(0.,.08,vUv.x)*smoothstep(1.,.92,vUv.x);
          vec3 color=mix(vec3(.12,.95,.55),vec3(.65,.3,1.),smoothstep(.35,.95,vUv.y));
          gl_FragColor=vec4(color*rays*fade*.2,1.); }`,
    }));
    this.auroraGlow = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6dffc4).multiplyScalar(1.3), toneMapped: false }));
    const glacier = own(new THREE.MeshStandardMaterial({ color: 0x4f97ad, emissive: 0x0d3442, emissiveIntensity: .7, roughness: .12, metalness: .2, flatShading: true }));
    // Ice behind the playfield lane stays darker than the pale landing surfaces.
    const glacierDeep = own(new THREE.MeshStandardMaterial({ color: 0x2a6377, emissive: 0x0a2a36, emissiveIntensity: .5, roughness: .2, metalness: .25, flatShading: true }));
    this.stormGlow = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5cf0ff).multiplyScalar(1.6), toneMapped: false }));
    this.starGlow = own(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc96b).multiplyScalar(1.5), toneMapped: false }));

    const { metal, ice, dark, trim } = shared;
    const hall = new THREE.Group(), belfry = new THREE.Group(), crystal = new THREE.Group(), aurora = new THREE.Group();
    const glacierVault = new THREE.Group(), storm = new THREE.Group(), starfall = new THREE.Group();
    const put = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
      const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz); parent.add(mesh); return mesh;
    };
    const pivot = (parent: THREE.Object3D, x: number, y: number, z: number, sway?: Omit<Sway, 'object'>) => {
      const group = new THREE.Group(); group.position.set(x, y, z); parent.add(group);
      if (sway) group.userData.sway = sway; return group;
    };
    const random = rng(7);
    /** Builds a part in its own frame, then bakes it into the section group so it still merges into one draw call per material. */
    const assembly = (parent: THREE.Object3D, x: number, y: number, z: number, rx: number, ry: number, rz: number, build: (group: THREE.Group) => void) => {
      const group = new THREE.Group(); group.position.set(x, y, z); group.rotation.set(rx, ry, rz); group.updateMatrix();
      build(group);
      for (const child of group.children.slice()) {
        child.updateMatrix(); child.matrix.premultiply(group.matrix);
        child.matrix.decompose(child.position, child.quaternion, child.scale); parent.add(child);
      }
      return group.matrix;
    };
    // Visible canvas: the far wall inside |x| < 11.2 (the aisle walls hide the rest), the upper masonry band, and the side aisles.

    // THE FORGOTTEN HALL: tattered heraldic banners, candle clusters on sills, sconces and capitals, cobwebs in the aisle vaults.
    const banner = (parent: THREE.Object3D, length: number, width: number) => {
      const make = (w: number, h: number, notch: number) => {
        const geometry = new THREE.PlaneGeometry(w, h, 2, 8); geometry.translate(0, -h / 2, 0);
        const position = geometry.attributes.position;
        for (let i = 0; i < position.count; i++) if (Math.abs(position.getY(i) + h) < 1e-4 && Math.abs(position.getX(i)) < 1e-4) position.setY(i, -h + notch);
        const sway = new Float32Array(position.count);
        for (let i = 0; i < position.count; i++) sway[i] = -position.getY(i) / 5;
        geometry.setAttribute('sway', new THREE.BufferAttribute(sway, 1)); geometry.computeVertexNormals();
        return geometry;
      };
      put(parent, make(width + .16, length + .12, length * .2), clothTrim, 0, 0, -.03);
      put(parent, make(width, length, length * .2), cloth);
      put(parent, new THREE.CylinderGeometry(.05, .05, width + .6, 6), metal, 0, .05, .02, 0, 0, Math.PI / 2);
      for (const side of [-1, 1]) put(parent, new THREE.SphereGeometry(.09, 6, 4), metal, side * (width / 2 + .3), .05, .02);
    };
    for (const x of [-4, 4]) assembly(hall, x, 14.7, -11.5, 0, 0, 0, group => banner(group, 4.6, 1.25));
    for (const side of [-1, 1]) {
      assembly(hall, side * 9.7, 15.6, -3, 0, 0, 0, group => banner(group, 6.2, 1.5));
      for (const [z, top] of [[-8.6, 13.2], [-6.9, 7.6]]) assembly(hall, side * 11.12, top, z, 0, -side * Math.PI / 2, 0, group => banner(group, 4.2, 1.2));
    }
    const candles = (parent: THREE.Object3D, x: number, y: number, z: number, count: number) => {
      for (let i = 0; i < count; i++) {
        const h = .22 + random() * .38, cx = x + (i - (count - 1) / 2) * .19, cz = z + (random() - .5) * .16;
        put(parent, new THREE.CylinderGeometry(.065, .075, h, 7), wax, cx, y + h / 2, cz);
        const flame = put(parent, new THREE.ConeGeometry(.045, .16, 5), this.candleFlame, cx, y + h + .09, cz); flame.scale.x = .8;
      }
    };
    for (const side of [-1, 1]) {
      candles(hall, side * 10.15, 3.29, -10.85, 3);
      for (const z of [-9, -5]) { candles(hall, side * 10.7, 1.24, z, 3); candles(hall, side * 10.7, 16.49, z, 2); }
      for (const [z, y] of [[-4.6, 9.4], [-7.8, 11.6]]) assembly(hall, side * 11.2, y, z, 0, -side * Math.PI / 2, 0, group => {
        put(group, new THREE.BoxGeometry(.9, .12, .5), metal, 0, 0, .25);
        put(group, new THREE.BoxGeometry(.08, .6, .4), metal, 0, -.33, .12);
        candles(group, 0, .06, .3, 3);
      });
    }
    const webGeometry = new THREE.PlaneGeometry(1.6, 1.6); webGeometry.translate(.8, -.8, 0);
    for (const side of [-1, 1]) for (const z of [-8.3, -4.3]) {
      const mesh = put(hall, webGeometry.clone(), web, side * 10.35, 16.15, z); mesh.scale.x = -side; mesh.userData.highOnly = true;
    }
    webGeometry.dispose();

    // THE FROZEN BELFRY: frosted bronze bells on headstock beams, swaying slowly, with long bell ropes.
    const bellProfile = [[0, 0], [.3, 0], [.38, -.06], [.41, -.25], [.44, -.5], [.5, -.72], [.6, -.88], [.68, -.97], [.66, -1], [.56, -.96]].map(([r, y]) => new THREE.Vector2(r, y));
    const bell = (x: number, top: number, z: number, size: number, rope: number, phase: number) => {
      const group = pivot(belfry, x, top, z, { phase, amplitude: .07 + .05 / size, speed: 1.15 + .35 / size, gust: 0 });
      const body = new THREE.LatheGeometry(bellProfile, 16); body.scale(size, size, size);
      put(group, body, bronze, 0, -.25 * size);
      put(group, new THREE.TorusGeometry(.17 * size, .045 * size, 5, 10), bronze, 0, -.14 * size);
      put(group, new THREE.SphereGeometry(.13 * size, 8, 6), bronze, 0, -1.12 * size);
      put(group, new THREE.CylinderGeometry(.03 * size, .03 * size, .9 * size, 5), dark, 0, -.7 * size);
      put(group, new THREE.CylinderGeometry(.36 * size, .3 * size, .09 * size, 12), ice, 0, -.27 * size);
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * Math.PI * 2 + random() * .3, length = (.12 + random() * .3) * size;
        put(group, new THREE.ConeGeometry(.035 * size, length, 5), ice, Math.cos(a) * .64 * size, -1.25 * size - length / 2, Math.sin(a) * .64 * size, Math.PI);
      }
      if (rope > 0) {
        put(group, new THREE.CylinderGeometry(.035, .035, rope, 5), trim, .5 * size, -1.1 * size - rope / 2, 0);
        put(group, new THREE.CylinderGeometry(.075, .075, .9, 6), bronze, .5 * size, -1.1 * size - rope + 1.1, 0);
      }
    };
    put(belfry, new THREE.BoxGeometry(22, .38, .5), dark, 0, 17.05, -10.25);
    for (const x of [-10.8, 10.8]) put(belfry, new THREE.BoxGeometry(.42, 2.2, .5), dark, x, 16.1, -10.25);
    bell(0, 16.85, -10.2, 2.3, 0, 0);
    for (const side of [-1, 1]) {
      bell(side * 8, 16.85, -10.2, 1.45, 7.5, side * 1.7);
      put(belfry, new THREE.BoxGeometry(.4, .34, 7.5), dark, side * 9.7, 16.2, -5);
      bell(side * 9.7, 16, -3.4, 1.3, 11.5, 2.4 + side);
      put(belfry, new THREE.BoxGeometry(2.2, .3, .34), dark, side * 10.1, 9.2, -7.6);
      bell(side * 9.5, 9.05, -7.6, 1.05, 4.5, .8 - side);
    }

    // CRYSTAL SPIRE: faceted amethyst clusters growing from the aisle walls, sills, pillars and vault, with twinkling glints.
    const tips: number[] = [], phases: number[] = [];
    const crystalGeometry = new THREE.CylinderGeometry(.5, .5, 1, 6); crystalGeometry.translate(0, .5, 0);
    const tipGeometry = new THREE.ConeGeometry(.5, .9, 6); tipGeometry.translate(0, 1.45, 0);
    const shard = mergeGeometries([crystalGeometry.toNonIndexed(), tipGeometry.toNonIndexed()]);
    crystalGeometry.dispose(); tipGeometry.dispose();
    const cluster = (x: number, y: number, z: number, scale: number, count: number, rx = 0, rz = 0) => {
      const local: THREE.Vector3[] = [];
      const frame = assembly(crystal, x, y, z, rx, 0, rz, group => {
        for (let i = 0; i < count; i++) {
          const length = (.6 + random() * 1.4) * scale, width = (.12 + random() * .12) * scale * (i === 0 ? 1.5 : 1);
          const geometry = shard.clone(); geometry.scale(width, length / 1.9, width);
          const mesh = put(group, geometry, this.crystal, (random() - .5) * .35 * scale, 0, (random() - .5) * .3 * scale, 0, random() * Math.PI * 2, i === 0 ? 0 : (random() - .5) * 1.3);
          mesh.updateMatrix();
          if (random() < .75) local.push(new THREE.Vector3(0, length, 0).applyMatrix4(mesh.matrix));
        }
      });
      for (const tip of local) { tip.applyMatrix4(frame); tips.push(tip.x, tip.y, tip.z + .05); phases.push(random()); }
    };
    for (const side of [-1, 1]) {
      cluster(side * 4, 3.3, -10.95, .6, 4);
      cluster(side * 10.3, 3.3, -10.9, .75, 5);
      for (const x of [4, 9.6]) cluster(side * x, 16.75, -10.9, .75, 5, Math.PI);
      for (const [y, z, scale] of [[4.5, -8.4, 1.5], [10.5, -4.2, 1.3], [14.2, -9.3, 1.1], [1.2, -2.4, 1.2]]) cluster(side * 11.15, y, z, scale, 7, 0, side * Math.PI / 2);
      for (const z of [-5, -1]) cluster(side * 10.5, 1.24, z, .9, 5);
      cluster(side * 10.6, 15.9, -3, .9, 5, Math.PI);
    }
    shard.dispose();
    const glintGeometry = new THREE.BufferGeometry();
    glintGeometry.setAttribute('position', new THREE.Float32BufferAttribute(tips, 3));
    glintGeometry.setAttribute('phase', new THREE.Float32BufferAttribute(phases, 1));
    const glintPoints = new THREE.Points(glintGeometry, glints); glintPoints.userData.highOnly = true; crystal.add(glintPoints);

    // THE AURORA: shimmering veils in the upper vault and glass chimes with glowing aurora lanterns.
    const veilMesh = put(aurora, new THREE.PlaneGeometry(40, 6.5, 60, 1), veil, 0, 14.2, -10.6); veilMesh.userData.highOnly = true;
    const chime = (x: number, top: number, z: number, phase: number) => {
      const group = pivot(aurora, x, top, z, { phase, amplitude: .06, speed: .9, gust: .03 });
      put(group, new THREE.CylinderGeometry(.015, .015, 1.4, 4), metal, 0, -.7, 0);
      put(group, new THREE.TorusGeometry(.3, .03, 5, 14), metal, 0, -1.4, 0, Math.PI / 2);
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2, length = .9 + random() * 1.3;
        put(group, new THREE.CylinderGeometry(.04, .04, length, 6), ice, Math.cos(a) * .26, -1.45 - length / 2, Math.sin(a) * .26);
      }
      put(group, new THREE.IcosahedronGeometry(.2, 1), this.auroraGlow, 0, -2.2, 0);
    };
    for (const side of [-1, 1]) {
      chime(side * 9.7, 16.8, -10.6, side * 1.9);
      chime(side * 9.7, 16, -3.2, side * 2.1);
      chime(side * 10, 11.5, -7.4, side * .7);
      chime(side * 9.8, 6.8, -4.6, side * 1.4);
    }

    // THE GLACIER VAULT: glacier walls encasing the aisles, frozen falls pouring down the piers, and an icicle fringe.
    const glacierShard = (x: number, y: number, z: number, size: number, stretch: number) => {
      const mesh = put(glacierVault, new THREE.IcosahedronGeometry(size, 0), glacier, x, y, z, random() * .5, random() * Math.PI, (random() - .5) * .3);
      mesh.scale.set(.75, stretch, .8);
    };
    for (const side of [-1, 1]) {
      for (let i = 0; i < 9; i++) glacierShard(side * (10.6 + random() * .5), 1 + (i % 3) * 6 + random() * 2.5, -10.5 + Math.floor(i / 3) * 3.6 + random() * .8, 1.2 + random() * .8, 1.8 + random() * 1.4);
    }
    const frozenFall = (x: number, z: number, width: number, depth: number, ry: number, material: THREE.Material) => {
      const geometry = new THREE.CylinderGeometry(width * .8, width, 18.4, 10, 18, true);
      const position = geometry.attributes.position;
      for (let i = 0; i < position.count; i++) {
        const px = position.getX(i), py = position.getY(i), pz = position.getZ(i);
        const bulge = 1 + Math.sin(py * 1.7 + x) * .12 + Math.sin(py * 4.3 + px * 3) * .06;
        position.setXYZ(i, px * bulge, py, pz * bulge * depth);
      }
      geometry.computeVertexNormals();
      put(glacierVault, geometry, material, x, 9.1, z, 0, ry);
    };
    for (const side of [-1, 1]) { frozenFall(side * 4, -11.55, .7, .4, 0, glacierDeep); frozenFall(side * 11.05, -6.2, 1.3, .35, Math.PI / 2, glacier); }
    for (let x = -11; x <= 11; x += .5) {
      const length = (Math.abs(x) < 7 ? .3 + random() * .7 : .5 + random() * 1.5);
      put(glacierVault, new THREE.ConeGeometry(.12, length, 5), Math.abs(x) < 7 ? glacierDeep : glacier, x, 16.8 - length / 2, -10.85, Math.PI);
    }

    // THE STORMCROWN: iron chains thrashing in the wind and caged storm orbs on lightning rods.
    const chain = (x: number, top: number, z: number, links: number, phase: number, lantern: boolean) => {
      const group = pivot(storm, x, top, z, { phase, amplitude: .05, speed: .8, gust: .09 });
      const link = new THREE.TorusGeometry(.13, .035, 4, 8); link.scale(1, 1.6, 1);
      for (let i = 0; i < links; i++) put(group, link.clone(), metal, 0, -.3 - i * .36, 0, 0, i % 2 ? Math.PI / 2 : 0);
      link.dispose();
      const end = -.3 - links * .36;
      if (lantern) {
        put(group, new THREE.IcosahedronGeometry(.2, 1), this.stormGlow, 0, end - .3, 0);
        for (let i = 0; i < 4; i++) put(group, new THREE.CylinderGeometry(.02, .02, .7, 4), dark, Math.cos(i * Math.PI / 2) * .26, end - .3, Math.sin(i * Math.PI / 2) * .26);
        put(group, new THREE.ConeGeometry(.3, .25, 4), dark, 0, end + .03, 0);
      } else put(group, new THREE.ConeGeometry(.12, .5, 4), dark, 0, end - .1, 0, Math.PI);
    };
    const stormCage = (x: number, y: number, z: number) => {
      put(storm, new THREE.CylinderGeometry(.34, .42, .22, 8), dark, x, y, z);
      put(storm, new THREE.IcosahedronGeometry(.26, 1), this.stormGlow, x, y + .45, z);
      for (let i = 0; i < 4; i++) {
        const bar = put(storm, new THREE.CylinderGeometry(.025, .025, .8, 4), metal, x + Math.cos(i * Math.PI / 2) * .3, y + .45, z + Math.sin(i * Math.PI / 2) * .3);
        bar.rotation.z = Math.cos(i * Math.PI / 2) * -.12;
      }
      put(storm, new THREE.ConeGeometry(.05, 2.2, 5), metal, x, y + 1.9, z);
    };
    for (const side of [-1, 1]) {
      chain(side * 8.7, 17.3, -10.5, 14, side * 1.3, true);
      chain(side * 5.6, 17.3, -10.9, 9, side * 2.7, false);
      chain(side * 9.6, 16.1, -4.5, 22, side * 2.2, false);
      chain(side * 9.9, 16.1, -1.8, 17, side * .6, true);
      chain(side * 10, 16.1, -7.2, 30, side * 1.1, false);
      for (const z of [-9, -5]) stormCage(side * 10.8, 16.75, z);
      put(storm, new THREE.BoxGeometry(1.4, .22, .6), dark, side * 10.5, 7.8, -8.2);
      stormCage(side * 10.2, 8.02, -8.2);
    }

    // STARFALL SUMMIT: turning brass armillary spheres and hanging star lanterns.
    const star = new THREE.Shape();
    for (let i = 0; i < 8; i++) { const r = i % 2 ? .12 : .34, a = i / 8 * Math.PI * 2 + Math.PI / 2; if (i) star.lineTo(Math.cos(a) * r, Math.sin(a) * r); else star.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    const starGeometry = new THREE.ExtrudeGeometry(star, { depth: .08, bevelEnabled: false }); starGeometry.translate(0, 0, -.04);
    const armillary = (x: number, y: number, z: number, radius: number, hang: number, speed: number) => {
      put(starfall, new THREE.CylinderGeometry(.03, .03, hang, 5), metal, x, y + radius + hang / 2, z);
      put(starfall, new THREE.TorusGeometry(radius, .05, 6, 36), metal, x, y, z, 0, Math.PI / 2);
      put(starfall, new THREE.TorusGeometry(radius * 1.02, .035, 6, 36), metal, x, y, z, Math.PI / 2);
      const spinner = new THREE.Group(); spinner.position.set(x, y, z); spinner.userData.spin = speed; starfall.add(spinner);
      put(spinner, new THREE.TorusGeometry(radius * .86, .04, 6, 32), metal, 0, 0, 0, Math.PI / 2 + .41);
      put(spinner, new THREE.TorusGeometry(radius * .7, .03, 6, 28), metal, 0, 0, 0, .5, .8);
      put(spinner, new THREE.TorusGeometry(radius * .55, .03, 6, 24), metal, 0, 0, 0, -.7, 0, .6);
      put(spinner, new THREE.OctahedronGeometry(radius * .22, 0), this.starGlow);
      put(spinner, new THREE.CylinderGeometry(.02, .02, radius * 2.1, 4), metal, 0, 0, 0, 0, 0, .41);
    };
    const starLantern = (x: number, y: number, z: number, top: number, scale: number, ry = 0) => {
      put(starfall, new THREE.CylinderGeometry(.012, .012, top - y, 3), metal, x, (top + y) / 2 + .2 * scale, z);
      put(starfall, starGeometry.clone(), this.starGlow, x, y, z, 0, ry, random() * .5).scale.setScalar(scale);
    };
    for (const side of [-1, 1]) {
      armillary(side * 9.5, 10.8, -4.2, 1.35, 3.6, side * .35);
      armillary(side * 9.8, 4.2, -8.4, 1, 10.4, -side * .28);
      for (const [x, y, scale] of [[10.3, 13.6, 1], [9.4, 15.4, .8], [6.2, 16, .55], [2.6, 16.5, .45]]) starLantern(side * x, y, -10.7, 17.3, scale);
      for (const [z, y] of [[-6.5, 13.2], [-2, 12.3], [-7.4, 7.2], [-3, 5.4]]) starLantern(side * 9.9, y, z, 16, 1, side * .6);
    }
    armillary(0, 15.1, -10.3, .95, .9, .25);
    starGeometry.dispose();

    const byId: [string, THREE.Group][] = [['forgotten-hall', hall], ['frozen-belfry', belfry], ['crystal-spire', crystal], ['aurora', aurora], ['glacier-vault', glacierVault], ['stormcrown', storm], ['starfall-summit', starfall]];
    for (const [id, group] of byId) { group.name = `${id} decor`; mergeByMaterial(group); this.templates.set(id, group); }
    if (TOWER_SECTIONS.some(section => !this.templates.has(section.id))) throw new Error('Every tower section needs decor');
  }

  /** Clones a template for one bay; geometry and materials stay shared across the pool. */
  instantiate(sectionId: string): DecorInstance {
    const template = this.templates.get(sectionId) ?? this.templates.get(TOWER_SECTIONS[0].id)!;
    const group = template.clone(); group.visible = false;
    const instance: DecorInstance = { group, sways: [], spins: [], highOnly: [] };
    group.traverse(object => {
      const sway = object.userData.sway as Omit<Sway, 'object'> | undefined, spin = object.userData.spin as number | undefined;
      if (sway) instance.sways.push({ object, ...sway });
      if (spin !== undefined) instance.spins.push({ object, speed: spin });
      if (object.userData.highOnly) instance.highOnly.push(object);
    });
    return instance;
  }

  /** Shared glow materials pulse once per frame for every bay. `flash` is the current lightning strength. */
  animate(time: number, flash: number, reducedMotion: boolean) {
    if (!reducedMotion) this.time.value = time;
    const t = this.time.value;
    this.candleFlame.color.setHex(0xffb35a).multiplyScalar(2.1 + (reducedMotion ? 0 : Math.sin(t * 13) * .2 + Math.sin(t * 7.3) * .15));
    this.crystal.emissiveIntensity = .55 + Math.sin(t * .9) * .15;
    this.stormGlow.color.setHex(0x5cf0ff).multiplyScalar(1.4 + Math.sin(t * 2.2) * .25 + flash * 1.6);
    this.starGlow.color.setHex(0xffc96b).multiplyScalar(1.35 + Math.sin(t * 1.7) * .2);
    this.auroraGlow.color.setHSL(.42 + Math.sin(t * .25) * .08, .9, .6).multiplyScalar(1.3);
  }

  dispose() {
    const geometries = new Set<THREE.BufferGeometry>();
    for (const template of this.templates.values()) template.traverse(object => { if (object instanceof THREE.Mesh || object instanceof THREE.Points) geometries.add(object.geometry); });
    geometries.forEach(geometry => geometry.dispose());
    this.owned.forEach(material => material.dispose());
    this.templates.clear();
  }

  /** Cloth ripples in the vertex shader so every banner moves with a single shared draw call. */
  private ripple(material: THREE.MeshStandardMaterial) {
    material.onBeforeCompile = shader => {
      shader.uniforms.time = this.time;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float time;\nattribute float sway;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(objectNormal) * sin(time*1.7 + position.x*1.9 + position.z*1.9 + position.y*1.1) * .16 * sway;');
    };
    material.customProgramCacheKey = () => 'tower-decor-ripple';
    return material;
  }
}

/** Collapses every mesh under a node into one mesh per material; animated pivots and points keep their own batches. */
function mergeByMaterial(root: THREE.Object3D) {
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const flags = new Map<THREE.Material, boolean>();
  for (const child of root.children.slice()) {
    if (child instanceof THREE.Mesh) {
      child.updateMatrix();
      const geometry = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
      geometry.applyMatrix4(child.matrix);
      if (child.matrix.determinant() < 0) flipWinding(geometry);
      const material = child.material as THREE.Material;
      const batch = batches.get(material) ?? []; batch.push(geometry); batches.set(material, batch);
      if (child.userData.highOnly) flags.set(material, true);
      child.geometry.dispose(); root.remove(child);
    } else if (!(child instanceof THREE.Points)) mergeByMaterial(child);
  }
  for (const [material, geometries] of batches) {
    const names = Object.keys(geometries[0].attributes).filter(name => geometries.every(geometry => geometry.attributes[name]));
    for (const geometry of geometries) for (const name of Object.keys(geometry.attributes)) if (!names.includes(name)) geometry.deleteAttribute(name);
    const merged = mergeGeometries(geometries); geometries.forEach(geometry => geometry.dispose());
    if (!merged) throw new Error(`Could not merge ${root.name || 'tower'} decor`);
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, material); mesh.userData.highOnly = flags.get(material) ?? false; root.add(mesh);
  }
}

function flipWinding(geometry: THREE.BufferGeometry) {
  for (const attribute of Object.values(geometry.attributes)) {
    const array = attribute.array, size = attribute.itemSize;
    for (let i = 0; i < attribute.count; i += 3) for (let k = 0; k < size; k++) {
      const a = (i + 1) * size + k, b = (i + 2) * size + k, swap = array[a]; array[a] = array[b]; array[b] = swap;
    }
  }
}
