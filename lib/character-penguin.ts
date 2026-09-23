import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Pip, a purely cosmetic second climber built from procedural geometry in Harold's coordinate space (feet at y=0,
 * facing +z). It exposes the same Arm_L/Arm_R/Leg_L/Leg_R pivots ClimberMotion animates, and material names that the
 * outfit tinting already understands (sweatshirt, beanie, knit ribs), so every hat, sweater and extra fits it.
 */
type V3 = [number, number, number];
type Surface = 'feathers' | 'belly' | 'orange' | 'eyes' | 'cheeks' | 'badge' | 'sweater' | 'trim' | 'beanie' | 'ribs';
const SURFACES: Record<Surface, THREE.MeshStandardMaterialParameters> = {
  feathers: { name: 'Pip glossy feathers', color: 0x1f2a36, roughness: .55 },
  belly: { name: 'Pip white belly', color: 0xf2f5f7, roughness: .8 },
  orange: { name: 'Pip orange beak and feet', color: 0xffa22e, roughness: .5 },
  eyes: { name: 'Pip shiny eyes', color: 0x07090c, roughness: .15 },
  cheeks: { name: 'Pip rosy cheeks', color: 0xff8fa3, roughness: .9 },
  badge: { name: 'Pip yellow star badge', color: 0xe8c753, roughness: .6 },
  sweater: { name: 'Pip green sweatshirt', color: 0x16bb2c, roughness: .88, side: THREE.DoubleSide },
  trim: { name: 'Pip sweatshirt ribbed trim', color: 0x0c6f18, roughness: .92 },
  beanie: { name: 'Pip blue knit beanie', color: 0x285fac, roughness: .86, side: THREE.DoubleSide },
  ribs: { name: 'Pip raised knit ribs', color: 0x2f68b8, roughness: .92 },
};
/** Where head accessories sit on Pip, relative to Harold's beanie band. */
export const PIP_HAT_FIT = { origin: [0, 1.2, 0] as V3, scale: .94 };
/** Pip is rounder than Harold, so scarves and capes are widened to clear the body. */
export const PIP_BODY_FIT: V3 = [1.14, 1, 1.3];

const scratch = new THREE.Object3D();
function bake(source: THREE.BufferGeometry, p: V3 = [0, 0, 0], s: number | V3 = 1, r: V3 = [0, 0, 0]) {
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  source.dispose();
  scratch.position.set(...p); scratch.rotation.set(...r);
  if (typeof s === 'number') scratch.scale.setScalar(s); else scratch.scale.set(...s);
  scratch.updateMatrix(); geometry.applyMatrix4(scratch.matrix);
  for (const name of Object.keys(geometry.attributes)) if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name);
  return geometry;
}
const sphere = (p: V3, s: V3, r: V3 = [0, 0, 0], detail = 24) => bake(new THREE.SphereGeometry(1, detail, Math.round(detail * .7)), p, s, r);
const lathe = (profile: [number, number][], depth: number, y = 0) => bake(new THREE.LatheGeometry(profile.map(([radius, height]) => new THREE.Vector2(radius, height)), 36), [0, y, 0], [1, 1, depth]);
const band = (radius: number, depth: number, y: number, tube: number) => bake(new THREE.TorusGeometry(radius, tube, 10, 40), [0, y, 0], [1, 1, depth], [Math.PI / 2, 0, 0]);
/** A small five-point star badge, echoing Harold's crown emblem. */
function star() {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? .03 : .07; if (i) shape.lineTo(Math.cos(a) * r, Math.sin(a) * r); else shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  return new THREE.ExtrudeGeometry(shape, { depth: .015, bevelEnabled: false });
}
/** Harold's slouchy beanie, re-proportioned for Pip's rounder head. */
function beanie() {
  const rings: [number, number][] = [[0, .305], [.05, .31], [.13, .29], [.21, .265], [.27, .235], [.32, .2], [.37, .16], [.41, .11], [.43, .055], [.436, .004]];
  const segments = 40, positions: number[] = [], indices: number[] = [];
  rings.forEach(([height, radius], j) => {
    const lean = -.12 * (j / (rings.length - 1)) ** 2;
    for (let i = 0; i < segments; i++) { const a = i / segments * Math.PI * 2; positions.push(Math.cos(a) * radius + lean, 1.19 + height, Math.sin(a) * radius * .92); }
  });
  for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < segments; i++) {
    const a = j * segments + i, b = j * segments + (i + 1) % segments;
    indices.push(a, a + segments, b, b, a + segments, b + segments);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  return bake(geometry);
}

