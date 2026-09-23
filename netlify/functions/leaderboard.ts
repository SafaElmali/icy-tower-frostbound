import { randomUUID } from 'node:crypto';
import { captureServerEvent } from '../../lib/analytics-server.ts';
import { getStore } from '@netlify/blobs';
import type { Config } from '@netlify/functions';
import { Leaderboard, LeaderboardError, verifySubmission } from '../../lib/leaderboard.ts';
import { isLeaderboardSeason } from '../../lib/leaderboard-season.ts';

const MAX_BODY_BYTES = 192 * 1024;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

// Optional metadata is ignored unless it matches the bounded anonymous identifier contract.
// Legacy clients can still submit without analytics metadata.
export function submissionAnalyticsContext(payload: unknown) {
  const data = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const attemptId = typeof data.submissionAttemptId === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(data.submissionAttemptId) ? data.submissionAttemptId : randomUUID();
  const distinctId = typeof data.analyticsDistinctId === 'string' && /^[a-zA-Z0-9:$_.-]{1,200}$/.test(data.analyticsDistinctId) ? data.analyticsDistinctId : undefined;
  return { attemptId, distinctId };
}

export default async function handler(request: Request) {
  try {
    if (request.method !== 'GET' && request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'GET, POST' } });
    const board = new Leaderboard(getStore({ name: 'frostbound-leaderboard', consistency: 'strong' }));
    if (request.method === 'GET') {
      const params = new URL(request.url).searchParams;
      const mode = params.get('mode') ?? 'arcade', season = params.get('season') ?? 'current';
      if (mode !== 'arcade' && mode !== 'party') return json({ error: 'Choose classic or party rankings.' }, 400);
      if (!isLeaderboardSeason(season)) return json({ error: 'Choose the current or legacy season.' }, 400);
      return json({ entries: await board.list(mode, season), season });
    }
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return json({ error: 'Submit your score from the game page.' }, 403);
    if (!request.headers.get('content-type')?.includes('application/json')) return json({ error: 'Expected a score submission.' }, 415);
    if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) return json({ error: 'The run recording is too large.' }, 413);
    const reader = request.body?.getReader(); if (!reader) return json({ error: 'Missing run recording.' }, 400);
    let size = 0, text = ''; const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); return json({ error: 'The run recording is too large.' }, 413); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    let payload: unknown;
    try { payload = JSON.parse(text); } catch { return json({ error: 'Invalid score submission.' }, 400); }
    const entry = verifySubmission(payload);
    const result = await board.submit(entry);
    const { attemptId, distinctId } = submissionAnalyticsContext(payload);
    // Only capture after the authoritative board operation succeeds. An accepted
    // score outside the top 50 is verified but does not create a stored board row.
    if (distinctId) await captureServerEvent('score_verified', distinctId, {
      surface: 'solo', submission_attempt_id: attemptId, mode: entry.mode, season: entry.season,
      score: entry.score, floor: entry.floor, best_combo: entry.combo,
      active_duration_s: entry.duration / 1000, rank: result.rank, top_50: result.rank !== null,
    }, `score-verified:${entry.id}`);
    return json({ ...result, season: entry.season });
  } catch (error) {
    if (error instanceof LeaderboardError) return json({ error: error.message }, error.status);
    console.error('Leaderboard request failed', error);
    return json({ error: 'The leaderboard is unavailable right now. Please try again.' }, 503);
  }
}

export const config: Config = {
  rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
