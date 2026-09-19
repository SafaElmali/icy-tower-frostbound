import * as THREE from 'three';

/** A single, closed ice volume; the flat base sits at the climber's feet. */
function iceShellGeometry() {
  const rings = [
    [-0.78, 0],
    [-0.78, 0.56],
    [-0.57, 0.76],
    [-0.08, 0.88],
    [0.46, 0.82],
    [0.94, 0.61],
    [1.22, 0.24],
    [1.24, 0],
  ];
  const sides = 12,
    vertices: number[] = [];
  const point = (ring: number, side: number) => {
    const [y, radius] = rings[ring];
    const angle = ((side % sides) / sides) * Math.PI * 2;
    return [Math.sin(angle) * radius, y, Math.cos(angle) * radius * 0.76];
  };
  for (let ring = 0; ring < rings.length - 1; ring++) {
    for (let side = 0; side < sides; side++) {
      const a = point(ring, side),
        b = point(ring, side + 1);
      const c = point(ring + 1, side),
        d = point(ring + 1, side + 1);
      // Skip the degenerate half of each end cap.
      if (rings[ring][1] > 0) vertices.push(...a, ...b, ...c);
      if (rings[ring + 1][1] > 0) vertices.push(...b, ...d, ...c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.computeVertexNormals();
  return geometry;
}

/** Shared by the local climber and protected rivals, with no second halo or orbit. */
export class RecoveryShield {
  readonly group = new THREE.Group();
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly shards: { mesh: THREE.Mesh; y: number; phase: number }[] =
    [];
  private readonly shell: THREE.ShaderMaterial;
  private readonly shardMaterial: THREE.MeshBasicMaterial;
  private disposed = false;

  constructor() {
    this.group.name = 'Recovery shield';
    this.group.visible = false;
    this.shell = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      uniforms: { opacity: { value: 0 }, phase: { value: 0 } },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vView;
        varying vec3 vLocal;
        varying vec3 vCurve;
        void main() {
          vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vCurve = normalMatrix * vec3(position.x / 0.77, (position.y - 0.18) / 1.08, position.z / 0.46);
          vView = -viewPosition.xyz;
          vLocal = position;
          gl_Position = projectionMatrix * viewPosition;
        }
      `,
      fragmentShader: `
        uniform float opacity;
        uniform float phase;
        varying vec3 vNormal;
        varying vec3 vView;
        varying vec3 vLocal;
        varying vec3 vCurve;
        vec2 hash(vec2 p) {
          return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
        }
        // Irregular frost cells, concentrated at the feet and outer edges.
        float frostCracks(vec2 p) {
          vec2 cell = floor(p), local = fract(p);
          float first = 8.0, second = 8.0;
          for (int y = -1; y <= 1; y++) {
            for (int x = -1; x <= 1; x++) {
              vec2 neighbor = vec2(float(x), float(y));
              vec2 delta = neighbor + hash(cell + neighbor) - local;
              float distanceSquared = dot(delta, delta);
              second = min(second, max(first, distanceSquared));
              first = min(first, distanceSquared);
            }
          }
          float edge = sqrt(second) - sqrt(first);
          float aa = max(fwidth(edge), 0.012);
          return 1.0 - smoothstep(0.012, 0.012 + aa, edge);
        }
        void main() {
          vec3 view = normalize(vView);
          float rim = pow(1.0 - max(dot(normalize(vCurve), view), 0.0), 2.0);
          float facet = pow(1.0 - max(dot(normalize(vNormal), view), 0.0), 1.6);
          float sides = smoothstep(0.30, 0.79, abs(vLocal.x));
          float crown = smoothstep(0.72, 1.22, vLocal.y);
          float base = 1.0 - smoothstep(-0.77, -0.12, vLocal.y);
          float frost = clamp(sides + crown * 0.6 + base * 0.55, 0.0, 1.0);
          float cracks = frostCracks(vLocal.xy * 8.5 + vLocal.z * 0.7) * frost;
          float dust = pow(hash(floor(vLocal.xy * 145.0)).x, 24.0) * frost;
          float shimmer = pow(0.5 + 0.5 * sin(vLocal.y * 3.0 - phase), 10.0);
          vec3 ice = mix(vec3(0.12, 0.58, 0.94), vec3(0.72, 1.05, 1.18), clamp(rim * 0.7 + cracks * 0.6 + facet * 0.18, 0.0, 1.0));
          ice += vec3(0.05, 0.28, 0.36) * pow(rim, 3.0);
          float alpha = 0.025 + rim * 0.68 + facet * 0.13 + frost * 0.05 + cracks * 0.29 + dust * 0.17 + shimmer * rim * 0.05;
          gl_FragColor = vec4(ice, opacity * min(alpha, 0.82));
          #include <colorspace_fragment>
        }
      `,
    });
    const shell = this.mesh(iceShellGeometry(), this.shell);
    shell.name = 'Frost shield shell';

    // Small fragments drift in place instead of drawing another ring around the body.
    this.shardMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    });
    const shardGeometry = new THREE.OctahedronGeometry(1, 0);
    const normals = shardGeometry.getAttribute('normal');
    const colors: number[] = [];
    for (let i = 0; i < normals.count; i++) {
      const light = Math.max(
        0,
        normals.getX(i) * -0.4 + normals.getY(i) * 0.6 + normals.getZ(i) * 0.5,
      );
      colors.push(0.25 + light * 0.7, 0.65 + light * 0.35, 0.85 + light * 0.15);
    }
    shardGeometry.setAttribute(
      'color',
      new THREE.Float32BufferAttribute(colors, 3),
    );
    const fragments = [
      [-0.98, -0.35, 0.09, 0.047],
      [-0.88, 0.57, 0.05, 0.034],
      [0.94, 0.67, 0.02, 0.045],
      [0.98, -0.53, 0.08, 0.027],
    ];
    fragments.forEach(([x, y, z, size], index) => {
      const shard = this.mesh(shardGeometry, this.shardMaterial);
      shard.name = `Shield ice shard ${index + 1}`;
      shard.position.set(x, y, z);
      shard.scale.set(size, size * 1.45, size * 0.8);
      shard.rotation.set(0.3, index, 0.4 + index * 0.7);
      this.shards.push({ mesh: shard, y, phase: index * 1.7 });
    });
  }

  private mesh(geometry: THREE.BufferGeometry, material: THREE.Material) {
    this.geometries.add(geometry);
    this.materials.add(material);
    const mesh = new THREE.Mesh(geometry, material);
    this.group.add(mesh);
    return mesh;
  }

  update(remainingSeconds: number, time: number, reducedMotion: boolean): void {
    if (this.disposed) return;
    this.group.visible = remainingSeconds > 0;
    const fade = THREE.MathUtils.smoothstep(remainingSeconds, 0, 0.4);
    this.shell.uniforms.opacity.value = fade;
    this.shell.uniforms.phase.value = reducedMotion ? 0 : time * 1.15;
    this.shardMaterial.opacity = 0.72 * fade;
    for (const shard of this.shards) {
      shard.mesh.position.y =
        shard.y +
        (reducedMotion ? 0 : Math.sin(time * 1.3 + shard.phase) * 0.026);
      shard.mesh.rotation.y = reducedMotion
        ? shard.phase
        : shard.phase + time * 0.22;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.group.visible = false;
    this.geometries.forEach((geometry) => geometry.dispose());
    this.materials.forEach((material) => material.dispose());
    this.group.clear();
  }
}
