/** Live smoke benchmark. Run with: node --env-file=.env.local scripts/evaluate-jev.ts */
import { writeFile, mkdir } from 'node:fs/promises';
import { JevPlayer } from '../lib/jev-player.ts';
import { createJevHandler } from '../lib/jev-server.ts';
import { TowerEngine } from '../lib/tower-engine.ts';

const label = process.argv[2] ?? 'current';
const duration = Number(process.argv[3] ?? 20);
if (!process.env.TYPESAFE_API_KEY)
  throw new Error('Set TYPESAFE_API_KEY before running a live evaluation.');
const results = await Promise.all(
  [73091, 42, 98765].map(async (seed) => {
    const engine = new TowerEngine(seed);
    engine.start('practice');
    const handler = createJevHandler(() => process.env.TYPESAFE_API_KEY);
    let requests = 0;
    let totalLatency = 0;
    let frozenFrames = 0;
    let errors = 0;
    const player = new JevPlayer(async (state, signal) => {
      requests++;
      const begin = performance.now();
      const response = await handler(
        new Request('http://localhost/.netlify/functions/jev', {
          method: 'POST',
          body: JSON.stringify(state),
          signal,
        }),
      );
      totalLatency += performance.now() - begin;
      if (!response.ok) {
        errors++;
        throw new Error(`HTTP ${response.status}`);
      }
      return (await response.json()) as Awaited<
        ReturnType<typeof import('../lib/jev-player.ts').requestJevAction>
      >;
    });
    const began = performance.now();
    let last = began;
    while (
      performance.now() - began < duration * 1000 &&
      engine.status === 'playing'
    ) {
      await new Promise((resolve) => setTimeout(resolve, 16));
      const now = performance.now();
      const before = engine.time;
      player.tick(engine, Math.min((now - last) / 1000, 0.1));
      last = now;
      if (engine.time === before) frozenFrames++;
      engine.drainEvents();
    }
    player.stop();
    return {
      seed,
      floor: engine.floor,
      seconds: Number(engine.time.toFixed(2)),
      status: engine.status,
      requests,
      meanLatencyMs: Math.round(totalLatency / requests),
      frozenFrames,
      errors,
    };
  }),
);
await mkdir('outputs/jev-evaluation', { recursive: true });
await writeFile(
  `outputs/jev-evaluation/${label}.json`,
  JSON.stringify(results, null, 2) + '\n',
);
console.log(JSON.stringify(results, null, 2));
