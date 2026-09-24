import test from 'node:test';
import assert from 'node:assert/strict';
import {
  graphicsFailureMessage,
  graphicsRetryUrl,
  usesPerformanceGraphics,
} from '../lib/graphics-retry.ts';

void test('performance retry preserves iframe, daily and room parameters and is idempotent', () => {
  const current =
    'https://example.com/?platform=portal&daily=abc&room=xyz&graphics=high#game';
  const retry = graphicsRetryUrl(current);
  const url = new URL(retry);
  assert.equal(url.origin, new URL(current).origin);
  assert.equal(url.searchParams.get('platform'), 'portal');
  assert.equal(url.searchParams.get('daily'), 'abc');
  assert.equal(url.searchParams.get('room'), 'xyz');
  assert.equal(url.hash, '#game');
  assert.equal(usesPerformanceGraphics(url.search), true);
  assert.equal(graphicsRetryUrl(retry), retry);
  assert.equal(usesPerformanceGraphics('?graphics=high'), false);
  assert.equal(usesPerformanceGraphics(''), false);
});

void test('unsupported graphics has browser recovery advice without promising a quality fix', () => {
  const message = graphicsFailureMessage('webgl_unavailable');
  assert.match(message, /WebGL 2/);
  assert.match(message, /graphics acceleration/);
  assert.doesNotMatch(message, /performance mode/);
  assert.match(graphicsFailureMessage('network_failed'), /connection/);
  assert.match(
    graphicsFailureMessage('context_recovery_timeout'),
    /did not reconnect/,
  );
});

void test('a failed performance retry offers another recovery path', () => {
  const message = graphicsFailureMessage('render_failed', true);
  assert.doesNotMatch(message, /Try performance mode/);
  assert.match(message, /another browser/);
});
