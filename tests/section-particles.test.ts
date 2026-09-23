import test from 'node:test';
import assert from 'node:assert/strict';
import { BufferAttribute, BufferGeometry, Points, PointsMaterial } from 'three';
import { SectionParticles } from '../lib/section-particles.ts';
import { TOWER_SECTIONS } from '../lib/tower-sections.ts';

const makePoints = (count: number) => {
  const seeds = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { seeds[i * 3] = (i * 7.3) % 38 - 19; seeds[i * 3 + 1] = (i * 3.1) % 34 - 17; seeds[i * 3 + 2] = i % 16 - 7; }
  const geometry = new BufferGeometry(); geometry.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
  return { seeds, points: new Points(geometry, new PointsMaterial()) };
};
const section = (id: string) => TOWER_SECTIONS.find(candidate => candidate.id === id)!;

void test('ambient particles blend into each section look and follow the camera', () => {
  const particles = new SectionParticles(), { seeds, points } = makePoints(1000);
  const hall = section('forgotten-hall'), storm = section('stormcrown');
  particles.update(hall, 1 / 60, false, true);
  assert.equal(particles.apply(points, seeds, 100, 0), Math.round(1000 * hall.particles.density));
  assert.equal((points.material as PointsMaterial).color.getHex(), hall.particles.color);
  particles.update(storm, 1 / 60, false, true);
  const material = points.material as PointsMaterial;
  particles.apply(points, seeds, 100, 0);
  assert.ok(material.opacity > hall.particles.opacity && material.opacity < storm.particles.opacity, 'Particle looks blend instead of popping');
  for (let i = 0; i < 600; i++) particles.update(storm, 1 / 60, false, true);
  const count = particles.apply(points, seeds, 400, 5);
  assert.equal(count, 1000, 'The Stormcrown uses the whole pool for heavy snow');
  assert.equal(points.geometry.drawRange.count, count);
  const positions = points.geometry.attributes.position.array;
  for (let i = 0; i < count; i++) {
    assert.ok(positions[i * 3 + 1] >= 400 - 17 && positions[i * 3 + 1] <= 400 + 17);
    assert.ok(Math.abs(positions[i * 3]) <= 19.001);
  }
});

void test('speed changes never teleport particles and reduced motion freezes them', () => {
  const particles = new SectionParticles(), { seeds, points } = makePoints(200);
  particles.update(section('crystal-spire'), 1 / 60, false, true); particles.apply(points, seeds, 0, 1);
  const before = Float32Array.from(points.geometry.attributes.position.array);
  particles.update(section('stormcrown'), 1 / 60, false, true); particles.apply(points, seeds, 0, 1);
  const after = points.geometry.attributes.position.array;
  let moved = 0;
  for (let i = 0; i < 120; i++) { const dy = Math.abs(after[i * 3 + 1] - before[i * 3 + 1]); if (dy < 17) moved = Math.max(moved, dy); }
  assert.ok(moved < .1, 'A faster section accelerates particles gradually');
  const frozen = Float32Array.from(after);
  for (let i = 0; i < 30; i++) particles.update(section('stormcrown'), 1 / 60, true, true);
  particles.apply(points, seeds, 0, 1);
  assert.deepEqual(Float32Array.from(points.geometry.attributes.position.array).slice(0, 120 * 3), frozen.slice(0, 120 * 3));
});

void test('Performance quality draws fewer particles', () => {
  const high = new SectionParticles(), low = new SectionParticles();
  const { seeds, points } = makePoints(1000), other = makePoints(1000);
  high.update(section('glacier-vault'), 1 / 60, false, true); low.update(section('glacier-vault'), 1 / 60, false, false);
  assert.ok(low.apply(other.points, other.seeds, 0, 0) < high.apply(points, seeds, 0, 0));
});
