import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyReturnMessage } from '../lib/daily-return.ts';
import { dailyForDate } from '../lib/daily-tower.ts';

void test('classic and archived runs offer today, while the current daily keeps retries focused', () => {
  const now = new Date('2026-09-19T21:00:00Z');
  assert.equal(dailyReturnMessage(null, now).action, 'Try today’s tower');
  assert.equal(
    dailyReturnMessage(dailyForDate('2026-09-18'), now).action,
    'Try today’s tower',
  );
  assert.equal(
    dailyReturnMessage(dailyForDate('2026-09-19', 7), now).action,
    'Try today’s tower',
  );
  const active = dailyReturnMessage(dailyForDate('2026-09-19'), now);
  assert.equal(active.action, null);
  assert.match(active.message, /new route at 00:00 UTC/);
});

void test('return invitation changes at the actual UTC daily rollover', () => {
  const daily = dailyForDate('2026-09-19');
  assert.equal(
    dailyReturnMessage(daily, new Date('2026-09-19T23:59:59Z')).action,
    null,
  );
  assert.equal(
    dailyReturnMessage(daily, new Date('2026-09-20T00:00:00Z')).action,
    'Try today’s tower',
  );
});
