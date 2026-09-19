import { loadEnv, type ConfigEnv, type Plugin } from 'vite';
import { createJevHandler } from './jev-server.ts';
import { JEV_API } from './jev-player.ts';

export function isJevDevelopmentEnabled(
  { command, mode, isPreview }: ConfigEnv,
  flag: string | undefined,
  nodeEnv: string | undefined,
) {
  return (
    command === 'serve' &&
    mode === 'development' &&
    !isPreview &&
    nodeEnv !== 'production' &&
    flag === 'true'
  );
}

export function jevDevelopmentServer(enabled = false): Plugin {
  return {
    name: 'frostbound-jev-development',
    apply: 'serve',
    configureServer(server) {
      if (!enabled) {
        server.middlewares.use(JEV_API, (_req, res) => {
          res.writeHead(404, { 'Cache-Control': 'no-store' });
          res.end();
        });
        return;
      }
      const env = loadEnv(
        server.config.mode,
        server.config.envDir,
        'TYPESAFE_',
      );
      const handler = createJevHandler(
        () => process.env.TYPESAFE_API_KEY || env.TYPESAFE_API_KEY,
      );
      server.middlewares.use(JEV_API, async (req, res) => {
        try {
          const chunks: Buffer[] = [];
          let bytes = 0;
          for await (const chunk of req) {
            bytes += chunk.length;
            if (bytes > 4096) {
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
            new Request(`http://${req.headers.host}${JEV_API}`, {
              method: req.method,
              headers,
              ...(req.method === 'POST' ? { body: Buffer.concat(chunks) } : {}),
            }),
          );
          res.writeHead(response.status, Object.fromEntries(response.headers));
          res.end(await response.text());
        } catch {
          res.writeHead(500);
          res.end();
        }
      });
    },
  };
}
