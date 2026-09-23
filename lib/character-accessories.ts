import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Cosmetic, CosmeticShape } from './outfits.ts';

/**
 * Procedural hats, scarves and capes for the climber. Each accessory is baked into at most one merged,
 * vertex-coloured geometry per surface finish (cloth, fur, metal, glow), so an outfit adds only a few draw calls.
 * Geometry is cached per item and shared by the player, ghost, rivals and wardrobe; materials are created per
 * character so ghosts can swap them and race rivals never share them.
 */
type V3 = [number, number, number];
type Finish = 'cloth' | 'fur' | 'metal' | 'glow';
type Paint = number | ((position: THREE.Vector3) => number);
type Part = { geometry: THREE.BufferGeometry; finish: Finish };
type PivotName = 'spin' | 'bob' | 'flap-l' | 'flap-r' | 'cape' | 'cape-hem' | 'tail';
type Pivot = { name: PivotName; at: V3; parts: Part[]; children?: Pivot[] };
type Blueprint = { anchor: 'head' | 'body'; parts: Part[]; pivots?: Pivot[]; hidesBeanie?: boolean; glow?: number; tilt?: V3 };
type BuiltPivot = { name: PivotName; at: V3; meshes: [Finish, THREE.BufferGeometry][]; children: BuiltPivot[] };
type Built = { anchor: 'head' | 'body'; meshes: [Finish, THREE.BufferGeometry][]; pivots: BuiltPivot[]; hidesBeanie: boolean; glow: number; tilt: V3 };

/** Harold's beanie band: every head piece is authored around this origin, so another model only moves the anchor. */
export const HAROLD_HAT_ORIGIN: V3 = [0, 1.14, -.017];
const RX = .345, RZ = .29;

const scratch = new THREE.Object3D(), vertex = new THREE.Vector3(), color = new THREE.Color();
function part(source: THREE.BufferGeometry, paint: Paint, finish: Finish, p: V3 = [0, 0, 0], s: number | V3 = 1, r: V3 = [0, 0, 0]): Part {
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  source.dispose();
  scratch.position.set(...p); scratch.rotation.set(...r);
  if (typeof s === 'number') scratch.scale.setScalar(s); else scratch.scale.set(...s);
  scratch.updateMatrix(); geometry.applyMatrix4(scratch.matrix);
  for (const name of Object.keys(geometry.attributes)) if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name);
  const positions = geometry.attributes.position, colors = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++) {
    color.setHex(typeof paint === 'number' ? paint : paint(vertex.fromBufferAttribute(positions, i)));
    colors.set([color.r, color.g, color.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return { geometry, finish };
}

/** A tube along a smooth path whose radius follows `radius(t)`; used for horns, cones and scarf tails. */
function tube(points: V3[], radius: (t: number) => number, segments = 20, radial = 14, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)), closed);
  const geometry = new THREE.TubeGeometry(curve, segments, 1, radial, closed), positions = geometry.attributes.position;
  const center = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    curve.getPointAt(i / segments, center);
    for (let j = 0; j <= radial; j++) {
      const index = i * (radial + 1) + j;
      vertex.fromBufferAttribute(positions, index).sub(center).multiplyScalar(radius(i / segments)).add(center);
      positions.setXYZ(index, vertex.x, vertex.y, vertex.z);
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}
/** Points around the head-shaped ellipse; angle 0 faces forward (+z). */
const around = (angle: number, rx = RX, rz = RZ, y = 0): V3 => [Math.sin(angle) * rx, y, Math.cos(angle) * rz];
function ring(rx: number, rz: number, y: number, radius: number, from = 0, to = Math.PI * 2, steps = 40) {
  const closed = to - from >= Math.PI * 2 - 1e-6;
  return tube(Array.from({ length: closed ? steps : steps + 1 }, (_, i) => around(from + (to - from) * i / steps, rx, rz, y)), () => radius, steps, 10, closed);
}
const dome = (widthSegments = 28, heightSegments = 12) => new THREE.SphereGeometry(1, widthSegments, heightSegments, 0, Math.PI * 2, 0, Math.PI / 2);
function star(outer: number, inner: number, depth: number) {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const angle = Math.PI / 2 + i * Math.PI / 5, radius = i % 2 ? inner : outer;
    if (i) shape.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius); else shape.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: depth * .4, bevelSize: depth * .4, bevelSegments: 1 });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}
