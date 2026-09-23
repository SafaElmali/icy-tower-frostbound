import * as THREE from 'three';
import type { TowerSection } from './tower-sections.ts';

type ParticleLook = TowerSection['particles'];
const FIELD_WIDTH = 38, FIELD_HEIGHT = 34;

/**
 * Blends the ambient particle look between sections (hall dust, belfry snow, crystal sparkles, storm sleet, star motes).
 * Fall and wind accumulate as phases, so changing speed never makes particles jump.
 */
export class SectionParticles {
  readonly look: ParticleLook = { color: 0, size: 0, opacity: 0, fall: 0, wind: 0, density: 0 };
  readonly color = new THREE.Color();
  private target = new THREE.Color();
  private fallPhase = 0;
  private windPhase = 0;
  private started = false;

  update(section: TowerSection, dt: number, reducedMotion: boolean, high: boolean) {
    const step = Math.min(.1, Math.max(0, Number.isFinite(dt) ? dt : 0));
    const blend = !this.started || reducedMotion ? 1 : 1 - Math.exp(-2 * step);
    const target = section.particles;
    this.started = true;
    this.color.lerp(this.target.setHex(target.color), blend);
    for (const key of ['size', 'opacity', 'fall', 'wind'] as const) this.look[key] += (target[key] - this.look[key]) * blend;
    // Performance quality keeps the section's character with a smaller share of the pool.
    this.look.density += ((high ? target.density : target.density * .6) - this.look.density) * blend;
    if (!reducedMotion) { this.fallPhase += step * this.look.fall; this.windPhase += step * this.look.wind; }
  }

  /** Writes particle positions around the camera and applies the blended tint, size and opacity. */
  apply(points: THREE.Points, seeds: Float32Array, cameraY: number, t: number) {
    const positions = points.geometry.attributes.position as THREE.BufferAttribute, array = positions.array as Float32Array;
    const count = Math.min(seeds.length / 3, Math.round(seeds.length / 3 * Math.min(1, Math.max(0, this.look.density))));
    for (let i = 0; i < count; i++) {
      const drift = this.windPhase * (.7 + (i % 5) * .12);
      array[i * 3] = ((seeds[i * 3] + Math.sin(t * .24 + i) * .65 + drift + FIELD_WIDTH / 2) % FIELD_WIDTH + FIELD_WIDTH) % FIELD_WIDTH - FIELD_WIDTH / 2;
      array[i * 3 + 1] = ((seeds[i * 3 + 1] - this.fallPhase * (.17 + (i % 7) * .06)) % FIELD_HEIGHT + FIELD_HEIGHT) % FIELD_HEIGHT - FIELD_HEIGHT / 2 + cameraY;
      array[i * 3 + 2] = seeds[i * 3 + 2];
    }
    points.geometry.setDrawRange(0, count);
    positions.needsUpdate = true;
    const material = points.material as THREE.PointsMaterial;
    material.color.copy(this.color); material.size = this.look.size; material.opacity = this.look.opacity;
    return count;
  }
}
