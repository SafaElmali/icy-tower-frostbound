import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { TowerWorld } from '../lib/tower-world.ts';
import { ComboStarTrail } from '../lib/combo-star-trail.ts';
import { TowerActionWorld } from '../lib/tower-action-world.ts';
import { PersonalBestMarker } from '../lib/personal-best-marker.ts';

/** Use real Three resources; only the browser GPU context is replaced. */
function fixture(complete = true) {
  let pixelRatio = 1.65;
  const released: string[] = [];
  const renderer = {
    domElement: { isConnected: false, getBoundingClientRect: () => ({ width: 360, height: 640 }) },
    shadowMap: { enabled: true },
    getSize: (size: THREE.Vector2) => size.set(360, 640),
    getPixelRatio: () => pixelRatio,
    setPixelRatio: (value: number) => { pixelRatio = value; },
    setSize: () => {},
    dispose: () => released.push('renderer'),
    forceContextLoss: () => released.push('context'),
  };
  const scene = new THREE.Scene();
  const root = new THREE.Group(); scene.add(root);
  const loadAbort = new AbortController();
  const world = Object.create(TowerWorld.prototype) as TowerWorld;
  Object.assign(world, {
    renderer, scene, root, camera: new THREE.PerspectiveCamera(), loadAbort,
    disposed: false, high: true, ledges: new Map(),
    starTrail: new ComboStarTrail(), actionWorld: new TowerActionWorld(),
    bestMarker: new PersonalBestMarker(), fleckGeometry: new THREE.BufferGeometry(),
    ...Object.fromEntries(['springMat', 'partyGemMat', 'gemMat', 'routeMat', 'crackedIceMat', 'impactFleckMat', 'frenzyFleckMat', 'fleckMat'].map(name => [name, new THREE.MeshBasicMaterial()])),
  });
  if (!complete) return { world, renderer, released, loadAbort };
  const key = new THREE.DirectionalLight();
  key.shadow.map = new THREE.WebGLRenderTarget(1024, 1024);
  key.shadow.map.addEventListener('dispose', () => released.push('shadow'));
  const env = new THREE.WebGLRenderTarget();
  env.addEventListener('dispose', () => released.push('environment'));
  const composer = new EffectComposer(renderer as unknown as THREE.WebGLRenderer);
  const bloom = new UnrealBloomPass(new THREE.Vector2(360, 640), .32, .5, .85);
  const output = new OutputPass();
  composer.addPass(bloom); composer.addPass(output);
  output.material.addEventListener('dispose', () => released.push('output'));
  bloom.renderTargetBright.addEventListener('dispose', () => released.push('bloom'));
  composer.renderTarget1.addEventListener('dispose', () => released.push('composer'));
  Object.assign(world, { key, env, composer, bloom, observer: { disconnect: () => released.push('observer') } });
  return { world, renderer, released, loadAbort, key, composer, bloom };
}

void test('performance quality releases large post-processing and shadow targets, then restores correct resolution', (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { devicePixelRatio: 2 } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'window', previous); else Reflect.deleteProperty(globalThis, 'window'); });
  const { world, composer, key, renderer, released } = fixture();
  assert.ok(composer!.renderTarget1.width > 360);
  world.setQuality(false);
  assert.equal(renderer.getPixelRatio(), 1);
  assert.equal(composer!.renderTarget1.width, 1);
  assert.equal(composer!.renderTarget1.height, 1);
  assert.equal(key!.shadow.map, null);
  assert.ok(released.includes('shadow'));
  world.setQuality(true);
  assert.equal(composer!.renderTarget1.width, 360 * 1.65);
  assert.equal(composer!.renderTarget1.height, 640 * 1.65);
  assert.equal(renderer.shadowMap.enabled, true);
  world.dispose();
});

void test('leaving a world aborts its model load and releases every GPU owner exactly once', async (t) => {
  const { world, released } = fixture();
  let signal: AbortSignal | undefined;
  t.mock.method(globalThis, 'fetch', (_url: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
    signal = options.signal as AbortSignal;
    signal.addEventListener('abort', () => reject(signal!.reason), { once: true });
  }));
  const loading = world.load();
  assert.equal(signal?.aborted, false);
  world.dispose();
  await loading;
  assert.equal(signal?.aborted, true);
  for (const owner of ['observer', 'shadow', 'environment', 'output', 'bloom', 'composer', 'renderer', 'context']) {
    assert.equal(released.filter(item => item === owner).length, 1, `${owner} must be released`);
  }
  assert.ok(released.indexOf('renderer') < released.indexOf('context'));
  const calls = [...released];
  world.dispose();
  await world.load();
  world.setQuality(true);
  assert.deepEqual(released, calls, 'stale callbacks cannot recreate disposed resources');
});

void test('a failure partway through world initialization still releases its detached context', async () => {
  const { world, released, loadAbort } = fixture(false);
  assert.doesNotThrow(() => world.dispose());
  assert.equal(loadAbort.signal.aborted, true);
  await Promise.resolve();
  assert.deepEqual(released, ['renderer', 'context']);
});

void test('effect cleanup preserves a mounted canvas context for the next renderer', async () => {
  const { world, renderer, released } = fixture(false);
  renderer.domElement.isConnected = true;
  world.dispose();
  await Promise.resolve();
  assert.deepEqual(released, ['renderer'], 'effect reinitialization must not inherit a deliberately lost context');
});

void test('unmount can detach the canvas after effect cleanup before releasing its context', async () => {
  const { world, renderer, released } = fixture(false);
  renderer.domElement.isConnected = true;
  world.dispose();
  renderer.domElement.isConnected = false;
  await Promise.resolve();
  assert.deepEqual(released, ['renderer', 'context']);
});
