import assert from 'node:assert/strict';
import test from 'node:test';
import { TowerEngine, freshControls } from '../lib/tower-engine.ts';
import { replayGuidance, skipGuidance } from '../lib/climb-guidance.ts';
import {
  getFirstJumpGuidance,
  shouldStartFirstJumpGuidance,
  firstJumpInstruction,
} from '../lib/first-jump-guidance.ts';

const start = () => {
  const engine = new TowerEngine(73091);
  engine.start();
  return engine;
};

void test('first-jump guidance selects the next real ledge without changing engine or controls', () => {
  const engine = start();
  const controls = freshControls();
  const before = JSON.stringify(engine);
  const guidance = getFirstJumpGuidance(engine, controls, null, true)!;
  const ledge = engine.platforms.find((platform) => platform.id === 1)!;
  assert.equal(guidance.targetId, ledge.id);
  assert.equal(guidance.x, ledge.x);
  assert.equal(guidance.direction, ledge.x < engine.x ? 'left' : 'right');
  assert.equal(guidance.phase, 'move');
  assert.equal(JSON.stringify(engine), before);
  assert.deepEqual(controls, freshControls());
});

void test('keeps the landing marker on the same ledge throughout takeoff and descent', () => {
  const engine = start();
  let guidance = getFirstJumpGuidance(engine, freshControls(), null, true)!;
  engine.grounded = false;
  engine.standingId = -1;
  engine.y = guidance.y + 1;
  engine.vy = 2;
  guidance = getFirstJumpGuidance(engine, freshControls(), guidance, true)!;
  assert.equal(guidance.targetId, 1);
  assert.equal(guidance.phase, 'airborne');
  engine.vy = -2;
  engine.x = guidance.x;
  guidance = getFirstJumpGuidance(engine, freshControls(), guidance, true)!;
  assert.equal(guidance.targetId, 1);
  assert.equal(guidance.direction, null);
  assert.match(firstJumpInstruction(guidance, true), /Release the arrow/);
  engine.grounded = true;
  engine.standingId = 1;
  engine.floor = 1;
  assert.equal(
    getFirstJumpGuidance(engine, freshControls(), guidance, true)?.targetId,
    2,
  );
});

void test('prompts a fresh jump press and does not ask players to run off an edge', () => {
  const engine = start();
  const target = getFirstJumpGuidance(engine, freshControls(), null, true)!;
  const side = target.direction === 'left' ? -1 : 1;
  engine.vx = side * 3;
  assert.equal(
    getFirstJumpGuidance(engine, freshControls(), null, true)?.phase,
    'jump',
  );
  const held = getFirstJumpGuidance(
    engine,
    { ...freshControls(), jump: true },
    null,
    true,
  )!;
  assert.equal(held.phase, 'release');
  assert.match(firstJumpInstruction(held, true), /Release JUMP/);
  assert.match(firstJumpInstruction(held, false), /Release Space/);
  const base = engine.platforms[0];
  base.width = 1;
  engine.vx = 0;
  assert.equal(
    getFirstJumpGuidance(engine, freshControls(), null, true)?.phase,
    'jump',
  );
});

void test('guidance retires after three landed floors or a minute and respects its visibility gate', () => {
  const engine = start();
  const profile = replayGuidance();
  assert.equal(shouldStartFirstJumpGuidance(profile), true);
  assert.equal(shouldStartFirstJumpGuidance(skipGuidance(profile)), false);
  assert.equal(
    shouldStartFirstJumpGuidance(
      {
        ...profile,
        completed: ['move', 'jump', 'momentum'],
      },
      3,
    ),
    false,
  );
  assert.equal(
    getFirstJumpGuidance(engine, freshControls(), null, false),
    null,
  );
  engine.status = 'paused';
  assert.equal(getFirstJumpGuidance(engine, freshControls(), null, true), null);
  engine.status = 'playing';
  engine.time = 60.1;
  assert.equal(getFirstJumpGuidance(engine, freshControls(), null, true), null);
  engine.time = 1;
  engine.floor = 3;
  assert.equal(getFirstJumpGuidance(engine, freshControls(), null, true), null);
});

void test('never directs beginners to a moving, spring, broken or unreachable ledge', () => {
  for (const kind of ['moving', 'spring', 'crumble', 'height'] as const) {
    const engine = start();
    const next = engine.platforms[1];
    if (kind === 'crumble') next.crumble = { broken: true, remaining: 0 };
    else if (kind === 'height') next.y = 5;
    else next[kind] = true;
    assert.equal(
      getFirstJumpGuidance(engine, freshControls(), null, true),
      null,
      kind,
    );
  }
});

void test('asks for air braking before releasing direction, and hides an already missed ledge', () => {
  const engine = start();
  const target = getFirstJumpGuidance(engine, freshControls(), null, true)!;
  engine.grounded = false;
  engine.standingId = -1;
  engine.x = target.x;
  engine.y = target.y + 1;
  engine.vy = -1;
  engine.vx = 7;
  assert.equal(
    getFirstJumpGuidance(engine, freshControls(), target, true)?.direction,
    'left',
  );
  engine.vx = -7;
  assert.equal(
    getFirstJumpGuidance(engine, freshControls(), target, true)?.direction,
    'right',
  );
  engine.y = target.y - 0.1;
  assert.equal(
    getFirstJumpGuidance(engine, freshControls(), target, true),
    null,
  );
});

void test('a failed fast first jump still gets a landing guide on retry', () => {
  const profile = {
    ...replayGuidance(),
    completed: ['move', 'jump', 'momentum'] as ('move' | 'jump' | 'momentum')[],
  };
  assert.equal(shouldStartFirstJumpGuidance(profile, 0), true);
  assert.equal(shouldStartFirstJumpGuidance(profile, 2), true);
  assert.equal(shouldStartFirstJumpGuidance(profile, 3), false);
  assert.equal(shouldStartFirstJumpGuidance(skipGuidance(profile), 0), false);
});

void test('following the displayed cues reaches floor three across seeded openings', () => {
  for (const mode of ['arcade', 'party'] as const) {
    for (const seed of [
      1, 2, 5, 9, 16, 24, 37, 58, 73, 99, 73091, 4294967295,
    ]) {
      const engine = new TowerEngine(seed);
      engine.start(mode);
      let previous: ReturnType<typeof getFirstJumpGuidance> = null;
      let controls = freshControls();
      for (
        let frame = 0;
        frame < 3600 && engine.floor < 3 && engine.status === 'playing';
        frame++
      ) {
        previous = getFirstJumpGuidance(engine, controls, previous, true);
        // Deliberately respond only every 200ms instead of perfect per-frame input.
        if (frame % 12 === 0)
          controls = {
            left: previous?.direction === 'left',
            right: previous?.direction === 'right',
            jump: previous?.phase === 'jump',
          };
        engine.tick(1 / 60, controls);
        engine.drainEvents();
      }
      assert.ok(
        engine.floor >= 3,
        `${mode} seed ${seed}: stopped at floor ${engine.floor}`,
      );
      assert.equal(
        getFirstJumpGuidance(engine, controls, previous, true),
        null,
      );
    }
  }
});
