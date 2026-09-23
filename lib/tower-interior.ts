import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TOWER_SECTIONS, type TowerSection } from './tower-sections.ts';
import { decorSectionForBay, SectionDecor, type DecorInstance } from './tower-decor.ts';

const BAY_HEIGHT = 18;
const BAY_COUNT = 7;

/** Repeating architecture stays anchored in world space; only distant bays are recycled. */
export class TowerInterior {
  readonly group = new THREE.Group();
  private bays: THREE.Group[] = [];
  private lamps: THREE.PointLight[] = [];
  private shafts: THREE.Mesh[] = [];
  private glass: THREE.ShaderMaterial;
  private shaftMaterial: THREE.ShaderMaterial;
  private themeColors: { current: THREE.Color; target: THREE.Color; key: keyof TowerSection['palette']; strength: number }[] = [];
  private sectionId = '';
  private decor: SectionDecor;
  private bayDecor: { index: number; kinds: Map<string, DecorInstance>; active: DecorInstance | null }[] = [];
  private flashMaterials: THREE.MeshStandardMaterial[];
  private nextStrike = -1;
  private strikeAt = -Infinity;
  private flash = 0;

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
      uniforms: {
        time: { value: 0 }, lowColor: { value: new THREE.Color() }, highColor: { value: new THREE.Color() }, aurora: { value: 0 },
        storm: { value: 0 }, stars: { value: 0 }, crystal: { value: 0 }, frost: { value: 0 }, flash: { value: 0 }, bolt: { value: 0 }, meteors: { value: 1 },
      },
      vertexShader: 'varying vec3 point; varying vec3 world; void main(){point=position;world=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      // Each section paints its own sky into the same panes: aurora curtains, stars and meteors, prismatic glass, frost, storm clouds and bolts.
      fragmentShader: `varying vec3 point; varying vec3 world; uniform float time; uniform vec3 lowColor; uniform vec3 highColor; uniform float aurora;
        uniform float storm; uniform float stars; uniform float crystal; uniform float frost; uniform float flash; uniform float bolt; uniform float meteors;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
        void main(){
          float cell=floor((point.x+4.)/8.); float lx=point.x-cell*8.; float ly=point.y-3.; float h=clamp(ly/10.,0.,1.);
          vec2 sky=vec2(point.x,world.y);
          float clouds=sin(point.x*1.8+time*.11+sin(point.y*.6-time*.08))*sin(point.y*.8+time*.07);
          float glow=pow(max(0.,1.-abs(lx)/2.5),2.);
          float curtain=pow(.5+.5*sin(point.x*2.4+sin(point.y*.35+time*.12)*2.),3.);
          vec3 color=mix(lowColor,highColor,.45+clouds*.16+glow*.32);
          color=mix(color,highColor,curtain*aurora*.45);
          if(stars>.01){
            color=mix(color,mix(vec3(.01,.012,.05),highColor*.35,h*.6),stars*.55);
            vec2 g=sky*2.6; vec2 id=floor(g); vec2 f=fract(g)-.5; float r=hash(id);
            float d=length(f-(vec2(hash(id+1.7),hash(id+4.3))-.5)*.6);
            color+=vec3(1.,.94,.82)*smoothstep(.09,0.,d)*step(.7,r)*(.55+.45*sin(time*(1.3+r*3.)+r*40.))*stars;
            if(meteors>.01){
              float bay=floor(world.y/18.); float mt=time/(2.8+hash(vec2(cell,bay))*2.4)+hash(vec2(cell*3.1,bay+.5));
              float ph=fract(mt)*3.; vec2 dir=vec2(-.8,-.6);
              vec2 rel=vec2(lx,ly)-(vec2((hash(vec2(floor(mt),cell))-.2)*4.,10.5)+dir*ph*9.);
              float along=dot(rel,-dir); float across=abs(rel.x*dir.y-rel.y*dir.x);
              color+=vec3(1.,.86,.62)*step(0.,along)*(1.-smoothstep(0.,2.6,along))*(1.-smoothstep(0.,.05+along*.025,across))*step(ph,1.)*meteors*stars*1.3;
            }
          }
          if(aurora>.01){
            float rays=pow(.5+.5*sin(sky.x*2.9+sin(sky.y*.19+time*.22)*2.4+time*.18),4.)*(.6+.4*sin(sky.x*9.+sky.y*.3-time*.7));
            vec3 tint=mix(vec3(.1,.95,.55),vec3(.7,.35,1.),smoothstep(.55,1.,h+sin(sky.x*.4+time*.1)*.15));
            color+=tint*rays*smoothstep(.12,.6,h)*aurora*.4;
          }
          if(crystal>.01){
            vec2 c=vec2(lx*.75+ly*.28+sin(ly*.9)*.2,ly*.5-lx*.22); vec2 fc=fract(c)-.5; float facet=abs(fc.x)+abs(fc.y); float shade=hash(floor(c)+cell*7.);
            vec3 prism=.5+.5*cos(6.2832*(vec3(0.,.33,.67)+shade*.6+h*.5+time*.03));
            color=mix(color,color*.55+highColor*(.2+shade*.45)+prism*.05,crystal*.6);
            color+=highColor*smoothstep(.45,.5,facet)*crystal*.22;
            color+=vec3(1.,.9,1.)*pow(max(0.,sin(shade*40.+time*1.1)),40.)*(1.-smoothstep(0.,.3,facet))*crystal*.5;
          }
          if(frost>.01){
            float edge=max(smoothstep(1.4,2.25,abs(lx)),smoothstep(2.4,.4,ly));
            vec2 fp=vec2(lx,ly);
            float fern=smoothstep(.88,.97,1.-abs(noise(fp*2.7)*2.-1.))*.8+smoothstep(.9,.98,1.-abs(noise(fp*6.9+5.)*2.-1.))*.5;
            color=mix(color,color+vec3(.03,.045,.06),frost*edge*.6);
            color=mix(color,vec3(.22,.34,.42)+highColor*.2,frost*min(1.,fern)*edge*.45);
          }
          if(storm>.01){
            vec2 q=vec2(sky.x*.3+time*.06,sky.y*.3-time*.015);
            float n=noise(q)*.55+noise(q*2.2+3.1)*.3+noise(q*5.3+7.)*.15;
            color=mix(color,mix(vec3(.002,.003,.006),vec3(.07,.085,.12),smoothstep(.35,.95,n))+highColor*.06*n*n,storm*.92);
            float s1=ly*1.4, s2=ly*4.1;
            float bx=(hash(vec2(bolt,cell))-.5)*2.4+mix(hash(vec2(floor(s1),bolt+cell)),hash(vec2(floor(s1)+1.,bolt+cell)),fract(s1))*1.1
              +mix(hash(vec2(floor(s2),bolt-cell)),hash(vec2(floor(s2)+1.,bolt-cell)),fract(s2))*.3-.7;
            float strike=step(hash(vec2(cell,bolt)),.55)*(1.-smoothstep(.02,.1,abs(lx-bx)))*step(hash(vec2(bolt,cell+2.))*5.,ly);
            color+=(vec3(.3,.4,.62)*n*.8+vec3(.85,.92,1.)*strike*1.6)*flash*storm;
          }
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
    // Every bay carries every section's decor up front; recycling only flips which one is visible.
    this.decor = new SectionDecor({ stone, trim, dark, metal: brass, ice });
    for (const bay of this.bays) {
      const kinds = new Map(TOWER_SECTIONS.map(section => [section.id, this.decor.instantiate(section.id)] as const));
      kinds.forEach(instance => bay.add(instance.group));
      this.bayDecor.push({ index: NaN, kinds, active: null });
    }
    this.flashMaterials = [stone, trim, dark];
    for (const side of [-1, 1]) {
      const lamp = new THREE.PointLight(0xffad61, 12, 12, 2); lamp.position.set(side * 8.6, 6.65, -7.1); this.lamps.push(lamp); this.group.add(lamp);
    }
    this.shaftMaterial = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { time: this.glass.uniforms.time, color: { value: new THREE.Color() } },
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'varying vec2 vUv; uniform float time; uniform vec3 color; void main(){float edge=pow(sin(vUv.x*3.14159),4.);float falloff=sin(vUv.y*3.14159);float drift=.7+.3*sin(time*.35+vUv.y*8.);gl_FragColor=vec4(color,edge*falloff*drift*.045);}',
    });
    const shaftGeometry = new THREE.ConeGeometry(3.8, 18, 20, 1, true);
    for (const bay of this.bays) for (const side of [-1, 1]) {
      const shaft = new THREE.Mesh(shaftGeometry, this.shaftMaterial);
      shaft.position.set(side * 4.2, 7, -5); shaft.rotation.set(-.55, 0, side * -.32);
      this.shafts.push(shaft); bay.add(shaft);
    }
    const trackColor = (current: THREE.Color, key: keyof TowerSection['palette'], strength = 1) => {
      this.themeColors.push({ current, target: new THREE.Color(), key, strength });
    };
    trackColor(stone.color, 'stone'); trackColor(trim.color, 'trim'); trackColor(dark.color, 'dark');
    trackColor(brass.color, 'metal'); trackColor(ice.color, 'ice'); trackColor(flame.color, 'flame', 2.5);
    trackColor(this.glass.uniforms.lowColor.value, 'windowLow');
    trackColor(this.glass.uniforms.highColor.value, 'windowHigh');
    trackColor(this.shaftMaterial.uniforms.color.value, 'shaft');
    this.lamps.forEach(lamp => trackColor(lamp.color, 'flame'));
    this.update(5.2, 0, true);
  }

  /** Lightning strength (0-1) this frame, for a matching boost of the scene's rim light. Always 0 under reduced motion. */
  get lightning() { return this.flash; }
  /** Count of lightning strikes so far, so audio can answer each one with thunder. */
  strikes = 0;

  update(cameraY: number, time: number, high: boolean, section: TowerSection = TOWER_SECTIONS[0], dt = 1 / 60, reducedMotion = false) {
    const firstTheme = !this.sectionId;
    if (this.sectionId !== section.id) {
      this.sectionId = section.id;
      this.themeColors.forEach(color => color.target.setHex(section.palette[color.key]).multiplyScalar(color.strength));
    }
    // Only existing materials and uniforms change; no allocation, loading, or collision changes at milestones.
    const blend = firstTheme ? 1 : 1 - Math.exp(-3 * Math.max(0, Number.isFinite(dt) ? dt : 0));
    this.themeColors.forEach(color => color.current.lerp(color.target, blend));
    const sky = this.glass.uniforms;
    sky.aurora.value += (section.auroraStrength - sky.aurora.value) * blend;
    for (const layer of ['storm', 'stars', 'crystal', 'frost'] as const) sky[layer].value += (section.sky[layer] - sky[layer].value) * blend;
    const center = Math.floor(cameraY / BAY_HEIGHT);
    // Modulo selects a stable slot: crossing a bay boundary moves only the farthest bay, which picks up the decor of its new height.
    for (let index = center - 3; index <= center + 3; index++) {
      const slot = ((index % BAY_COUNT) + BAY_COUNT) % BAY_COUNT, decor = this.bayDecor[slot];
      this.bays[slot].position.y = index * BAY_HEIGHT;
      if (decor.index === index) continue;
      decor.index = index;
      const next = decor.kinds.get(decorSectionForBay(index, BAY_HEIGHT).id)!;
      if (decor.active !== next) { if (decor.active) decor.active.group.visible = false; next.group.visible = true; decor.active = next; }
    }
    this.glass.uniforms.time.value = time;
    this.lamps.forEach((lamp, i) => { lamp.position.y = center * BAY_HEIGHT + 6.65; lamp.intensity = (high ? 13 : 8) + Math.sin(time * 5 + i) * 1.2 + Math.sin(time * 11) * .5; });
    this.shafts.forEach(shaft => { shaft.visible = high; });
    // Lightning: a rare double strike, never more than two flashes a second, and none at all under reduced motion.
    if (reducedMotion || sky.storm.value < .5 || !Number.isFinite(time)) { this.nextStrike = -1; this.strikeAt = -Infinity; }
    else {
      if (this.nextStrike < 0 || this.nextStrike - time > 12 || time < this.strikeAt) { this.nextStrike = time + 1.5 + Math.random() * 2; this.strikeAt = -Infinity; }
      if (time >= this.nextStrike) { this.strikeAt = time; this.strikes++; this.nextStrike = time + 4 + Math.random() * 5; sky.bolt.value = Math.floor(Math.random() * 97); }
    }
    // Timed from the clock rather than frame steps so a slow frame rate can't stretch a flash.
    const age = time - this.strikeAt;
    this.flash = age > 1.2 ? 0 : Math.min(1, Math.exp(-age * 14) + (age > .22 ? .65 * Math.exp(-(age - .22) * 8) : 0)) * sky.storm.value;
    sky.flash.value = this.flash;
    sky.meteors.value = reducedMotion ? 0 : 1;
    for (const material of this.flashMaterials) material.emissive.setRGB(.1, .14, .22).multiplyScalar(this.flash);
    this.decor.animate(time, this.flash, reducedMotion);
    const t = this.decor.time.value;
    for (const { active } of this.bayDecor) {
      if (!active) continue;
      for (const sway of active.sways) {
        const gust = sway.gust * Math.sin(t * .37 + sway.phase) * (1 + Math.sin(t * 2.9 + sway.phase * 2) * .5);
        sway.object.rotation.z = Math.sin(t * sway.speed + sway.phase) * sway.amplitude + gust;
        sway.object.rotation.x = Math.sin(t * sway.speed * .7 + sway.phase * 1.3) * sway.amplitude * .35;
      }
      for (const spin of active.spins) spin.object.rotation.y = t * spin.speed;
      for (const object of active.highOnly) object.visible = high;
    }
  }

  dispose() {
    this.decor.dispose();
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    this.group.traverse(object => { if (object instanceof THREE.Mesh || object instanceof THREE.Points) { geometries.add(object.geometry); materials.add(object.material as THREE.Material); } });
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
    this.group.clear(); this.bays.length = 0; this.bayDecor.length = 0;
  }
}
