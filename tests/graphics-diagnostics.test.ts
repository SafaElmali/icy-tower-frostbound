import test from 'node:test';
import assert from 'node:assert/strict';
import { graphicsFailureCode } from '../lib/graphics-diagnostics.ts';

void test('known graphics and transport failures become bounded diagnostic codes', () => {
  assert.equal(
    graphicsFailureCode(
      new Error('Error creating WebGL context.'),
      'load_failed',
    ),
    'webgl_unavailable',
  );
  assert.equal(
    graphicsFailureCode(
      new Error('THREE.WebGLRenderer: WebGL 1 is not supported since r163.'),
      'load_failed',
    ),
    'webgl_unavailable',
  );
  assert.equal(
    graphicsFailureCode(
      new DOMException('aborted', 'AbortError'),
      'load_failed',
    ),
    'load_aborted',
  );
  assert.equal(
    graphicsFailureCode(
      new RangeError('Array buffer allocation failed'),
      'load_failed',
    ),
    'allocation_failed',
  );
});

void test('diagnostics never forward arbitrary messages, URLs or stack traces', () => {
  assert.equal(
    graphicsFailureCode(
      new TypeError(
        'Failed to fetch dynamically imported module: https://example.com/?token=private',
      ),
      'import_failed',
    ),
    'network_failed',
  );
  assert.equal(
    graphicsFailureCode(new Error('private runtime details'), 'render_failed'),
    'render_failed',
  );
  assert.equal(
    graphicsFailureCode('private rejected value', 'load_failed'),
    'load_failed',
  );
  assert.equal(graphicsFailureCode(null, 'load_failed'), 'load_failed');
});
