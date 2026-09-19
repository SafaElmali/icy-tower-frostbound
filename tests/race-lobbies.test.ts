import test from 'node:test';
import assert from 'node:assert/strict';
import { RaceService } from '../lib/race-server.ts';
import { MemoryRaceStore } from '../lib/race-dev-server.ts';
import { createRaceHandler } from '../lib/race-http.ts';
import {
  listRaceLobbies,
  RaceConnection,
  newRaceSession,
} from '../lib/race-client.ts';
import {
  DEFAULT_RACE_SETTINGS,
  RACE_DISCONNECT_MS,
  RACE_ROOM_TTL_MS,
} from '../lib/race-protocol.ts';

function setup() {
  let now = Date.now();
  const store = new MemoryRaceStore();
  const service = new RaceService(
    store,
    () => now,
    () => 17,
  );
  const room = 'a'.repeat(32),
    host = '1'.repeat(64);
  const create = (visibility: 'public' | 'private' = 'public') =>
    service.act(
      { action: 'create', room, visibility, profile: { name: 'Snow rider' } },
      host,
    );
  return {
    service,
    store,
    room,
    host,
    create,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

void test('public discovery exposes only safe summaries; private and legacy rooms stay unlisted', async () => {
  const h = setup();
  await h.create();
  await h.service.act(
    { action: 'create', room: 'b'.repeat(32), visibility: 'private' },
    '2'.repeat(64),
  );
  await h.service.act(
    { action: 'create', room: 'c'.repeat(32) },
    '3'.repeat(64),
  );
  assert.deepEqual(await h.service.listLobbies(), {
    lobbies: [
      {
        id: h.room,
        hostName: 'Snow rider',
        players: 1,
        settings: DEFAULT_RACE_SETTINGS,
      },
    ],
    limited: false,
  });
  await assert.rejects(
    h.service.act({ action: 'poll', room: h.room }, '4'.repeat(64)),
    { status: 403 },
  );
  await assert.rejects(
    h.service.act(
      { action: 'create', room: 'd'.repeat(32), visibility: 'secret' },
      h.host,
    ),
    { status: 400 },
  );
  // Retrying creation cannot silently change an existing room's visibility.
  await h.create('private');
  assert.equal((await h.service.listLobbies()).lobbies.length, 1);
});

void test('listed rooms update rules, hide at capacity, and admit only three concurrent guests', async () => {
  const h = setup();
  await h.create();
  const settings = { mode: 'arcade' as const, targetFloor: 50, durationMs: 60_000, bumping: true };
  await h.service.act(
    { action: 'configure', room: h.room, round: 1, settings },
    h.host,
  );
  assert.deepEqual(
    (await h.service.listLobbies()).lobbies[0].settings,
    settings,
  );
  const guests = ['2', '3', '4', '5'].map((n) => n.repeat(64));
  const joins = await Promise.allSettled(
    guests.map((token) =>
      h.service.act({ action: 'join', room: h.room }, token),
    ),
  );
  assert.equal(joins.filter((r) => r.status === 'fulfilled').length, 3);
  assert.equal((await h.service.listLobbies()).lobbies.length, 0);
  const guest = guests[joins.findIndex((r) => r.status === 'fulfilled')];
  await h.service.act({ action: 'leave', room: h.room, round: 1 }, guest);
  assert.equal((await h.service.listLobbies()).lobbies[0].players, 3);
});

void test('countdowns hide rooms and reject late joins; cancelling readiness lists them again', async () => {
  const h = setup();
  await h.create();
  const guest = '2'.repeat(64);
  await h.service.act({ action: 'join', room: h.room }, guest);
  await h.service.act(
    { action: 'ready', room: h.room, round: 1, ready: true },
    h.host,
  );
  await h.service.act(
    { action: 'ready', room: h.room, round: 1, ready: true },
    guest,
  );
  assert.equal((await h.service.listLobbies()).lobbies.length, 0);
  await assert.rejects(
    h.service.act({ action: 'join', room: h.room }, '3'.repeat(64)),
    { status: 409 },
  );
  await h.service.act(
    { action: 'ready', room: h.room, round: 1, ready: false },
    guest,
  );
  assert.equal((await h.service.listLobbies()).lobbies.length, 1);
  await h.service.act({ action: 'leave', room: h.room, round: 1 }, h.host);
  assert.equal((await h.service.listLobbies()).lobbies.length, 0);
});

void test('offline hosts cannot admit newcomers; host return restores listing; expiry stays final', async () => {
  const h = setup();
  await h.create();
  h.advance(RACE_DISCONNECT_MS);
  assert.equal((await h.service.listLobbies()).lobbies.length, 0);
  await assert.rejects(
    h.service.act({ action: 'join', room: h.room }, '2'.repeat(64)),
    /host has left/,
  );
  // The browser restores a saved host session by rejoining its invite.
  await h.service.act({ action: 'join', room: h.room }, h.host);
  assert.equal((await h.service.listLobbies()).lobbies.length, 1);
  h.advance(RACE_ROOM_TTL_MS);
  assert.equal((await h.service.listLobbies()).lobbies.length, 0);
  await assert.rejects(
    h.service.act({ action: 'join', room: h.room }, '2'.repeat(64)),
    { status: 410 },
  );
});

void test('abandoned guest slots are reclaimed atomically and old sessions lose room access', async () => {
  const h = setup();
  await h.create();
  const oldGuests = ['2', '3', '4'].map((n) => n.repeat(64));
  for (const token of oldGuests)
    await h.service.act({ action: 'join', room: h.room }, token);
  h.advance(RACE_DISCONNECT_MS);
  await h.service.act({ action: 'poll', room: h.room, round: 1 }, h.host);
  assert.equal((await h.service.listLobbies()).lobbies[0].players, 1);
  const results = await Promise.allSettled(
    ['5', '6', '7', '8'].map((n) =>
      h.service.act({ action: 'join', room: h.room }, n.repeat(64)),
    ),
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 3);
  for (const token of oldGuests)
    await assert.rejects(
      h.service.act({ action: 'poll', room: h.room }, token),
      { status: 403 },
    );
});

void test('HTTP discovery needs no credentials, enforces origin, and supports independent clients', async () => {
  const h = setup();
  const handler = createRaceHandler(() => h.service);
  const transport: typeof fetch = (_url, init) =>
    handler(new Request('https://tower.test/.netlify/functions/race', init));
  const host = new RaceConnection(newRaceSession(), () => {}, transport);
  const guest = new RaceConnection(
    newRaceSession(host.session.room),
    () => {},
    transport,
  );
  await host.send({ action: 'create', visibility: 'public' });
  const listed = await listRaceLobbies(new AbortController().signal, transport);
  assert.equal(listed.lobbies[0].id, host.session.room);
  assert.equal((await guest.send({ action: 'join' })).players.length, 2);
  const response = await handler(
    new Request('https://tower.test/.netlify/functions/race', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://other.test',
      },
      body: JSON.stringify({ action: 'list' }),
    }),
  );
  assert.equal(response.status, 403);
  await assert.rejects(
    listRaceLobbies(new AbortController().signal, async () =>
      Response.json({ lobbies: [{}], limited: false }),
    ),
    { status: 502 },
  );
  host.close();
  guest.close();
});

void test('uncommitted listing pointers are ignored and discovery work is bounded', async () => {
  const h = setup();
  await h.store.publishLobby('e'.repeat(32), Date.now() + 60_000);
  assert.deepEqual(await h.service.listLobbies(), {
    lobbies: [],
    limited: false,
  });
  for (let i = 0; i < 501; i++)
    await h.store.publishLobby(
      i.toString(16).padStart(32, '0'),
      Date.now() + 60_000,
    );
  assert.deepEqual(await h.service.listLobbies(), {
    lobbies: [],
    limited: true,
  });
});
