import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyticsHost,
  analyticsRoute,
  cleanProperties,
  incomingLink,
  validEvent,
} from '../lib/analytics-policy.ts';
import { captureServerEvent, serverEventId } from '../lib/analytics-server.ts';

void test('analytics only permits bounded scalar properties and removes sensitive payloads', () => {
  assert.deepEqual(
    cleanProperties({
      score: 20,
      floor: NaN,
      ready: true,
      reason: null,
      unknown: 'anything',
      token: 'secret',
      name: 'player',
      url: 'https://example.com/private',
      error_code: 'Bearer secret',
      source: 'https://example.com/?token=secret',
      stage: 'a'.repeat(201),
      run_id: 'run-123',
      phase: undefined,
    }),
    { score: 20, ready: true, reason: null, run_id: 'run-123' },
  );
});

void test('routes and links retain only semantic context, never incoming payloads', () => {
  assert.equal(analyticsRoute('/race'), '/race');
  assert.equal(analyticsRoute('/secret/value'), '/');
  assert.equal(incomingLink('?challenge=private&token=secret'), 'challenge');
  assert.equal(incomingLink('?challenge=x&daily=y'), 'mixed');
  assert.equal(incomingLink('?token=secret'), 'none');
  assert.equal(
    analyticsHost('https://us.i.posthog.com/'),
    'https://us.i.posthog.com',
  );
  for (const host of [
    'http://example.com',
    'https://user:secret@example.com',
    'https://example.com/?key=x',
    'not a URL',
  ])
    assert.equal(analyticsHost(host), null);
  assert.equal(validEvent('$pageview'), true);
  assert.equal(validEvent('run_started'), true);
  assert.equal(validEvent('$snapshot'), false);
  assert.equal(validEvent('private data'), false);
});

void test('server event identifiers are stable valid UUIDs without raw room identifiers', () => {
  const id = serverEventId('race-finished:private-room:1');
  assert.match(
    id,
    /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-a[a-f0-9]{3}-[a-f0-9]{12}$/,
  );
  assert.equal(id, serverEventId('race-finished:private-room:1'));
  assert.notEqual(id, serverEventId('race-finished:private-room:2'));
});

void test('server transport respects enablement, sanitizes payloads, and isolates network failure', async () => {
  const keys = [
    'POSTHOG_ENABLED',
    'POSTHOG_KEY',
    'POSTHOG_HOST',
    'VITE_POSTHOG_ENABLED',
  ];
  const previous = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );
  const originalFetch = globalThis.fetch;
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  try {
    process.env.POSTHOG_ENABLED = 'false';
    process.env.POSTHOG_KEY = 'phc_test';
    process.env.POSTHOG_HOST = 'https://us.i.posthog.com';
    globalThis.fetch = async (url, options) => {
      assert.equal(typeof url, 'string');
      assert.equal(typeof options?.body, 'string');
      calls.push({
        url: url as string,
        body: JSON.parse(options?.body as string),
      });
      return new Response('{}');
    };
    await captureServerEvent('score_verified', 'anonymous', { score: 5 });
    assert.equal(calls.length, 0);
    process.env.POSTHOG_ENABLED = 'true';
    await captureServerEvent(
      'score_verified',
      'anonymous',
      { score: 5, name: 'private', token: 'private' },
      'stable-result',
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://us.i.posthog.com/capture/');
    assert.equal(calls[0].body.uuid, serverEventId('stable-result'));
    const props = calls[0].body.properties as Record<string, unknown>;
    assert.equal(props.distinct_id, 'anonymous');
    assert.equal(props.score, 5);
    assert.equal(props.$process_person_profile, false);
    assert.equal(props.name, undefined);
    assert.equal(props.token, undefined);
    await captureServerEvent('score_verified', 'Bearer private');
    assert.equal(calls.length, 1);
    globalThis.fetch = async () => {
      throw new Error('offline');
    };
    await assert.doesNotReject(
      captureServerEvent('score_verified', 'anonymous'),
    );
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
