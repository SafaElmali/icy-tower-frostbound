import test from 'node:test';
import assert from 'node:assert/strict';
import { TowerEngine, freshControls } from '../lib/tower-engine.ts';
import { challengeFromRun, challengeText, challengeUrl, decodeChallenge, startChallengeRun } from '../lib/friend-challenge.ts';

void test('completed runs round-trip layout, mode, floor, and score in a compact link', () => {
  for (const mode of ['arcade', 'party', 'practice'] as const) {
    const host = new TowerEngine(0xffffffff);
    host.start(mode); host.floor = 87; host.score = 123450; host.status = 'over';
    const challenge = challengeFromRun(host)!;
    const url = new URL(challengeUrl('https://example.com/play?challenge=old&tracking=1#old', challenge));
    assert.equal(url.pathname, '/play'); assert.equal(url.hash, '');
    assert.equal(url.searchParams.size, 1);
    const decoded = decodeChallenge(url.searchParams.get('challenge'))!;
    assert.deepEqual(decoded, challenge);
    const recipient = new TowerEngine(); startChallengeRun(recipient, decoded, 'arcade');
    assert.equal(recipient.mode, mode); assert.deepEqual(recipient.platforms, host.platforms);
    assert.match(challengeText(challenge), /^Beat my floor 87\. 123,450 points/);
    assert.ok(url.href.length < 100);
  }
});

void test('shared seeds and retries reproduce platforms, moving ledges, gems, and scores', () => {
  const challenge = decodeChallenge('2.42.p.87.123450')!;
  const original = new TowerEngine(challenge.seed), friend = new TowerEngine();
  original.start('practice'); startChallengeRun(friend, challenge, 'arcade');
  assert.equal(friend.mode, 'practice');
  const initial = structuredClone(original.platforms);
  let wasJump = false;
  let target = original.platforms[1];
  for (let i = 0; i < 24000 && original.floor < 90; i++) {
    if (original.grounded) target = original.platforms.find(p => p.id === original.standingId + 1)!;
    const steering = (target.x - original.x) * 3.8 - original.vx * 1.1;
    const jump: boolean = original.grounded && !wasJump;
    const input = { left: steering < -.35, right: steering > .35, jump };
    original.tick(1 / 120, input); friend.tick(1 / 120, input); wasJump = jump;
  }
  assert.ok(original.floor >= 90);
  assert.deepEqual(friend.platforms, original.platforms);
  assert.deepEqual(friend.snapshot(), original.snapshot());
  startChallengeRun(friend, challenge, 'arcade');
  assert.equal(friend.floor, 0); assert.equal(friend.score, 0);
  assert.equal(friend.mode, 'practice'); assert.deepEqual(friend.platforms, initial);
  const arcade = { ...challenge, mode: 'arcade' as const };
  startChallengeRun(friend, arcade, 'practice');
  assert.equal(friend.mode, 'arcade'); assert.equal(friend.seed, challenge.seed);
});

void test('invalid and unsupported challenge links are rejected without throwing', () => {
  for (const value of [null, '', '1.42.a.87.100', '4.42.a.87.100', '2.42.t.87.100', '2.42.x.87.100', '2.42.a.0.100', '2.-1.a.87.100', '2.4294967296.a.87.100', '2.42.a.87.-1', '2.42.a.87.NaN', '2.42.a.87.Infinity', '2.42.a.87.1e3', '2.42.a.87.1.5', '2.42.a.9007199254740992.100', '2.42.a.87.9007199254740992', '2.42.a.87.100.extra', '2. 42.a.87.100', '2.042.a.87.100', 'x'.repeat(10000)]) {
    assert.equal(decodeChallenge(value), null, String(value).slice(0, 100));
  }
  assert.deepEqual(decodeChallenge('2.0.a.1.0'), { version: 2, seed: 0, mode: 'arcade', floor: 1, score: 0 });
});

void test('sharing is limited to completed climbs and ordinary runs still select their mode', () => {
  const engine = new TowerEngine();
  assert.equal(challengeFromRun(engine), null);
  startChallengeRun(engine, null, 'practice'); engine.floor = 1;
  assert.equal(engine.mode, 'practice'); assert.equal(challengeFromRun(engine), null);
  engine.togglePause(); assert.equal(challengeFromRun(engine), null);
  engine.status = 'over'; assert.ok(challengeFromRun(engine));
  engine.floor = 0; assert.equal(challengeFromRun(engine), null);
  startChallengeRun(engine, null, 'arcade');
  assert.equal(engine.mode, 'arcade'); assert.equal(engine.floor, 0);
  engine.tick(1 / 120, freshControls()); assert.ok(engine.time > 0);
});
