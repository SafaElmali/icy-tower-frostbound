import { getStore } from '@netlify/blobs';
import type { Config } from '@netlify/functions';
import { Leaderboard, LeaderboardError, verifySubmission } from '../../lib/leaderboard.ts';

const MAX_BODY_BYTES = 192 * 1024;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

export default async function handler(request: Request) {
  try {
    if (request.method !== 'GET' && request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'GET, POST' } });
    const board = new Leaderboard(getStore({ name: 'frostbound-leaderboard', consistency: 'strong' }));
    if (request.method === 'GET') {
      const mode = new URL(request.url).searchParams.get('mode') ?? 'arcade';
      if (mode !== 'arcade' && mode !== 'party') return json({ error: 'Choose classic or party rankings.' }, 400);
      return json({ entries: await board.list(mode) });
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
    return json(await board.submit(verifySubmission(payload)));
  } catch (error) {
    if (error instanceof LeaderboardError) return json({ error: error.message }, error.status);
    console.error('Leaderboard request failed', error);
    return json({ error: 'The leaderboard is unavailable right now. Please try again.' }, 503);
  }
}

export const config: Config = {
  rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
