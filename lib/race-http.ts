import { RaceError, type RaceService } from './race-server.ts';

export const MAX_RACE_BODY_BYTES = 128 * 1024;
const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });

export function createRaceHandler(service: () => RaceService) {
  return async (request: Request): Promise<Response> => {
    try {
      if (request.method !== 'POST')
        return new Response(null, { status: 405, headers: { Allow: 'POST' } });
      const origin = request.headers.get('origin');
      if (origin && origin !== new URL(request.url).origin)
        return json({ error: 'Open the invite in the game to race.' }, 403);
      if (!request.headers.get('content-type')?.includes('application/json'))
        return json({ error: 'Expected a race request.' }, 415);
      if (Number(request.headers.get('content-length')) > MAX_RACE_BODY_BYTES)
        return json({ error: 'The recording is too large.' }, 413);
      const reader = request.body?.getReader();
      if (!reader) return json({ error: 'Missing race request.' }, 400);
      const decoder = new TextDecoder();
      let size = 0,
        text = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_RACE_BODY_BYTES) {
          await reader.cancel();
          return json({ error: 'The recording is too large.' }, 413);
        }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        return json({ error: 'Invalid race request.' }, 400);
      }
      if (
        body &&
        typeof body === 'object' &&
        'action' in body &&
        body.action === 'list'
      )
        return json(await service().listLobbies());
      const token =
        request.headers
          .get('authorization')
          ?.match(/^Bearer ([a-f0-9]{64})$/)?.[1] ?? '';
      return json(await service().act(body, token));
    } catch (error) {
      if (error instanceof RaceError)
        return json({ error: error.message }, error.status);
      console.error('Race request failed', error);
      return json(
        { error: 'The race connection is unavailable. Reconnecting…' },
        503,
      );
    }
  };
}
