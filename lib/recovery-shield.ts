import * as THREE from 'three';

/** A body-centered ice barrier, shared by the local climber and protected rivals. */
export class RecoveryShield {
  readonly group = new THREE.Group();
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly accents: { material: THREE.MeshBasicMaterial; opacity: number }[] = [];
  private readonly orbit = new THREE.Group();
  private readonly shell: THREE.ShaderMaterial;
  private disposed = false;

  constructor() {
    this.group.name = 'Recovery shield';
    this.group.visible = false;
    this.shell = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, toneMapped: false,
      uniforms: { opacity: { value: 0 }, phase: { value: 0 } },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vView;
        varying vec3 vLocal;
        void main() {
          vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
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
        void main() {
          float rim = pow(1.0 - max(dot(normalize(vNormal), normalize(vView)), 0.0), 2.6);
          vec2 grid = vLocal.xy * vec2(5.0, 6.4);
          vec2 spacing = vec2(1.0, 1.73205);
          vec2 a = mod(grid, spacing) - spacing * 0.5;
          vec2 b = mod(grid - spacing * 0.5, spacing) - spacing * 0.5;
          vec2 cell = abs(dot(a, a) < dot(b, b) ? a : b);
          float edge = max(cell.x, dot(cell, vec2(0.5, 0.866025)));
          float etching = smoothstep(0.455, 0.49, edge);
          float sweep = pow(0.5 + 0.5 * sin(vLocal.y * 4.0 - phase), 14.0);
          vec3 frost = mix(vec3(0.27, 0.76, 1.0), vec3(0.86, 1.0, 1.0), rim);
          float alpha = 0.025 + rim * 0.57 + etching * (0.025 + rim * 0.16) + sweep * rim * 0.1;
          gl_FragColor = vec4(frost, opacity * alpha);
          #include <colorspace_fragment>
        }
      `,
    });
    const shell = this.mesh(new THREE.SphereGeometry(1, 32, 24), this.shell, this.group);
    shell.name = 'Frost shield shell';
    shell.scale.set(.8, 1.04, .64);

    // A quiet continuous rim makes protection readable even on small screens.
    // The middle stays almost clear so hats, faces and sweaters remain visible.
    const glow = this.mesh(new THREE.RingGeometry(1.005, 1.065, 64), this.accent(0x68dcff, .2), this.group);
    glow.name = 'Shield rim glow'; glow.scale.set(.8, 1.04, 1);
    const rim = this.mesh(new THREE.RingGeometry(1.023, 1.037, 64), this.accent(0xd3fbff, .7), this.group);
    rim.name = 'Shield outline'; rim.scale.set(.8, 1.04, 1); rim.position.z = .015;

    this.orbit.name = 'Shield orbit'; this.orbit.scale.set(.8, 1.04, 1); this.group.add(this.orbit);
    const arcGeometry = new THREE.RingGeometry(1.066, 1.083, 18, 1, 0, Math.PI * .28);
    const crystalGeometry = new THREE.OctahedronGeometry(1, 0);
    const arcMaterial = this.accent(0x97edff, .8), crystalMaterial = this.accent(0xe4ffff, .92);
    for (let i = 0; i < 3; i++) {
      const angle = i * Math.PI * 2 / 3 + .25;
      const arc = this.mesh(arcGeometry, arcMaterial, this.orbit); arc.rotation.z = angle;
      const crystal = this.mesh(crystalGeometry, crystalMaterial, this.orbit);
      crystal.position.set(Math.cos(angle) * 1.075, Math.sin(angle) * 1.075, .035);
      crystal.scale.set(.035, .068, .025); crystal.rotation.z = angle - Math.PI / 2;
    }
  }

  private mesh(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D) {
    this.geometries.add(geometry); this.materials.add(material);
    const mesh = new THREE.Mesh(geometry, material); parent.add(mesh); return mesh;
  }

  private accent(color: number, opacity: number) {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    this.accents.push({ material, opacity }); return material;
  }

  update(remainingSeconds: number, time: number, reducedMotion: boolean): void {
    if (this.disposed) return;
    this.group.visible = remainingSeconds > 0;
    const fade = THREE.MathUtils.smoothstep(remainingSeconds, 0, .4);
    this.shell.uniforms.opacity.value = fade;
    this.shell.uniforms.phase.value = reducedMotion ? 0 : time * 1.7;
    for (const accent of this.accents) accent.material.opacity = accent.opacity * fade;
    this.orbit.rotation.z = reducedMotion ? .15 : time * .28;
    this.group.scale.setScalar(reducedMotion ? 1 : 1 + Math.sin(time * 2.8) * .012);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.group.visible = false;
    this.geometries.forEach(geometry => geometry.dispose());
    this.materials.forEach(material => material.dispose());
    this.group.clear();
  }
}
