import type { Config } from '@netlify/functions';
import { RaceService } from '../../lib/race-server.ts';
import { createRaceHandler } from '../../lib/race-http.ts';
import { raceBlobStore } from '../../lib/race-store.ts';

export default createRaceHandler(() => new RaceService(raceBlobStore()));

export const config: Config = {
  rateLimit: {
    windowLimit: 360,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
};
