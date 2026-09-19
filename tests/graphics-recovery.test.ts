import test from 'node:test';
import assert from 'node:assert/strict';
import { GraphicsRecovery } from '../lib/graphics-recovery.ts';
import { TowerEngine, freshControls } from '../lib/tower-engine.ts';

void test('context loss pauses the climb and discards frames until recovery and explicit resume', () => {
  const canvas = new EventTarget();
  const engine = new TowerEngine();
  engine.start('arcade');
  const controls = { ...freshControls(), right: true };
  let recoveryCount = 0;
  const recovery = new GraphicsRecovery(canvas, {
    lost: () => {
      engine.togglePause();
      Object.assign(controls, freshControls());
    },
    restored: () => {
      recoveryCount++;
    },
    failed: (error) => {
      throw error;
    },
  });
  const frame = () => engine.tick(1 / 60, controls);
  recovery.frame(frame);
  const time = engine.time;
  const lost = new Event('webglcontextlost', { cancelable: true });
  canvas.dispatchEvent(lost);
  canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  assert.equal(lost.defaultPrevented, true);
  assert.equal(engine.status, 'paused');
  assert.deepEqual(controls, freshControls());
  for (let i = 0; i < 120; i++) recovery.frame(frame);
  assert.equal(engine.time, time);
  canvas.dispatchEvent(new Event('webglcontextrestored'));
  recovery.frame(frame);
  assert.equal(recoveryCount, 1);
  assert.equal(engine.time, time);
  assert.equal(engine.status, 'paused');
  engine.togglePause();
  recovery.frame(frame);
  assert.ok(engine.time > time);
  recovery.dispose();
});

void test('a thrown frame is reported once and cannot silently resume after a context event', () => {
  const canvas = new EventTarget();
  const errors: unknown[] = [];
  const error = new Error('GPU frame failed');
  const recovery = new GraphicsRecovery(canvas, {
    lost: () => assert.fail('Unexpected loss callback'),
    restored: () => assert.fail('Unexpected restoration callback'),
    failed: (value) => errors.push(value),
  });
  recovery.frame(() => {
    throw error;
  });
  recovery.frame(() => assert.fail('must not draw again'));
  canvas.dispatchEvent(new Event('webglcontextrestored'));
  assert.deepEqual(errors, [error]);
  assert.equal(recovery.blocked, true);
  recovery.dispose();
});

void test('failed restoration remains blocked and disposed canvases cannot update the game', () => {
  const canvas = new EventTarget();
  let losses = 0;
  let failures = 0;
  const recovery = new GraphicsRecovery(canvas, {
    lost: () => {
      losses++;
    },
    restored: () => {
      throw new Error('restoration failed');
    },
    failed: () => {
      failures++;
    },
  });
  canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  canvas.dispatchEvent(new Event('webglcontextrestored'));
  assert.equal(recovery.blocked, true);
  assert.equal(failures, 1);
  recovery.dispose();
  canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  canvas.dispatchEvent(new Event('webglcontextrestored'));
  recovery.frame(() => assert.fail('disposed frame'));
  assert.equal(losses, 1);
  assert.equal(failures, 1);
});

void test('context loss stops waiting after 12 seconds and a late restore cannot restart play', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const canvas = new EventTarget();
  const errors: unknown[] = [];
  const recovery = new GraphicsRecovery(canvas, {
    lost: () => {},
    restored: () =>
      assert.fail('Late restore must not resume a failed renderer'),
    failed: (error) => errors.push(error),
  });
  canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  t.mock.timers.tick(11_999);
  assert.equal(errors.length, 0);
  t.mock.timers.tick(1);
  assert.equal((errors[0] as Error).name, 'GraphicsRecoveryTimeoutError');
  assert.equal(recovery.blocked, true);
  canvas.dispatchEvent(new Event('webglcontextrestored'));
  t.mock.timers.tick(12_000);
  assert.equal(errors.length, 1);
  recovery.dispose();
});

void test('restoration and disposal cancel pending recovery timeouts', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const canvas = new EventTarget();
  let restored = 0;
  const recovery = new GraphicsRecovery(canvas, {
    lost: () => {},
    restored: () => {
      restored++;
      assert.equal(
        recovery.blocked,
        false,
        'ready reporting can observe recovery',
      );
    },
    failed: () =>
      assert.fail('The cancelled timeout must not report a failure'),
  });
  canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  t.mock.timers.tick(6_000);
  canvas.dispatchEvent(new Event('webglcontextrestored'));
  t.mock.timers.tick(12_000);
  assert.equal(restored, 1);
  assert.equal(recovery.blocked, false);
  canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  recovery.dispose();
  t.mock.timers.tick(12_000);
  assert.equal(recovery.blocked, true);
});
