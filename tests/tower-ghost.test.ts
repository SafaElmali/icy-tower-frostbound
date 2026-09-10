import test from 'node:test';
import assert from 'node:assert/strict';
import { TowerEngine, freshControls } from '../lib/tower-engine.ts';
import { bestGhost, readGhost, startGhostRun, TowerGhost, type GhostRecord } from '../lib/tower-ghost.ts';

function recordClimb(version: 2 | 3 = 3) {
  const engine = new TowerEngine(17, true, version); engine.start('arcade');
  const checkpoints: { time: number; x: number; y: number; score: number; floor: number }[] = [];
  let target = engine.platforms[1], wasJump = false;
  for (let i = 0; i < 18000 && engine.status === 'playing'; i++) {
    if (i === 100 || i === 240) { engine.togglePause(); engine.tick(.1, freshControls()); engine.togglePause(); }
    if (engine.grounded) target = engine.platforms.find(p => p.id === engine.standingId + 1)!;
    const steering = (target.x - engine.x) * 3.8 - engine.vx * 1.1;
    const jump: boolean = engine.grounded && !wasJump;
    engine.tick([1 / 60, 1 / 144, .045][i % 3], engine.floor >= 9 ? freshControls() : { left: steering < -.35, right: steering > .35, jump });
    wasJump = jump; engine.drainEvents();
    checkpoints.push({ time: engine.time, x: engine.x, y: engine.y, score: engine.score, floor: engine.floor });
  }
  assert.equal(engine.status, 'over');
  const record = bestGhost(null, engine); assert.ok(record);
  return { engine, record, checkpoints };
}

void test('ghost reproduces every position and score across mixed frame rates and recorded pauses', () => {
  for (const version of [2, 3] as const) {
  const { record, checkpoints } = recordClimb(version);
  assert.deepEqual(readGhost(JSON.stringify(record)), record);
  const ghost = new TowerGhost(record);
  for (const point of checkpoints) {
    ghost.advanceTo(point.time);
    assert.equal(ghost.engine.x, point.x); assert.equal(ghost.engine.y, point.y);
    assert.equal(ghost.engine.floor, point.floor); assert.equal(ghost.engine.score, point.score);
  }
  assert.equal(ghost.finished, true);
  const end = ghost.engine.snapshot(); ghost.advanceTo(record.time + 120);
  assert.deepEqual(ghost.engine.snapshot(), end);
  }
});

void test('live pause freezes ghost; retry starts from zero on the same layout without changing the player', () => {
  const { record } = recordClimb();
  const ghost = new TowerGhost(record), player = new TowerEngine(record.replay.seed); player.start('arcade');
  assert.deepEqual(ghost.engine.platforms, player.platforms);
  player.tick(.1, freshControls()); ghost.advanceTo(player.time);
  player.togglePause(); const beforeGhost = ghost.engine.snapshot(), beforePlayer = player.snapshot();
  for (let i = 0; i < 50; i++) { player.tick(.1, freshControls()); ghost.advanceTo(player.time); }
  assert.deepEqual(ghost.engine.snapshot(), beforeGhost); assert.deepEqual(player.snapshot(), beforePlayer);
  const retry = new TowerGhost(record); assert.equal(retry.engine.time, 0); assert.equal(retry.engine.x, 0);
  player.togglePause(); player.tick(.1, freshControls()); ghost.advanceTo(player.time);
  assert.equal(ghost.engine.time, player.time);
});

void test('only better completed arcade recordings replace the ghost; floor, score, then time decide', () => {
  const { engine, record } = recordClimb();
  assert.equal(bestGhost(record, engine), record);
  for (const better of [{ ...record, floor: record.floor + 1 }, { ...record, score: record.score + 1 }, { ...record, time: record.time - 1 }]) {
    assert.equal(bestGhost(better, engine), better);
  }
  for (const worse of [{ ...record, floor: record.floor - 1 }, { ...record, score: record.score - 1 }, { ...record, time: record.time + 1 }]) {
    assert.notEqual(bestGhost(worse, engine), worse);
  }
  engine.mode = 'party'; assert.equal(bestGhost(record, engine), record);
  engine.start('practice'); assert.equal(bestGhost(record, engine), record);
  engine.start('arcade'); assert.equal(bestGhost(record, engine), record);
  engine.menu(); assert.equal(bestGhost(record, engine), record);
});

void test('saved ghosts round-trip and reject malformed, oversized, or incompatible browser data', () => {
  const { record } = recordClimb();
  assert.deepEqual(readGhost(JSON.stringify(record)), record);
  const withMoves = (moves: unknown) => ({ ...record, replay: { ...record.replay, moves } });
  const invalid: unknown[] = [null, {}, { ...record, floor: -1 }, { ...record, score: '1' },
    { ...record, replay: { ...record.replay, version: 1 } },
    { ...record, replay: { ...record.replay, seed: -1 } },
    { ...record, replay: { ...record.replay, version: 3, mode: 'party' } },
    withMoves([]), withMoves([[1, 9]]), withMoves([[0, 0]]), withMoves([[1, 8]]),
    withMoves([[216001, 0]]), withMoves([[1, 0]]), withMoves(Array(12001).fill([0, 8]))];
  for (const value of invalid) assert.equal(readGhost(JSON.stringify(value)), null);
  assert.equal(readGhost('{broken'), null); assert.equal(readGhost(' '.repeat(300001)), null);
});

void test('a finished ghost stays finished and the race reports passing its best floor', () => {
  const { record } = recordClimb(); const ghost = new TowerGhost(record);
  const player = new TowerEngine(); player.start();
  assert.equal(ghost.snapshot(player).lead, 0);
  ghost.advanceTo(record.time + 1); assert.equal(ghost.snapshot(player).finished, true);
  player.floor = record.floor + 1; assert.equal(ghost.snapshot(player).beaten, true);
  const malformed = { ...record, replay: { ...record.replay, moves: [[1, 0]] } } as GhostRecord;
  const short = new TowerGhost(malformed); short.advanceTo(10); assert.equal(short.finished, true);
});

void test('starting a rematch reuses the ghost tower and other modes start without it', () => {
  const { record } = recordClimb();
  const player = new TowerEngine(99);
  const ghost = startGhostRun(player, record, 'arcade');
  assert.ok(ghost); assert.equal(player.seed, record.replay.seed);
  assert.deepEqual(player.platforms, ghost.engine.platforms);
  for (const mode of ['party', 'practice'] as const) {
    assert.equal(startGhostRun(player, record, mode), null);
    assert.equal(player.mode, mode); assert.equal(player.time, 0);
  }
  assert.equal(startGhostRun(player, null, 'arcade'), null);
  assert.equal(player.mode, 'arcade');
});
