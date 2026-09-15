import test from 'node:test';
import assert from 'node:assert/strict';
import { TowerEngine } from '../lib/tower-engine.ts';
import { dailyForDate, todayDailyTower, dailyTowerToken, dailyTowerUrl, decodeDailyTower, startDailyRun, readDailyProgress, updateDailyProgress, getDailyBest, MAX_DAILY_BESTS } from '../lib/daily-tower.ts';

void test('daily dates use UTC and produce deterministic distinct tower seeds', () => {
  const a = todayDailyTower(new Date('2026-09-15T02:00:00+03:00'));
  assert.equal(a.date, '2026-09-14');
  assert.deepEqual(a, dailyForDate('2026-09-14'));
  assert.notEqual(a.seed, dailyForDate('2026-09-15')!.seed);
  // A released daily token must continue to select this seed after refactors.
  assert.equal(dailyForDate('2026-09-15')!.seed, 2631037716);
  assert.equal(a.mode, 'arcade'); assert.equal(a.version, 4);
  assert.ok(dailyForDate('2024-02-29'));
  for (const invalid of ['2026-02-29', '2026-09-31', '2026-13-01', '26-09-15', '2026-9-15', '2026-09-15T00:00:00Z', '', 'garbage']) assert.equal(dailyForDate(invalid), null);
  assert.equal(dailyForDate('2026-09-15', 5), null);
});

void test('past shared links pin their date and rules and discard competing challenge parameters', () => {
  const daily = dailyForDate('2024-02-29')!;
  const url = new URL(dailyTowerUrl('https://example.com/play?challenge=old&daily=old#old', daily));
  assert.equal(url.pathname, '/play'); assert.equal(url.hash, ''); assert.equal(url.searchParams.size, 1);
  assert.deepEqual(decodeDailyTower(url.searchParams.get('daily')), daily);
  for (const invalid of [null, '', '5.2026-09-15.a', '3.2026-09-15.a', '4.2026-09-15.p', '4.2026-09-15.t', '04.2026-09-15.a', '4.2026-09-31.a', '4.2026-09-15.a.extra', 'x'.repeat(10000)]) assert.equal(decodeDailyTower(invalid), null);
});

void test('unlimited retries and recipients always start the same Classic tower', () => {
  const daily = dailyForDate('2026-09-15')!;
  const engine = new TowerEngine();
  engine.start('party', 77, 3);
  startDailyRun(engine, daily);
  const platforms = structuredClone(engine.platforms);
  for (let attempt = 0; attempt < 20; attempt++) {
    engine.floor = 10; engine.score = 100; engine.status = 'over';
    startDailyRun(engine, daily);
    assert.equal(engine.mode, 'arcade'); assert.equal(engine.rulesVersion, 4);
    assert.equal(engine.floor, 0); assert.equal(engine.score, 0);
    assert.deepEqual(engine.platforms, platforms);
  }
  const recipient = new TowerEngine(); startDailyRun(recipient, decodeDailyTower(dailyTowerToken(daily))!);
  assert.deepEqual(recipient.platforms, platforms);
});

void test('completed daily bests survive reload, prioritize height, and reject unrelated runs', () => {
  const daily = dailyForDate('2026-09-15')!, engine = new TowerEngine();
  let profile = readDailyProgress(null);
  startDailyRun(engine, daily); engine.floor = 12; engine.score = 100;
  assert.equal(updateDailyProgress(profile, daily, engine), profile);
  engine.status = 'over'; profile = updateDailyProgress(profile, daily, engine);
  assert.deepEqual(getDailyBest(readDailyProgress(JSON.stringify(profile)), daily), { floor: 12, score: 100 });
  engine.floor = 11; engine.score = 200;
  assert.equal(updateDailyProgress(profile, daily, engine), profile);
  engine.floor = 12; profile = updateDailyProgress(profile, daily, engine);
  assert.deepEqual(getDailyBest(profile, daily), { floor: 12, score: 200 });
  engine.floor = 13; engine.score = 50; profile = updateDailyProgress(profile, daily, engine);
  assert.deepEqual(getDailyBest(profile, daily), { floor: 13, score: 50 });
  engine.floor = 20; engine.seed++;
  assert.equal(updateDailyProgress(profile, daily, engine), profile);
  engine.seed = daily.seed; engine.mode = 'practice';
  assert.equal(updateDailyProgress(profile, daily, engine), profile);
  engine.mode = 'arcade'; engine.score = NaN;
  assert.equal(updateDailyProgress(profile, daily, engine), profile);
});

void test('daily storage is bounded, tolerates corrupt data, and retains newly played archive results', () => {
  for (const raw of [null, '{bad', 'null', '[]', '{"version":2,"bests":{}}', '{"version":1,"bests":[]}', 'x'.repeat(50001)]) assert.deepEqual(readDailyProgress(raw), { version: 1, bests: {} });
  const key = dailyTowerToken(dailyForDate('2026-09-15')!);
  for (const best of [{floor:-1,score:3}, {floor:1.5,score:3}, {floor:1,score:'3'}, null]) assert.deepEqual(readDailyProgress(JSON.stringify({version:1,bests:{[key]:best}})).bests, {});
  let profile = readDailyProgress(null);
  for (let day = 0; day < 120; day++) {
    const daily = todayDailyTower(new Date(Date.UTC(2026, 0, day + 1)));
    profile = updateDailyProgress(profile, daily, {status:'over', seed:daily.seed, rulesVersion:daily.version, mode:daily.mode, floor:10, score:100});
  }
  assert.equal(Object.keys(profile.bests).length, MAX_DAILY_BESTS);
  const archive = dailyForDate('2024-02-29')!;
  profile = updateDailyProgress(profile, archive, {status:'over', seed:archive.seed, rulesVersion:4, mode:'arcade', floor:9, score:50});
  assert.equal(Object.keys(profile.bests).length, MAX_DAILY_BESTS);
  assert.deepEqual(getDailyBest(readDailyProgress(JSON.stringify(profile)), archive), {floor:9,score:50});
});
