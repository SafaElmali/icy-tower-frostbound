import test from 'node:test';
import assert from 'node:assert/strict';
import { TowerEngine, freshControls, type RankedMode } from '../lib/tower-engine.ts';
import { verifySubmission } from '../lib/leaderboard.ts';
import { bestGhost, readGhost, TowerGhost } from '../lib/tower-ghost.ts';

function recordActionClimb(mode: RankedMode) {
  // These fixtures reach encounters in both modes while taking real hazard hits.
  const engine = new TowerEngine(mode === 'party' ? 723 : 17); engine.start(mode);
  let target = engine.platforms[1], wasJump = false;
  const events = new Set<string>();
  const checkpoints: { time: number; x: number; y: number; score: number; action: TowerEngine['action'] }[] = [];
  for (let frame = 0; frame < 36000 && engine.status === 'playing'; frame++) {
    if (frame === 300 || frame === 2700) {
      engine.togglePause(); engine.tick(.1, freshControls()); engine.togglePause();
    }
    if (engine.grounded || (mode === 'party' && engine.floor >= target.id)) {
      target = engine.platforms.find(platform => platform.id === engine.floor + 1) ?? target;
    }
    const steering = (target.x - engine.x) * 3.8 - engine.vx * 1.1;
    const jump: boolean = !wasJump && (engine.grounded || (mode === 'party' && engine.snapshot().doubleJumpReady && engine.vy < 0));
    engine.tick(frame % 5 === 0 ? 1 / 60 : 1 / 120, engine.floor >= 65 ? freshControls() : { left: steering < -.35, right: steering > .35, jump });
    wasJump = jump;
    for (const event of engine.drainEvents()) events.add(event.type);
    if (frame % 120 === 0 || engine.snapshot().status === 'over') checkpoints.push({ time: engine.time, x: engine.x, y: engine.y, score: engine.score, action: structuredClone(engine.action) });
  }
  assert.equal(engine.status, 'over');
  assert.ok(engine.floor >= 30, 'ordinary inputs reach the first tower encounter');
  for (const event of ['icicle-warning', 'frenzy', 'encounter']) assert.ok(events.has(event), `${mode} must exercise ${event}`);
  return { engine, checkpoints, events };
}

void test('action runs verify on the server with the same scores in Classic and Party', () => {
  for (const mode of ['arcade', 'party'] as const) {
    const { engine } = recordActionClimb(mode);
    const replay = engine.getReplay()!;
    assert.equal(replay.version, 8);
    const verified = verifySubmission({ name: 'Action climber', replay });
    assert.equal(verified.mode, mode);
    assert.equal(verified.score, engine.score);
    assert.equal(verified.floor, engine.floor);
    assert.equal(verified.combo, engine.bestCombo);
    assert.equal(verified.duration, Math.round(engine.time * 1000));
  }
});

void test('a saved action ghost reproduces hazards, frenzy, encounters, and recovery state', () => {
  const { engine, checkpoints, events } = recordActionClimb('arcade');
  assert.ok(events.has('crumble')); assert.ok(events.has('collapse'));
  const record = bestGhost(null, engine)!;
  assert.deepEqual(readGhost(JSON.stringify(record)), record);
  const ghost = new TowerGhost(record);
  for (const point of checkpoints) {
    ghost.advanceTo(point.time);
    assert.equal(ghost.engine.x, point.x);
    assert.equal(ghost.engine.y, point.y);
    assert.equal(ghost.engine.score, point.score);
    assert.deepEqual(ghost.engine.action, point.action);
  }
  assert.equal(ghost.finished, true);
});
