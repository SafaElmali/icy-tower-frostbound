import test from 'node:test';
import assert from 'node:assert/strict';
import { BufferGeometry, Color, DataTexture, Group, Material, Mesh, MeshStandardMaterial, type Object3D, PerspectiveCamera, Points, ShaderMaterial, Vector3 } from 'three';
import { TowerInterior } from '../lib/tower-interior.ts';
import { decorSectionForBay } from '../lib/tower-decor.ts';
import { FLOOR_HEIGHT } from '../lib/tower-engine.ts';
import { getTowerSection, TOWER_SECTIONS } from '../lib/tower-sections.ts';

const bayGroups = (interior: TowerInterior) => interior.group.children.filter(child => child instanceof Group);
const decorOf = (bay: Group) => bay.children.filter(child => child instanceof Group && child.name.endsWith(' decor'));
const windowOf = (interior: TowerInterior) => {
  let glass: ShaderMaterial | undefined;
  interior.group.traverse(object => { if (object instanceof Mesh && object.material instanceof ShaderMaterial && object.material.uniforms.aurora) glass = object.material; });
  return glass!;
};
const section = (id: string) => TOWER_SECTIONS.find(candidate => candidate.id === id)!;

void test('climbing recycles only distant architecture and falling restores the same world positions', () => {
  const interior = new TowerInterior(new DataTexture());
  const bays = interior.group.children.filter(child => child instanceof Group);
  const initial = bays.map(bay => bay.position.y);
  interior.update(17.99, 2, true); assert.deepEqual(bays.map(bay => bay.position.y), initial);
  interior.update(18.01, 3, true);
  assert.equal(bays.filter((bay, i) => bay.position.y !== initial[i]).length, 1);
  for (const height of [500, 10000, -30, 5.2]) {
    interior.update(height, 4, true);
    const positions = bays.map(bay => bay.position.y).sort((a, b) => a - b);
    assert.equal(positions.length, 7);
    assert.ok(positions[0] < height - 36 && positions.at(-1)! > height + 36);
    for (let i = 1; i < positions.length; i++) assert.equal(positions[i] - positions[i - 1], 18);
  }
  assert.deepEqual(bays.map(bay => bay.position.y), initial);
});

void test('section transitions smoothly recolor the same pooled architecture and shader resources', () => {
  const interior = new TowerInterior(new DataTexture());
  const meshes: Mesh[] = [];
  interior.group.traverse(object => { if (object instanceof Mesh) meshes.push(object); });
  const geometries = meshes.map(mesh => mesh.geometry);
  const materials = meshes.map(mesh => mesh.material);
  const stone = materials.find(material => material instanceof MeshStandardMaterial && material.color.getHex() === TOWER_SECTIONS[0].palette.stone) as MeshStandardMaterial;
  const window = materials.find(material => material instanceof ShaderMaterial && material.uniforms.aurora) as ShaderMaterial;
  assert.ok(stone); assert.ok(window);
  const warm = stone.color.clone();
  interior.update(80, 3, true, TOWER_SECTIONS[1], 1 / 60);
  assert.notDeepEqual(stone.color, warm);
  assert.notEqual(stone.color.getHex(), TOWER_SECTIONS[1].palette.stone, 'A milestone blends instead of flashing to a new palette');
  for (const section of TOWER_SECTIONS) {
    interior.update(section.startsAtFloor * 2, 4, true, section, 10);
    assert.equal(stone.color.getHex(), section.palette.stone);
    assert.ok(Math.abs(window.uniforms.aurora.value - section.auroraStrength) < 1e-10);
    assert.ok(window.uniforms.highColor.value instanceof Color);
    assert.equal(window.uniforms.highColor.value.getHex(), section.palette.windowHigh);
    assert.deepEqual(meshes.map(mesh => mesh.geometry), geometries);
    assert.deepEqual(meshes.map(mesh => mesh.material), materials);
  }
  const currentMeshes: Mesh[] = [];
  interior.group.traverse(object => { if (object instanceof Mesh) currentMeshes.push(object); });
  assert.deepEqual(currentMeshes, meshes, 'No section loads or allocates additional scenery');
});

