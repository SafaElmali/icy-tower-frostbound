import type { Plugin } from 'vite';
import { RaceService, type RaceStore, type StoredRace } from './race-server.ts';
import { createRaceHandler, MAX_RACE_BODY_BYTES } from './race-http.ts';
import { RACE_API } from './race-protocol.ts';

/** Development-only room storage. The deployed function always uses shared Blobs. */
export class MemoryRaceStore implements RaceStore {
  private rooms = new Map<string, { data: StoredRace; etag: string }>();
  private revision = 0;
  async getWithMetadata(key: string) {
    return structuredClone(this.rooms.get(key) ?? null);
  }
  async setJSON(
    key: string,
    value: StoredRace,
    options: { onlyIfMatch?: string; onlyIfNew?: true },
  ) {
    for (const [id, room] of this.rooms)
      if (room.data.expiresAt <= Date.now()) this.rooms.delete(id);
    const current = this.rooms.get(key);
    if (
      options.onlyIfNew
        ? current !== undefined
        : current?.etag !== options.onlyIfMatch
    )
      return { modified: false };
    if (!current && this.rooms.size >= 1000)
      throw new Error('Local room limit reached.');
    this.rooms.set(key, {
      data: structuredClone(value),
      etag: String(++this.revision),
    });
    return { modified: true };
  }
}

export function raceDevelopmentServer(): Plugin {
  return {
    name: 'frostbound-race-development',
    apply: 'serve',
    configureServer(server) {
      const service = new RaceService(new MemoryRaceStore());
      const handler = createRaceHandler(() => service);
      server.middlewares.use(RACE_API, async (req, res) => {
        try {
          const chunks: Buffer[] = [];
          let size = 0;
          for await (const chunk of req) {
            size += chunk.length;
            if (size > MAX_RACE_BODY_BYTES) {
              res.writeHead(413);
              res.end();
              return;
            }
            chunks.push(Buffer.from(chunk));
          }
          const headers = new Headers();
          for (const [name, value] of Object.entries(req.headers))
            if (value !== undefined)
              headers.set(
                name,
                Array.isArray(value) ? value.join(', ') : value,
              );
          const response = await handler(
            new Request(`http://${req.headers.host}${RACE_API}`, {
              method: req.method,
              headers,
              ...(req.method === 'POST' ? { body: Buffer.concat(chunks) } : {}),
            }),
          );
          res.writeHead(response.status, Object.fromEntries(response.headers));
          res.end(await response.text());
        } catch (error) {
          server.config.logger.error(String(error));
          res.writeHead(500);
          res.end();
        }
      });
    },
  };
}
