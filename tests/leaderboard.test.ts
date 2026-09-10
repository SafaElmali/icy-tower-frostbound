import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getStore, setEnvironmentContext } from '@netlify/blobs';
import { BlobsServer } from '@netlify/blobs/server';
import { TowerEngine, freshControls } from '../lib/tower-engine.ts';
import { Leaderboard, verifySubmission, type LeaderboardEntry, type LeaderboardStore } from '../lib/leaderboard.ts';
import handler from '../netlify/functions/leaderboard.ts';

function completedRun(seed = 17, paused = false) {
  const engine = new TowerEngine(seed); engine.start('arcade');
  let target = engine.platforms[1], wasJump = false;
  for (let i = 0; i < 18000 && engine.status === 'playing'; i++) {
    if (paused && i === 100) { engine.togglePause(); engine.tick(1, freshControls()); engine.togglePause(); }
    if (engine.floor >= 12) { engine.tick(1 / 120, freshControls()); engine.drainEvents(); continue; }
    if (engine.grounded) target = engine.platforms.find(platform => platform.id === engine.standingId + 1)!;
    const steering = (target.x - engine.x) * 3.8 - engine.vx * 1.1;
    const jump: boolean = engine.grounded && !wasJump;
    engine.tick(i % 3 === 0 ? 1 / 60 : 1 / 120, { left: steering < -.35, right: steering > .35, jump });
    engine.drainEvents(); wasJump = jump;
  }
  assert.equal(engine.status, 'over'); assert.ok(engine.getReplay()); return engine;
}

void test('server verification reproduces real runs, including pauses and mixed display frame lengths', () => {
  for (const paused of [false, true]) {
    const engine = completedRun(17, paused);
    const entry = verifySubmission({ name: '  Harold  ', replay: engine.getReplay(), score: 999999999 });
    assert.equal(entry.name, 'Harold'); assert.equal(entry.score, engine.score); assert.equal(entry.floor, engine.floor); assert.equal(entry.combo, engine.bestCombo);
    assert.equal(entry.duration, Math.round(engine.time * 1000));
    assert.equal(verifySubmission({ name: 'Another name', replay: engine.getReplay() }).id, entry.id);
  }
});

void test('unfinished, malformed, excessive, zero-floor and injected-name submissions are rejected', () => {
  const engine = completedRun(); const replay = engine.getReplay()!;
  for (const input of [null, { name: '<script>', replay }, { name: 'A', replay }, { name: 'Harold', replay: { ...replay, version: 99 } }, { name: 'Harold', replay: { ...replay, moves: [[1, 0]] } }, { name: 'Harold', replay: { ...replay, moves: [[216001, 0]] } }, { name: 'Harold', replay: { ...replay, moves: [[-1, 0]] } }, { name: 'Harold', replay: { ...replay, moves: [[1, 9]] } }, { name: 'Harold', replay: { ...replay, moves: [...replay.moves, [1, 0]] } }]) assert.throws(() => verifySubmission(input));
  engine.start('practice'); assert.equal(engine.getReplay(), null);
  engine.start('arcade'); assert.equal(engine.getReplay(), null);
});

void test('real blob storage persists a run across service instances and the HTTP endpoint validates submissions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frostbound-board-'));
  const server = new BlobsServer({ directory }); const { port } = await server.start();
  try {
    setEnvironmentContext({ siteID: 'leaderboard-test', token: 'local-test', apiURL: `http://localhost:${port}`, edgeURL: `http://localhost:${port}`, uncachedEdgeURL: `http://localhost:${port}` });
    const store = getStore({ name: 'frostbound-leaderboard', consistency: 'strong' });
    const board = new Leaderboard(store); assert.deepEqual(await board.list(), []);
    const entry = verifySubmission({ name: 'Harold', replay: completedRun().getReplay() });
    assert.equal((await board.submit(entry)).rank, 1);
    assert.equal((await board.submit({ ...entry, name: 'Changed' })).entries.length, 1);
    const fresh = new Leaderboard(getStore({ name: 'frostbound-leaderboard', consistency: 'strong' }));
    assert.equal((await fresh.list())[0].name, 'Harold');
    const response = await handler(new Request('http://localhost/.netlify/functions/leaderboard'));
    assert.equal(response.status, 200); assert.equal((await response.json() as { entries: LeaderboardEntry[] }).entries.length, 1);
    const request = (body: unknown) => new Request('http://localhost/.netlify/functions/leaderboard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await handler(request({ name: 'Harold', replay: completedRun().getReplay() }))).status, 200);
    assert.equal((await handler(request({ name: 'Fake', score: 999999 }))).status, 400);
    assert.equal((await handler(new Request('http://localhost/.netlify/functions/leaderboard', { method: 'DELETE' }))).status, 405);
    assert.equal((await handler(new Request('http://localhost/.netlify/functions/leaderboard', { method: 'POST', headers: { Origin: 'https://other.example' } }))).status, 403);
    assert.equal((await handler(request({ large: 'a'.repeat(200000) }))).status, 413);
  } finally { await server.stop(); await rm(directory, { recursive: true, force: true }); }
});

void test('simultaneous finishes retry conflicting writes without losing either score', async () => {
  let data: LeaderboardEntry[] | null = null, version = 0;
  const store: LeaderboardStore = {
    async getWithMetadata() { return data ? { data: structuredClone(data), etag: String(version) } : null; },
    async setJSON(_key, next, condition) {
      await Promise.resolve();
      if ('onlyIfNew' in condition ? data !== null : condition.onlyIfMatch !== String(version)) return { modified: false };
      data = structuredClone(next as LeaderboardEntry[]); version++; return { modified: true };
    },
  };
  const entry = verifySubmission({ name: 'Harold', replay: completedRun().getReplay() });
  const board = new Leaderboard(store);
  await Promise.all([board.submit(entry), board.submit({ ...entry, id: 'second', name: 'Second', score: entry.score + 100 })]);
  assert.deepEqual((await board.list()).map(row => row.name), ['Second', 'Harold']);
  for (let i = 0; i < 55; i++) await board.submit({ ...entry, id: String(i), score: i, floor: 1 });
  assert.equal((await board.list()).length, 50);
  assert.equal((await board.submit({ ...entry, id: 'too-low', score: 1 })).rank, null);
});
