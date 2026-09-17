import type { Config } from '@netlify/functions';
import { RaceService } from '../../lib/race-server.ts';
import { createRaceHandler } from '../../lib/race-http.ts';
import { raceBlobStore } from '../../lib/race-store.ts';
import {
  captureServerEvent,
  serverEventId,
} from '../../lib/analytics-server.ts';

export default createRaceHandler(
  () =>
    new RaceService(raceBlobStore(), undefined, undefined, async (room) => {
      const roomId = serverEventId(`race-room:${room.id}`);
      const host = room.players.find((player) => player.slot === 'host');
      const guest = room.players.find((player) => player.slot === 'guest');
      await captureServerEvent(
        'race_finished',
        roomId,
        {
          surface: 'race',
          analytics_room_id: roomId,
          round: room.round,
          winner: room.winner ?? 'draw',
          reason: room.reason,
          target_floor: room.settings.targetFloor,
          time_limit_s: room.settings.durationMs / 1000,
          bumping: room.settings.bumping,
          host_floor: host?.result?.floor,
          guest_floor: guest?.result?.floor,
          host_result: host?.result?.kind,
          guest_result: guest?.result?.kind,
        },
        `race-finished:${room.id}:${room.round}`,
      );
    }),
);

export const config: Config = {
  rateLimit: {
    windowLimit: 360,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
};