void test('the interior uses shared 3D geometry without loading a background image', () => {
  const interior = new TowerInterior(new DataTexture()), uses = new Map<BufferGeometry, number>(); let meshes = 0;
  interior.group.traverse(object => {
    if (!(object instanceof Mesh) && !(object instanceof Points)) return;
    meshes++; uses.set(object.geometry, (uses.get(object.geometry) ?? 0) + 1);
    const positions = object.geometry.attributes.position;
    for (const value of positions.array) assert.ok(Number.isFinite(value));
  });
  assert.ok(meshes > 20);
  for (const count of uses.values()) assert.equal(count % 7, 0, 'Every architecture and decor geometry is shared by all seven pooled bays');
  assert.ok(uses.size * 7 <= meshes, 'Bays share geometry instead of allocating a new tower on each climb');
  const camera = new PerspectiveCamera(34, 1.5, .1, 110); camera.position.set(0, 8, 26); camera.lookAt(0, 5, 0); camera.updateMatrixWorld();
  const front = new Vector3(3, 5, 0).project(camera), back = new Vector3(3, 5, -12).project(camera);
  assert.ok(front.x > back.x * 1.3, 'Background architecture has real perspective depth');
});

void test('each recycled bay shows exactly the decor of the section its lowest floor belongs to', () => {
  const interior = new TowerInterior(new DataTexture());
  const bays = bayGroups(interior);
  for (const bay of bays) assert.equal(decorOf(bay).length, TOWER_SECTIONS.length, 'Every bay is built with every section decor up front');
  const check = () => {
    for (const bay of bays) {
      const visible = decorOf(bay).filter(decor => decor.visible);
      assert.equal(visible.length, 1);
      assert.equal(visible[0].name, `${decorSectionForBay(Math.round(bay.position.y / 18), 18).id} decor`);
      const expected = getTowerSection(Math.max(0, bay.position.y / FLOOR_HEIGHT));
      assert.equal(visible[0].name, `${expected.id} decor`, 'Decor never appears below its section milestone');
    }
  };
  check();
  // Climb through every milestone, then fall back down: recycled bays swap decor as they move.
  for (let y = 0; y <= 520; y += 6) { interior.update(y, y / 10, true, getTowerSection(y / FLOOR_HEIGHT)); check(); }
  const seen = new Set(bays.flatMap(bay => decorOf(bay).filter(decor => decor.visible).map(decor => decor.name)));
  assert.ok(seen.has('starfall-summit decor'));
  for (let y = 520; y >= -40; y -= 13) { interior.update(y, 60 - y / 10, true, getTowerSection(y / FLOOR_HEIGHT)); check(); }
  assert.equal(decorSectionForBay(-3, 18).id, 'forgotten-hall');
  assert.equal(decorSectionForBay(Math.ceil(25 * FLOOR_HEIGHT / 18), 18).id, 'frozen-belfry');
});

