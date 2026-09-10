import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const BAY_HEIGHT = 18;
const BAY_COUNT = 7;

/** Repeating architecture stays anchored in world space; only distant bays are recycled. */
export class TowerInterior {
  readonly group = new THREE.Group();
  private bays: THREE.Group[] = [];
  private lamps: THREE.PointLight[] = [];
  private shafts: THREE.Mesh[] = [];
  private glass: THREE.ShaderMaterial;

  constructor(stoneTexture: THREE.Texture) {
    this.group.name = 'Frozen cathedral interior';
    const stone = new THREE.MeshStandardMaterial({ color: 0x253e4b, roughness: .94, bumpMap: stoneTexture, bumpScale: .16 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x46616a, roughness: .78, metalness: .08, bumpMap: stoneTexture, bumpScale: .06 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x122330, roughness: .98 });
    const brass = new THREE.MeshStandardMaterial({ color: 0x8b6845, metalness: .75, roughness: .42 });
    const ice = new THREE.MeshPhysicalMaterial({ color: 0x66adbf, roughness: .22, metalness: .24, clearcoat: 1 });
    const flame = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffad54).multiplyScalar(2.5), toneMapped: false });
    this.glass = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: { time: { value: 0 } },
      vertexShader: 'varying vec3 point; void main(){point=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `varying vec3 point; uniform float time;
        void main(){
          float clouds=sin(point.x*1.8+time*.11+sin(point.y*.6-time*.08))*sin(point.y*.8+time*.07);
          float glow=pow(max(0.,1.-abs(point.x)/2.5),2.);
          vec3 color=mix(vec3(.025,.09,.15),vec3(.13,.37,.49),.45+clouds*.16+glow*.32);
          gl_FragColor=vec4(color,1.);
        }`,
    });
    const template = new THREE.Group();
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); template.add(mesh); return mesh;
    };
    const box = (w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number) => add(new THREE.BoxGeometry(w, h, d), material, x, y, z);
    const pillar = (radius: number, height: number, x: number, y: number, z: number) => add(new THREE.CylinderGeometry(radius, radius * 1.08, height, 10), trim, x, y, z);
    const archPath = (path: THREE.Path, w: number, shoulder: number, peak: number, bottom = 0) => {
      path.moveTo(-w, bottom); path.lineTo(-w, shoulder);
      path.quadraticCurveTo(-w, peak - 1.8, 0, peak);
      path.quadraticCurveTo(w, peak - 1.8, w, shoulder);
      path.lineTo(w, bottom); path.closePath();
    };
    const outer = new THREE.Shape(); archPath(outer, 2.7, 6.8, 10.6);
    const inner = new THREE.Path(); archPath(inner, 2.23, 6.6, 9.95, .42); outer.holes.push(inner);
    const archGeometry = new THREE.ExtrudeGeometry(outer, { depth: .55, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: .055, bevelThickness: .07, curveSegments: 14 });
    const pane = new THREE.Shape(); archPath(pane, 2.24, 6.6, 9.96, .4);
    const paneGeometry = new THREE.ShapeGeometry(pane, 14);

    // Deep masonry wall with open window bays, staggered joints, and projecting cornices.
    for (const x of [-24, -16, -8, 0, 8, 16, 24]) {
      box(8, 3.1, 1.1, dark, x, 1.55, -12.6);
      box(8, 4.6, 1.1, dark, x, 15.7, -12.6);
      box(2.5, 10.4, 1.1, dark, x + 4, 8.2, -12.6);
      for (let row = 0; row < 9; row++) {
        const y = row * 2 + 1;
        if (row < 2 || row > 6) {
          for (let col = 0; col < 4; col++) box(1.93, 1.92, .45, stone, x - 3 + col * 2 + (row % 2 ? .13 : 0), y, -11.94);
        } else box(2.32, 1.92, .45, stone, x + 4, y, -11.94);
      }
      add(archGeometry.clone(), trim, x, 3, -11.45);
      add(paneGeometry.clone(), this.glass, x, 3, -12.25);
      box(5.9, .25, 1.45, trim, x, 3.05, -11.3);
      box(5.7, .12, 1.5, ice, x, 3.23, -11.28);
      for (const offset of [-.76, .76]) pillar(.065, 7.4, x + offset, 7.1, -11.98);
      box(4.45, .1, .13, brass, x, 6.3, -11.99);
      const rose = add(new THREE.TorusGeometry(.61, .065, 6, 24), trim, x, 10.6, -11.9);
      rose.rotation.z = Math.PI / 4;
      for (let i = 0; i < 3; i++) {
        const bar = box(.06, 1.2, .1, trim, x, 10.6, -11.9); bar.rotation.z = i * Math.PI / 3;
      }
      for (const offset of [-3.35, 3.35]) {
        pillar(.18, 13.4, x + offset, 8.5, -11.1);
        box(.68, .28, .8, trim, x + offset, 2, -11.1);
        box(.6, .25, .7, trim, x + offset, 15.1, -11.1);
      }
      for (let i = 0; i < 7; i++) {
        const length = .25 + (.5 + .5 * Math.sin(i * 17 + x)) * .8;
        const icicle = add(new THREE.ConeGeometry(.06, length, 5), ice, x - 2 + i * .67, 2.95 - length / 2, -10.8); icicle.rotation.z = Math.PI;
      }
    }
    archGeometry.dispose(); paneGeometry.dispose();
    for (const y of [.1, 16.9, 17.5]) box(64, .23, 1.3, trim, 0, y, -11.55);
    // Side aisles project toward the camera, making the depth legible during movement.
    for (const side of [-1, 1]) {
      box(1.6, 18, 11, dark, side * 12, 9, -6.5);
      for (const z of [-9, -5, -1]) {
        pillar(.42, 16.5, side * 10.8, 8.25, z);
        pillar(.16, 16.5, side * 10.25, 8.25, z);
        box(1.5, .48, 1.35, trim, side * 10.7, 1, z);
        box(1.5, .38, 1.35, trim, side * 10.7, 16.3, z);
        // Diagonal vault ribs meet in the far wall above the windows.
        const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(side * 10.7, 15.9, z), new THREE.Vector3(side * 7, 18.5, z - 2), new THREE.Vector3(side * 3.4, 17.8, -11));
        add(new THREE.TubeGeometry(curve, 16, .11, 6, false), trim, 0, 0, 0);
      }
      box(.8, .2, 1.4, brass, side * 8.6, 5.5, -7.8);
      pillar(.08, 1.2, side * 8.6, 6.1, -7.5);
      const lantern = add(new THREE.OctahedronGeometry(.26, 0), flame, side * 8.6, 6.65, -7.5); lantern.scale.y = 1.7;
      for (const dx of [-.32, .32]) box(.055, 1.0, .07, brass, side * 8.6 + dx, 6.6, -7.4);
      box(.8, .1, .7, brass, side * 8.6, 7.12, -7.5);
    }
    // Merge by material once, then share the geometry between a fixed pool of bays.
    const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
    template.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.updateMatrix();
      const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
      geometry.applyMatrix4(object.matrix);
      const material = object.material as THREE.Material;
      const batch = batches.get(material) ?? []; batch.push(geometry); batches.set(material, batch);
      object.geometry.dispose();
    });
    template.clear();
    for (const [material, geometries] of batches) {
      const merged = mergeGeometries(geometries); geometries.forEach(geometry => geometry.dispose());
      if (!merged) throw new Error('Could not assemble tower architecture');
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, material); mesh.receiveShadow = true; template.add(mesh);
    }
    for (let i = 0; i < BAY_COUNT; i++) { const bay = template.clone(); this.bays.push(bay); this.group.add(bay); }
    for (const side of [-1, 1]) {
      const lamp = new THREE.PointLight(0xffad61, 12, 12, 2); lamp.position.set(side * 8.6, 6.65, -7.1); this.lamps.push(lamp); this.group.add(lamp);
    }
    const shaftMaterial = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { time: this.glass.uniforms.time },
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'varying vec2 vUv; uniform float time; void main(){float edge=pow(sin(vUv.x*3.14159),4.);float falloff=sin(vUv.y*3.14159);float drift=.7+.3*sin(time*.35+vUv.y*8.);gl_FragColor=vec4(.22,.55,.7,edge*falloff*drift*.045);}',
    });
    const shaftGeometry = new THREE.ConeGeometry(3.8, 18, 20, 1, true);
    for (const bay of this.bays) for (const side of [-1, 1]) {
      const shaft = new THREE.Mesh(shaftGeometry, shaftMaterial);
      shaft.position.set(side * 4.2, 7, -5); shaft.rotation.set(-.55, 0, side * -.32);
      this.shafts.push(shaft); bay.add(shaft);
    }
    this.update(5.2, 0, true);
  }

  update(cameraY: number, time: number, high: boolean) {
    const center = Math.floor(cameraY / BAY_HEIGHT);
    // Modulo selects a stable slot: crossing a bay boundary moves only the farthest bay.
    for (let index = center - 3; index <= center + 3; index++) {
      const slot = ((index % BAY_COUNT) + BAY_COUNT) % BAY_COUNT;
      this.bays[slot].position.y = index * BAY_HEIGHT;
    }
    this.glass.uniforms.time.value = time;
    this.lamps.forEach((lamp, i) => { lamp.position.y = center * BAY_HEIGHT + 6.65; lamp.intensity = (high ? 13 : 8) + Math.sin(time * 5 + i) * 1.2 + Math.sin(time * 11) * .5; });
    this.shafts.forEach(shaft => { shaft.visible = high; });
  }
}
