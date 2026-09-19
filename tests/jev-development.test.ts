import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer, type ConfigEnv } from 'vite';
import {
  isJevDevelopmentEnabled,
  jevDevelopmentServer,
} from '../lib/jev-dev-server.ts';
import { JEV_API } from '../lib/jev-player.ts';

void test('Jev requires an explicit opt-in on a development server', () => {
  const dev: ConfigEnv = { command: 'serve', mode: 'development' };
  assert.equal(isJevDevelopmentEnabled(dev, 'true', 'development'), true);
  for (const flag of [undefined, '', 'false', '1', 'TRUE'])
    assert.equal(isJevDevelopmentEnabled(dev, flag, 'development'), false);
  for (const config of [
    { command: 'build', mode: 'production' },
    { command: 'build', mode: 'development' },
    { command: 'serve', mode: 'production' },
    { command: 'serve', mode: 'staging' },
    { ...dev, isPreview: true },
  ] satisfies ConfigEnv[])
    assert.equal(isJevDevelopmentEnabled(config, 'true', 'development'), false);
  assert.equal(isJevDevelopmentEnabled(dev, 'true', 'production'), false);
});

void test('the disabled local API returns 404 instead of accepting model requests', async () => {
  for (const enabled of [false, true]) {
    const server = await createServer({
      configFile: false,
      envFile: false,
      appType: 'custom',
      logLevel: 'silent',
      plugins: [jevDevelopmentServer(enabled)],
      server: { host: '127.0.0.1', port: 0, hmr: false },
    });
    try {
      await server.listen();
      const address = server.httpServer?.address();
      assert.ok(address && typeof address !== 'string');
      const url = `http://127.0.0.1:${address.port}${JEV_API}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Invalid state verifies routing without making a paid model request.
        body: '{}',
      });
      assert.equal(response.status, enabled ? 400 : 404);
      const get = await fetch(url);
      assert.equal(get.status, enabled ? 405 : 404);
    } finally {
      await server.close();
    }
  }
});