void test('window skies blend into each section and lightning only strikes in the Stormcrown with motion allowed', () => {
  const interior = new TowerInterior(new DataTexture()), glass = windowOf(interior);
  const storm = section('stormcrown');
  interior.update(360, 1, true, storm, 1 / 60);
  assert.ok(glass.uniforms.storm.value > 0 && glass.uniforms.storm.value < 1, 'Storm clouds roll in instead of popping');
  for (const candidate of TOWER_SECTIONS) {
    interior.update(candidate.startsAtFloor * FLOOR_HEIGHT, 2, true, candidate, 10);
    for (const layer of ['storm', 'stars', 'crystal', 'frost'] as const) assert.ok(Math.abs(glass.uniforms[layer].value - candidate.sky[layer]) < 1e-9);
  }
  let stone: MeshStandardMaterial | undefined;
  interior.group.traverse(object => { if (object instanceof Mesh && object.material instanceof MeshStandardMaterial && object.material.bumpScale === .16) stone = object.material; });
  assert.ok(stone);
  const flashes: number[] = []; let peakEmissive = 0;
  for (let frame = 0; frame < 60 * 40; frame++) {
    interior.update(360, 10 + frame / 60, true, storm, 1 / 60);
    flashes.push(interior.lightning); peakEmissive = Math.max(peakEmissive, stone.emissive.r);
    assert.ok(interior.lightning >= 0 && interior.lightning <= 1);
    assert.equal(glass.uniforms.flash.value, interior.lightning);
  }
  const strikes = flashes.filter((value, i) => i > 0 && value > .9 && flashes[i - 1] < .5).length;
  assert.ok(strikes >= 3 && strikes <= 10, `A strike every few seconds, not constant flicker (${strikes} in 40s)`);
  for (let i = 0; i + 60 <= flashes.length; i += 30) {
    const second = flashes.slice(i, i + 60);
    assert.ok(second.filter((value, k) => k > 0 && value > .3 && second[k - 1] <= .3).length <= 3, 'Never more than three flashes a second');
  }
  assert.ok(peakEmissive > 0, 'Lightning briefly lights the stonework without adding a light');
  for (let frame = 0; frame < 60 * 20; frame++) {
    interior.update(360, 60 + frame / 60, true, storm, 10, true);
    assert.equal(interior.lightning, 0, 'Reduced motion has no lightning');
  }
  assert.equal(stone.emissive.getHex(), 0);
  assert.equal(glass.uniforms.meteors.value, 0, 'Reduced motion stops meteors');
  const calm = new TowerInterior(new DataTexture());
  for (let frame = 0; frame < 60 * 20; frame++) { calm.update(250, frame / 60, true, section('glacier-vault'), 1 / 60); assert.equal(calm.lightning, 0); }
});

void test('decor motion freezes under reduced motion and costly effects are skipped on Performance quality', () => {
  const interior = new TowerInterior(new DataTexture());
  const belfry = section('frozen-belfry'), y = 40 * FLOOR_HEIGHT;
  const swaying = () => {
    const rotations: number[] = [];
    for (const bay of bayGroups(interior)) for (const decor of decorOf(bay)) if (decor.visible) decor.traverse(object => { if (object.userData.sway) rotations.push(object.rotation.z); });
    return rotations;
  };
  interior.update(y, 1, true, belfry, 1 / 60);
  const before = swaying(); assert.ok(before.length >= 5, 'Belfry bays hang swinging bells');
  interior.update(y, 2.5, true, belfry, 1 / 60);
  assert.notDeepEqual(swaying(), before, 'Bells sway');
  interior.update(y, 3, true, belfry, 10, true); const frozen = swaying();
  interior.update(y, 9, true, belfry, 10, true);
  assert.deepEqual(swaying(), frozen, 'Reduced motion holds the bells still');
  const highOnly = (id: string) => {
    const found: Object3D[] = [];
    for (const bay of bayGroups(interior)) for (const decor of decorOf(bay)) if (decor.visible && decor.name === `${id} decor`) decor.traverse(object => { if (object.userData.highOnly) found.push(object); });
    return found;
  };
  for (const [id, floor] of [['forgotten-hall', 10], ['crystal-spire', 60], ['aurora', 85]] as const) {
    interior.update(floor * FLOOR_HEIGHT, 4, false, getTowerSection(floor), 1 / 60);
    const effects = highOnly(id); assert.ok(effects.length > 0, `${id} has a High quality flourish`);
    assert.ok(effects.every(object => !object.visible), 'Performance quality skips transparent overlays');
    interior.update(floor * FLOOR_HEIGHT, 4, true, getTowerSection(floor), 1 / 60);
    assert.ok(highOnly(id).every(object => object.visible));
  }
});

void test('disposing the interior releases every decor geometry and material', () => {
  const interior = new TowerInterior(new DataTexture());
  const geometries = new Set<BufferGeometry>(), materials = new Set<Material>();
  interior.group.traverse(object => { if (object instanceof Mesh || object instanceof Points) { geometries.add(object.geometry); materials.add(object.material as Material); } });
  let disposedGeometries = 0, disposedMaterials = 0;
  geometries.forEach(geometry => geometry.addEventListener('dispose', () => disposedGeometries++));
  materials.forEach(material => material.addEventListener('dispose', () => disposedMaterials++));
  interior.dispose();
  assert.ok(disposedGeometries >= geometries.size);
  assert.ok(disposedMaterials >= materials.size);
  assert.equal(interior.group.children.length, 0);
});
