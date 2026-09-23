import * as THREE from 'three';

/** Alpha per crack generation: the first fractures are brightest, later branches fainter. */
export const CRACK_ALPHA = [255, 210, 165, 120, 80] as const;
/** alphaTest that shows generations 0..n; used to grow cracks without new textures. */
export const crackThreshold = (generation: number) => (CRACK_ALPHA[Math.min(generation, CRACK_ALPHA.length - 1)] - 12) / 255;

type Segment = { x0: number; y0: number; x1: number; y1: number; generation: number };

/**
 * Rasterize a branching fracture network into an RGBA DataTexture. Works without a
 * DOM (tests run in Node), and is deterministic per seed so every ledge of a
 * variant cracks the same way.
 */
export function crackTexture(width: number, height: number, seed: number, face: 'top' | 'front') {
  let state = seed >>> 0 || 1;
  const random = () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
  const segments: Segment[] = [];
  const walk = (x: number, y: number, angle: number, length: number, generation: number) => {
    const step = face === 'top' ? 7 : 4;
    for (let travelled = 0; travelled < length; travelled += step) {
      angle += (random() - .5) * .9;
      // Top cracks run along the ledge; front cracks head down the face.
      if (face === 'top') angle += (Math.cos(angle) >= 0 ? -1 : 1) * Math.sin(angle) * .25;
      else angle += (Math.PI / 2 - angle) * .2;
      const nx = x + Math.cos(angle) * step, ny = y + Math.sin(angle) * step;
      if (nx < 1 || nx > width - 2 || ny < 1 || ny > height - 2) return;
      segments.push({ x0: x, y0: y, x1: nx, y1: ny, generation });
      if (generation < CRACK_ALPHA.length - 1 && random() < (face === 'top' ? .2 : .14))
        walk(nx, ny, angle + (random() < .5 ? -1 : 1) * (.6 + random() * .7), length * (.35 + random() * .3), generation + 1);
      x = nx; y = ny;
    }
  };
  if (face === 'top') {
    const originX = width * (.42 + random() * .16), originY = height * (.4 + random() * .2);
    const arms = 4 + Math.floor(random() * 2);
    for (let i = 0; i < arms; i++) walk(originX, originY, (i / arms) * Math.PI * 2 + random() * .6, width * (.22 + random() * .2), 0);
  } else {
    for (let i = 0; i < 3; i++) walk(width * (.2 + i * .3 + (random() - .5) * .12), 1.5, Math.PI / 2 + (random() - .5) * .8, height * 1.3, i === 1 ? 0 : 1);
    walk(2, height * (.45 + random() * .15), (random() - .5) * .3, width * 1.1, 2);
  }
  const data = new Uint8Array(width * height * 4);
  const stamp = (cx: number, cy: number, radius: number, alpha: number) => {
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      if (x < 0 || y < 0 || x >= width || y >= height || (x - cx) ** 2 + (y - cy) ** 2 > radius * radius) continue;
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      // Earlier generations win where cracks cross, so they appear first.
      data[i + 3] = Math.max(data[i + 3], alpha);
    }
  };
  for (const s of segments) {
    const radius = Math.max(1, (face === 'top' ? 3.4 : 2.6) - s.generation * .5), steps = Math.ceil(Math.hypot(s.x1 - s.x0, s.y1 - s.y0) * 2);
    for (let i = 0; i <= steps; i++) stamp(s.x0 + (s.x1 - s.x0) * i / steps, s.y0 + (s.y1 - s.y0) * i / steps, radius, CRACK_ALPHA[s.generation]);
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