type Node = 'Pip_Body' | 'Arm_L' | 'Arm_R' | 'Leg_L' | 'Leg_R' | 'Pip_Eyes';
const PIVOTS: Record<Node, V3> = { Pip_Body: [0, 0, 0], Arm_L: [-.34, .84, 0], Arm_R: [.34, .84, 0], Leg_L: [-.14, .24, .01], Leg_R: [.14, .24, .01], Pip_Eyes: [0, 1.13, .255] };
let cached: Map<Node, [Surface, THREE.BufferGeometry][]> | null = null;
function geometry() {
  if (cached) return cached;
  const parts: Record<Node, Partial<Record<Surface, THREE.BufferGeometry[]>>> = { Pip_Body: {}, Arm_L: {}, Arm_R: {}, Leg_L: {}, Leg_R: {}, Pip_Eyes: {} };
  const add = (node: Node, surface: Surface, ...list: THREE.BufferGeometry[]) => { (parts[node][surface] ??= []).push(...list); };
  // A round, slightly flattened body with a white tummy peeking below the sweater.
  add('Pip_Body', 'feathers', lathe([[0, .2], [.2, .215], [.29, .28], [.345, .42], [.35, .6], [.315, .76], [.25, .88], [.18, .96], [0, 1]], .74),
    sphere([0, 1.12, 0], [.305, .285, .27], [0, 0, 0], 32));
  add('Pip_Body', 'belly', sphere([0, .42, .13], [.26, .22, .15]),
    sphere([-.08, 1.1, .12], [.16, .18, .16], [0, 0, .15]), sphere([.08, 1.1, .12], [.16, .18, .16], [0, 0, -.15]), sphere([0, 1.0, .1], [.19, .11, .16]));
  add('Pip_Body', 'sweater', lathe([[.36, .46], [.38, .54], [.382, .64], [.345, .77], [.27, .87]], .76));
  add('Pip_Body', 'badge', bake(star(), [0, .7, .285], 1, [-.2, 0, 0]));
  add('Pip_Body', 'trim', band(.365, .76, .46, .032), band(.27, .78, .875, .036));
  add('Pip_Body', 'orange', bake(new THREE.ConeGeometry(.085, .19, 16), [0, 1.04, .33], [1, 1, .7], [Math.PI / 2, 0, 0]));
  add('Pip_Body', 'cheeks', sphere([-.165, 1.03, .19], [.04, .03, .02], [0, -.6, 0], 12), sphere([.165, 1.03, .19], [.04, .03, .02], [0, .6, 0], 12));
  add('Pip_Body', 'beanie', beanie(), band(.305, .9, 1.205, .042));
  add('Pip_Body', 'ribs', band(.312, .9, 1.205, .02));
  add('Pip_Eyes', 'eyes', sphere([-.09, 0, 0], [.056, .068, .035], [0, -.25, 0], 16), sphere([.09, 0, 0], [.056, .068, .035], [0, .25, 0], 16));
  add('Pip_Eyes', 'belly', sphere([-.072, .024, .03], [.018, .018, .01], [0, 0, 0], 8), sphere([.108, .024, .03], [.018, .018, .01], [0, 0, 0], 8));
  for (const side of [-1, 1]) {
    const arm = side < 0 ? 'Arm_L' : 'Arm_R', leg = side < 0 ? 'Leg_L' : 'Leg_R';
    add(arm, 'feathers', sphere([side * .05, -.2, 0], [.065, .25, .13], [0, 0, side * .2]));
    add(arm, 'sweater', sphere([side * .015, -.03, 0], [.1, .11, .125]));
    add(leg, 'feathers', sphere([0, -.06, 0], [.085, .09, .085], [0, 0, 0], 16));
    add(leg, 'orange', sphere([0, -.195, .07], [.11, .04, .17], [0, side * .15, 0], 20));
  }
  cached = new Map((Object.keys(parts) as Node[]).map(node => [node, (Object.entries(parts[node]) as [Surface, THREE.BufferGeometry[]][]).map(([surface, list]) => {
    const merged = mergeGeometries(list)!; list.forEach(item => item.dispose()); return [surface, merged] as [Surface, THREE.BufferGeometry];
  })]));
  return cached;
}

/** A fresh Pip with its own materials (or one override material for the translucent ghost). */
export function createPenguin(override?: THREE.Material, shadows = true) {
  const root = new THREE.Group(); root.name = 'Pip';
  const materials = new Map<Surface, THREE.Material>();
  const material = (surface: Surface) => {
    if (override) return override;
    let result = materials.get(surface);
    if (!result) { result = new THREE.MeshStandardMaterial(SURFACES[surface]); materials.set(surface, result); }
    return result;
  };
  const nodes = new Map<Node, THREE.Object3D>();
  for (const [node, meshes] of geometry()) {
    const group = new THREE.Group(); group.name = node; group.position.set(...PIVOTS[node]);
    for (const [surface, shape] of meshes) {
      const mesh = new THREE.Mesh(shape, material(surface));
      mesh.castShadow = shadows && !override; mesh.receiveShadow = !override;
      if (surface === 'beanie' || surface === 'ribs') mesh.userData.hatShell = true;
      group.add(mesh);
    }
    nodes.set(node, group);
  }
  const body = nodes.get('Pip_Body')!;
  body.userData.hatOrigin = PIP_HAT_FIT.origin; body.userData.hatScale = PIP_HAT_FIT.scale; body.userData.bodyScale = PIP_BODY_FIT;
  const eyes = nodes.get('Pip_Eyes')!;
  eyes.position.sub(body.position); eyes.userData.accessoryPivot = 'blink'; body.add(eyes);
  root.add(body, nodes.get('Arm_L')!, nodes.get('Arm_R')!, nodes.get('Leg_L')!, nodes.get('Leg_R')!);
  return root;
}