/** A fluffy ball: displacement depends only on direction, so welded seams stay closed. */
function fluff(detail = 3) {
  const source = new THREE.IcosahedronGeometry(1, detail);
  source.deleteAttribute('uv'); source.deleteAttribute('normal');
  const geometry = mergeVertices(source), positions = geometry.attributes.position;
  source.dispose();
  for (let i = 0; i < positions.count; i++) {
    vertex.fromBufferAttribute(positions, i).normalize();
    const bump = 1 + .07 * Math.sin(vertex.x * 11) * Math.sin(vertex.y * 11 + 1) * Math.sin(vertex.z * 11 + 2);
    positions.setXYZ(i, vertex.x * bump, vertex.y * bump, vertex.z * bump);
  }
  geometry.computeVertexNormals();
  return geometry;
}
/** Cape depth behind its pivot at height fraction v and offset x: it clears the back, flares, and wraps the sides. */
const capeDepth = (v: number, x: number) => -(.02 + .22 * v) + 1.1 * x * x;
/** A curved cloth panel hanging from y=0 down to -height behind the back, wider at the hem. */
function capeSheet(from: number, to: number, height: number, topWidth: number, hemWidth: number, hem: (u: number) => number, inset = 0) {
  const columns = 18, rows = 6, positions: number[] = [], indices: number[] = [];
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= columns; i++) {
    const u = i / columns, v = from + (to - from) * j / rows, width = topWidth + (hemWidth - topWidth) * v, x = (u - .5) * width;
    const y = -v * height + (to === 1 && j === rows ? hem(u) : 0);
    // Follow the rounded back, then flare out behind the legs.
    positions.push(x, y, capeDepth(v, x) - inset);
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) {
    const a = j * (columns + 1) + i, b = a + columns + 1;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function blueprint(shape: CosmeticShape, colors: readonly number[]): Blueprint {
  const [main, second = 0xffffff, third = second] = colors;
  switch (shape) {
    // Keeps the knit beanie and tops it with an oversized pom-pom that bounces.
    case 'bobble': return { anchor: 'head', parts: [], pivots: [{ name: 'bob', at: [-.135, .5, 0], parts: [part(fluff(), second, 'fur', [0, .13, 0], .175)] }] };
    case 'crown': return { anchor: 'head', hidesBeanie: true, glow: third, parts: [
      part(dome(), second, 'cloth', [0, .06, 0], [.31, .3, .265]),
      part(ring(RX + .01, RZ + .01, .015, .06), 0xf6f1e7, 'fur'),
      ...[-2.4, -1.2, 1.2, 2.4].map(angle => part(new THREE.SphereGeometry(.018, 6, 4), 0x1c1a20, 'fur', around(angle, RX + .06, RZ + .06, .02))),
      part(new THREE.CylinderGeometry(1, 1.05, 1, 40, 1, true), main, 'metal', [0, .12, 0], [.33, .16, .28]),
      part(ring(.335, .285, .2, .018), main, 'metal'),
      ...[0, 1, 2, 3, 4].flatMap(i => {
        const angle = i * Math.PI * 2 / 5, height = i ? .2 : .26, [x, , z] = around(angle, .325, .275);
        return [part(new THREE.ConeGeometry(.075, height, 4), main, 'metal', [x, .2 + height / 2, z], [1, 1, .55], [0, angle, 0]),
          part(new THREE.SphereGeometry(.036, 10, 8), 0xfff1c4, 'metal', [x, .2 + height + .02, z])];
      }),
      part(new THREE.SphereGeometry(.055, 12, 10), main, 'metal', [0, .37, 0]),
      part(new THREE.BoxGeometry(.03, .12, .03), main, 'metal', [0, .46, 0]),
      part(new THREE.BoxGeometry(.09, .03, .03), main, 'metal', [0, .47, 0]),
      part(new THREE.OctahedronGeometry(.065), third, 'glow', around(0, .345, .3, .12), [1, 1.25, .55]),
      ...[-1.15, 1.15].map(angle => part(new THREE.OctahedronGeometry(.045), second, 'glow', around(angle, .34, .29, .12), [1, 1.2, .55], [0, angle, 0])),
    ] };
    case 'wizard': {
      const path: V3[] = [[0, .02, 0], [0, .3, -.02], [-.03, .56, -.05], [-.14, .76, -.06], [-.3, .8, -.04], [-.4, .72, -.02]];
      return { anchor: 'head', hidesBeanie: true, glow: second, tilt: [0, 0, .06], parts: [
        part(new THREE.CylinderGeometry(1, 1, .035, 44), main, 'cloth', [0, .01, 0], [.54, 1, .47]),
        part(ring(.54, .47, .01, .02), main, 'cloth'),
        part(tube(path, t => .33 * Math.pow(1 - t, 1.15) + .012, 28, 20), main, 'cloth'),
        part(ring(.305, .27, .085, .045), second, 'metal'),
        part(star(.075, .032, .02), second, 'glow', [.04, .27, .235], 1, [-.35, .15, .2]),
        part(star(.05, .022, .02), second, 'glow', [-.13, .47, .15], 1, [-.4, -.55, -.3]),
        part(star(.09, .04, .03), second, 'glow', [-.42, .7, -.02], 1, [0, .3, .5]),
      ] };
    }
    case 'horned-helm': return { anchor: 'head', hidesBeanie: true, glow: 0x3cc8f0, parts: [
      part(dome(32, 14), main, 'metal', [0, -.01, 0], [.36, .37, .31]),
      part(ring(.365, .315, .01, .045), 0xcfe3ea, 'metal'),
      part(tube(Array.from({ length: 17 }, (_, i) => { const a = Math.PI * i / 16; return [0, -.01 + Math.sin(a) * .375, Math.cos(a) * .315] as V3; }), () => .03, 24, 8), 0xcfe3ea, 'metal'),
      ...Array.from({ length: 10 }, (_, i) => part(new THREE.SphereGeometry(.022, 8, 6), 0xeaf6fa, 'metal', around((i + .5) * Math.PI / 5, .39, .34, .01))),
      ...[-1, 1].flatMap(s => [
        part(tube([[s * .28, .17, -.02], [s * .44, .22, -.02], [s * .56, .36, 0], [s * .58, .54, .03], [s * .52, .67, .05]], t => .09 * (1 - t) + .008, 24, 12), second, 'glow'),
        part(ring(.075, .075, 0, .022, 0, Math.PI * 2, 16), 0xcfe3ea, 'metal', [s * .31, .18, -.02], 1, [0, 0, s * 1.2]),
      ]),
      part(new THREE.OctahedronGeometry(.07), second, 'glow', around(0, .37, .33, .03), [1, 1.35, .6]),
    ] };
    case 'trapper': return { anchor: 'head', hidesBeanie: true, parts: [
      part(dome(), main, 'cloth', [0, .05, 0], [.33, .34, .285]),
      ...[-1, 0, 1].map(i => part(tube(Array.from({ length: 9 }, (_, j) => { const a = Math.PI * j / 8; return [Math.cos(a) * .333, .05 + Math.sin(a) * .343, 0] as V3; }), () => .012, 16, 6), 0xffffff, 'cloth', [0, 0, 0], 1, [0, i * Math.PI / 3, 0])),
      part(fluff(2), second, 'fur', [0, .4, 0], .06),
      part(ring(.36, .31, .06, .1), second, 'fur'),
    ], pivots: ([-1, 1] as const).map(s => ({ name: s < 0 ? 'flap-l' as const : 'flap-r' as const, at: [s * .33, .02, -.02] as V3, parts: [
      part(new THREE.SphereGeometry(1, 18, 14), second, 'fur', [s * .03, -.15, 0], [.085, .2, .15]),
    ] })) };
    case 'propeller': {
      const [red, yellow, blue, green] = [main, second, third, colors[3] ?? main];
      return { anchor: 'head', hidesBeanie: true, parts: [
        ...[red, yellow, blue, green].map((wedge, i) => part(new THREE.SphereGeometry(1, 9, 12, i * Math.PI / 2, Math.PI / 2, 0, Math.PI / 2), wedge, 'cloth', [0, 0, 0], [.35, .34, .3])),
        part(ring(.352, .302, .015, .03), 0xffffff, 'cloth'),
        part(new THREE.CylinderGeometry(1, 1, .03, 28, 1, false, -Math.PI / 2, Math.PI), blue, 'cloth', [0, .01, .02], [.36, 1, .5], [.12, 0, 0]),
        part(new THREE.CylinderGeometry(.02, .025, .1, 10), 0xe9edf2, 'metal', [0, .37, 0]),
      ], pivots: [{ name: 'spin', at: [0, .42, 0], parts: [
        part(new THREE.SphereGeometry(.04, 12, 8), yellow, 'cloth'),
        ...[-1, 1].map(s => part(new THREE.SphereGeometry(1, 14, 8), s < 0 ? red : blue, 'cloth', [s * .21, 0, 0], [.21, .022, .085], [s * .35, 0, 0])),
      ] }] };
    }
    case 'top-hat': return { anchor: 'head', hidesBeanie: true, tilt: [0, 0, -.1], parts: [
      part(new THREE.CylinderGeometry(1, 1, .04, 44), main, 'cloth', [0, .01, 0], [.52, 1, .46]),
      part(ring(.52, .46, .025, .025), main, 'cloth'),
      part(new THREE.CylinderGeometry(1.08, 1, .46, 40), main, 'cloth', [0, .25, 0], [.335, 1, .295]),
      part(new THREE.CylinderGeometry(1.012, 1, .1, 40, 1, true), second, 'cloth', [0, .085, 0], [.34, 1, .3]),
      part(new THREE.BoxGeometry(.09, .08, .025), 0xffd65c, 'metal', around(.35, .345, .302, .085), 1, [0, .35, 0]),
      part(new THREE.BoxGeometry(.05, .04, .03), second, 'cloth', around(.35, .35, .305, .085), 1, [0, .35, 0]),
    ] };
    case 'scarf': {
      const stripes = (count: number) => (position: THREE.Vector3) => colors[Math.abs(Math.floor(position.y * count + Math.atan2(position.x, position.z) * 1.6)) % colors.length];
      const tail = (count: number) => (position: THREE.Vector3) => colors[Math.abs(Math.floor(position.y * count)) % colors.length];
      return { anchor: 'body', parts: [
        part(ring(.245, .205, .885, .072, 0, Math.PI * 2, 48), stripes(0), 'cloth'),
        part(new THREE.SphereGeometry(1, 14, 10), main, 'cloth', [-.11, .86, .19], [.085, .075, .07]),
        part(tube([[0, 0, 0], [-.025, -.13, .025], [0, -.26, .035]], t => .06 - .012 * t, 14, 12), tail(22), 'cloth', [-.11, .84, .2], [1, 1, .5]),
      ], pivots: [{ name: 'tail', at: [.1, .89, -.16], parts: [
        part(tube([[0, 0, 0], [.03, -.12, -.05], [.05, -.25, -.07], [.055, -.36, -.06]], t => .06 - .015 * t, 16, 12), tail(22), 'cloth', [0, 0, 0], [1, 1, .5]),
      ] }] };
    }
    case 'cape': case 'bat-cape': {
      const bat = shape === 'bat-cape', hem = bat ? (u: number) => .085 * Math.sin(Math.PI * ((u * 4) % 1)) : () => 0;
      const height = .56, split = .42, top = .42, bottom = .84, joint: V3 = [0, -height * split, capeDepth(split, 0)];
      const panel = (from: number, to: number) => [part(capeSheet(from, to, height, top, bottom, hem), main, 'cloth'), part(capeSheet(from, to, height, top, bottom, hem, -.012), second, 'cloth')];
      const lower = panel(split, 1).map(piece => { piece.geometry.translate(-joint[0], -joint[1], -joint[2]); return piece; });
      const trim = bat ? [] : [part(tube(Array.from({ length: 19 }, (_, i) => { const x = (i / 18 - .5) * bottom; return [x, -height, capeDepth(1, x) + .01] as V3; }), () => .035, 36, 8), third, 'fur', [-joint[0], -joint[1], -joint[2]])];
      const wing = (s: 1 | -1) => {
        const shape = new THREE.Shape([[0, 0], [.2, .02], [.38, .38], [.25, .28], [.17, .4], [.08, .28], [0, .3]].map(([x, y]) => new THREE.Vector2(x, y)));
        return part(new THREE.ShapeGeometry(shape), second, 'cloth', [s * .1, .85, -.12], [s, 1, 1], [-.3, s * -.45, 0]);
      };
      const collar = bat
        ? [wing(-1), wing(1), part(ring(.23, .19, .885, .03), main, 'cloth')]
        : [part(ring(.24, .2, .885, .065), third, 'fur'), part(new THREE.SphereGeometry(.045, 12, 8), second, 'metal', [0, .86, .215])];
      return { anchor: 'body', parts: collar, pivots: [{ name: 'cape', at: [0, .9, -.14], parts: panel(0, split), children: [{ name: 'cape-hem', at: joint, parts: [...lower, ...trim] }] }] };
    }
  }
}

function bake(parts: Part[]): [Finish, THREE.BufferGeometry][] {
  const byFinish = new Map<Finish, THREE.BufferGeometry[]>();
  for (const { geometry, finish } of parts) byFinish.set(finish, [...byFinish.get(finish) ?? [], geometry]);
  return [...byFinish].map(([finish, list]) => {
    const merged = mergeGeometries(list)!;
    list.forEach(geometry => geometry.dispose());
    merged.computeBoundingSphere();
    return [finish, merged];
  });
}
const bakePivot = (pivot: Pivot): BuiltPivot => ({ name: pivot.name, at: pivot.at, meshes: bake(pivot.parts), children: (pivot.children ?? []).map(bakePivot) });

// Geometry is immutable and tiny, so it lives for the page; renderers that dispose it simply re-upload on next use.
const cache = new Map<string, Built>();
function built(item: Cosmetic): Built | null {
  if (!item.shape) return null;
  const key = `${item.id}:${item.colors.join(',')}`;
  let result = cache.get(key);
  if (!result) {
    const plan = blueprint(item.shape, item.colors);
    result = { anchor: plan.anchor, meshes: bake(plan.parts), pivots: (plan.pivots ?? []).map(bakePivot), hidesBeanie: !!plan.hidesBeanie, glow: plan.glow ?? 0, tilt: plan.tilt ?? [0, 0, 0] };
    cache.set(key, result);
  }
  return result;
}

export const hidesBeanie = (item: Cosmetic) => !!built(item)?.hidesBeanie;

export type AccessoryOptions = { material?: THREE.Material; shadows?: boolean };
const FINISH: Record<Finish, THREE.MeshStandardMaterialParameters> = {
  cloth: { roughness: .82, side: THREE.DoubleSide },
  fur: { roughness: 1 },
  metal: { roughness: .3, metalness: .72, side: THREE.DoubleSide },
  glow: { roughness: .22, metalness: .1, emissiveIntensity: .75 },
};

/** Build one accessory object tree; `slot` is stored on it so re-dressing can replace it. */
export function createAccessory(item: Cosmetic, owner: string, options: AccessoryOptions = {}): { object: THREE.Group; anchor: 'head' | 'body' } | null {
  const plan = built(item);
  if (!plan) return null;
  const materials = new Map<Finish, THREE.Material>();
  const material = (finish: Finish) => {
    if (options.material) return options.material;
    let result = materials.get(finish);
    if (!result) {
      result = new THREE.MeshStandardMaterial({ name: `Accessory ${finish}`, vertexColors: true, ...FINISH[finish], ...(finish === 'glow' ? { emissive: plan.glow } : {}) });
      result.userData.accessoryOwner = owner;
      materials.set(finish, result);
    }
    return result;
  };
  const meshes = (parent: THREE.Object3D, list: [Finish, THREE.BufferGeometry][]) => {
    for (const [finish, geometry] of list) {
      const mesh = new THREE.Mesh(geometry, material(finish));
      mesh.castShadow = options.shadows ?? true; mesh.receiveShadow = !options.material;
      mesh.userData.accessoryPart = true; parent.add(mesh);
    }
  };
  const pivots = (parent: THREE.Object3D, list: BuiltPivot[]) => {
    for (const pivot of list) {
      const group = new THREE.Group(); group.name = `accessory-${pivot.name}`; group.position.set(...pivot.at);
      group.userData.accessoryPivot = pivot.name; group.userData.accessoryPart = true;
      meshes(group, pivot.meshes); pivots(group, pivot.children); parent.add(group);
    }
  };
  const object = new THREE.Group();
  object.name = `accessory:${item.slot}`; object.userData.accessorySlot = item.slot; object.userData.accessoryPart = true;
  object.rotation.set(...plan.tilt);
  meshes(object, plan.meshes); pivots(object, plan.pivots);
  return { object, anchor: plan.anchor };
}

export type AccessoryMotion = { time: number; vx: number; vy: number; grounded: boolean };
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const clocks = new WeakMap<THREE.Object3D, number>();
const pivotCache = new WeakMap<THREE.Object3D, THREE.Object3D[]>();

/** Forget cached pivots after re-dressing. */
export function resetAccessoryMotion(root: THREE.Object3D) { pivotCache.delete(root); }

/**
 * Secondary motion for capes, scarf tails, ear flaps, pom-poms and propellers. Driven by simulation time, so pauses
 * freeze it; reduced motion holds a calm resting drape and stops the propeller.
 */
export function animateAccessories(root: THREE.Object3D, state: AccessoryMotion, reduced = false) {
  let pivots = pivotCache.get(root);
  if (!pivots) {
    pivots = [];
    root.traverse(object => { if (typeof object.userData.accessoryPivot === 'string') pivots!.push(object); });
    pivotCache.set(root, pivots);
  }
  if (!pivots.length) return;
  const last = clocks.get(root), dt = last === undefined || state.time < last ? 0 : Math.min(.05, state.time - last);
  clocks.set(root, state.time);
  const speed = clamp01(Math.abs(state.vx) / 8), fall = state.grounded ? 0 : clamp01(-state.vy / 14), rise = state.grounded ? 0 : clamp01(state.vy / 14);
  const wave = (rate: number, amount: number) => reduced ? 0 : Math.sin(state.time * rate) * amount;
  const ease = 1 - Math.exp(-(reduced ? 30 : 9) * dt);
  const settle = (object: THREE.Object3D, axis: 'x' | 'z', target: number) => {
    let value = typeof object.userData.accessoryValue === 'number' ? object.userData.accessoryValue : target;
    value += (target - value) * ease;
    object.userData.accessoryValue = value; object.rotation[axis] = value;
  };
  for (const pivot of pivots) {
    switch (pivot.userData.accessoryPivot as PivotName) {
      case 'cape': settle(pivot, 'x', reduced ? .12 : .1 + speed * .75 + fall * .7 - rise * .08 + wave(9, .05 * (speed + fall))); break;
      case 'cape-hem': settle(pivot, 'x', reduced ? .08 : .05 + speed * .45 + fall * .55 + wave(13, .12 * (speed + fall + .15))); break;
      case 'tail': settle(pivot, 'x', reduced ? .15 : .15 + speed * 1.05 + fall * .9 + wave(12, .14 * (speed + fall))); break;
      case 'flap-l': case 'flap-r': {
        const side = pivot.userData.accessoryPivot === 'flap-l' ? 1 : -1;
        settle(pivot, 'z', reduced ? 0 : -side * ((state.grounded ? .04 : .3 + .25 * rise) + wave(17, state.grounded ? 0 : .22)));
        break;
      }
      case 'bob': pivot.rotation.z = reduced ? 0 : -state.vx * .035 + wave(8, .12 * (speed + fall)); pivot.rotation.x = reduced ? 0 : Math.max(-.35, Math.min(.35, -state.vy * .02)); break;
      case 'spin': if (!reduced) pivot.rotation.y += dt * (state.grounded ? 3 + speed * 12 : 26); break;
    }
  }
}
