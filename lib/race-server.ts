import { createHash, randomBytes } from 'node:crypto';
import {
  RACE_COUNTDOWN_MS,
  RACE_DISCONNECT_MS,
  RACE_DURATION_MS,
  RACE_ROOM_TTL_MS,
  RACE_RULES_VERSION,
  RACE_TARGET,
  createRaceEngine,
  validRaceId,
  type RaceAction,
  type RacePlayer,
  type RacePose,
  type RaceResult,
  type RaceSlot,
  type RaceView,
} from './race-protocol.ts';

export class RaceError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
type StoredPlayer = RacePlayer & { tokenHash: string; seq: number };
export type StoredRace = {
  id: string;
  revision: number;
  round: number;
  seed: number;
  expiresAt: number;
  startAt: number | null;
  settleAt: number | null;
  finished: boolean;
  players: StoredPlayer[];
  winner: RaceSlot | null;
  reason: RaceView['reason'];
};
export type RaceStore = {
  getWithMetadata(
    key: string,
    options: { type: 'json' },
  ): Promise<{ data: StoredRace; etag?: string } | null>;
  setJSON(
    key: string,
    value: StoredRace,
    options: ({ onlyIfMatch: string } | { onlyIfNew: true }) & {
      metadata: { expiresAt: number };
    },
  ): Promise<{ modified: boolean }>;
};
const randomSeed = () => randomBytes(4).readUInt32LE();
const hash = (token: string) =>
  createHash('sha256').update(token).digest('hex');
const makePlayer = (
  slot: RaceSlot,
  tokenHash: string,
  now: number,
): StoredPlayer => ({
  slot,
  tokenHash,
  ready: false,
  lastSeen: now,
  pose: null,
  result: null,
  rematch: false,
  seq: -1,
});
const forfeit = (): RaceResult => ({ kind: 'forfeit', floor: 0, duration: 0 });

function parsePose(raw: unknown): RacePose {
  if (!raw || typeof raw !== 'object')
    throw new RaceError('Invalid player update.');
  const p = raw as RacePose;
  if (
    ![p.x, p.y, p.vx, p.vy, p.time, p.floor].every(Number.isFinite) ||
    Math.abs(p.x) > 7 ||
    p.y < -100 ||
    p.y > 100 ||
    Math.abs(p.vx) > 30 ||
    Math.abs(p.vy) > 100 ||
    p.time < 0 ||
    p.time > RACE_DURATION_MS / 1000 + 1 ||
    !Number.isInteger(p.floor) ||
    p.floor < 0 ||
    p.floor > 30 ||
    (p.facing !== -1 && p.facing !== 1) ||
    typeof p.grounded !== 'boolean'
  )
    throw new RaceError('Invalid player update.');
  return {
    x: p.x,
    y: p.y,
    vx: p.vx,
    vy: p.vy,
    time: p.time,
    floor: p.floor,
    facing: p.facing,
    grounded: p.grounded,
  };
}

/** Positions are presentation only. The server computes every result from recorded controls. */
export function verifyRaceFinish(
  raw: unknown,
  room: StoredRace,
  now: number,
): RaceResult {
  if (!room.startAt || now < room.startAt)
    throw new RaceError('The race has not started.', 409);
  if (!raw || typeof raw !== 'object')
    throw new RaceError('Missing race recording.');
  const replay = raw as {
    version?: unknown;
    seed?: unknown;
    mode?: unknown;
    moves?: unknown;
  };
  const maxFrames = (RACE_DURATION_MS / 1000) * 120;
  if (
    replay.version !== RACE_RULES_VERSION ||
    replay.seed !== room.seed ||
    replay.mode !== 'arcade' ||
    !Array.isArray(replay.moves) ||
    !replay.moves.length ||
    replay.moves.length > maxFrames
  )
    throw new RaceError('This recording does not belong to this race.');
  let total = 0;
  for (const move of replay.moves) {
    if (
      !Array.isArray(move) ||
      move.length !== 2 ||
      !Number.isInteger(move[0]) ||
      move[0] < 1 ||
      !Number.isInteger(move[1]) ||
      move[1] < 0 ||
      move[1] > 7
    )
      throw new RaceError('Invalid race recording.');
    total += move[0];
    if (total > maxFrames || (total / 120) * 1000 > now - room.startAt + 1_000)
      throw new RaceError('The recording runs ahead of the race clock.');
  }
  const engine = createRaceEngine(room.seed);
  for (const [frames, mask] of replay.moves) {
    const controls = {
      left: !!(mask & 1),
      right: !!(mask & 2),
      jump: !!(mask & 4),
    };
    for (let frame = 0; frame < frames; frame++) {
      if (engine.status !== 'playing' || engine.floor >= RACE_TARGET)
        throw new RaceError('The recording continues after the finish.');
      engine.tick(1 / 120, controls);
      engine.drainEvents();
    }
  }
  const kind =
    engine.floor >= RACE_TARGET
      ? 'goal'
      : engine.status === 'over'
        ? 'fell'
        : 'time';
  if (
    kind === 'time' &&
    now < room.startAt + RACE_DURATION_MS &&
    room.settleAt === null
  )
    throw new RaceError('This climb is still in progress.');
  // Finishing order uses the server clock, so slow rendering or backgrounding
  // cannot turn a later real finish into a faster simulated time.
  return {
    kind,
    floor: engine.floor,
    duration: Math.round(now - room.startAt),
  };
}

function decide(room: StoredRace) {
  const [host, guest] = room.players;
  if (!guest) {
    room.winner = null;
    room.reason = 'forfeit';
    room.finished = true;
    return;
  }
  const a = host.result,
    b = guest.result;
  if (a?.kind === 'forfeit' || b?.kind === 'forfeit') {
    room.winner =
      a?.kind === 'forfeit' && b?.kind === 'forfeit'
        ? null
        : a?.kind === 'forfeit'
          ? guest.slot
          : host.slot;
    room.reason = room.winner ? 'forfeit' : 'draw';
  } else if (a?.kind === 'goal' || b?.kind === 'goal') {
    room.winner =
      a?.kind === 'goal' && b?.kind === 'goal'
        ? a.duration === b.duration
          ? null
          : a.duration < b.duration
            ? host.slot
            : guest.slot
        : a?.kind === 'goal'
          ? host.slot
          : guest.slot;
    room.reason = room.winner ? 'goal' : 'draw';
  } else {
    const af = a?.floor ?? 0,
      bf = b?.floor ?? 0;
    room.winner = af === bf ? null : af > bf ? host.slot : guest.slot;
    room.reason = room.winner ? 'height' : 'draw';
  }
  room.finished = true;
}

function advanceRoom(room: StoredRace, now: number) {
  if (room.finished || room.startAt === null) return;
  for (const player of room.players) {
    if (!player.result && now - player.lastSeen > RACE_DISCONNECT_MS)
      player.result = forfeit();
  }
  if (
    room.players.some((p) => p.result?.kind === 'forfeit') ||
    room.players.every((p) => p.result)
  ) {
    decide(room);
    return;
  }
  if (room.players.some((p) => p.result?.kind === 'goal'))
    room.settleAt ??= now + 2_000;
  if (now >= room.startAt + RACE_DURATION_MS)
    room.settleAt ??= room.startAt + RACE_DURATION_MS + 3_000;
  if (room.settleAt !== null && now >= room.settleAt) decide(room);
}

function view(room: StoredRace, you: RaceSlot, now: number): RaceView {
  return {
    id: room.id,
    revision: room.revision,
    round: room.round,
    seed: room.seed,
    rulesVersion: RACE_RULES_VERSION,
    phase: room.finished
      ? 'finished'
      : room.startAt === null
        ? 'waiting'
        : now < room.startAt
          ? 'countdown'
          : room.settleAt !== null
            ? 'finishing'
            : 'racing',
    startAt: room.startAt,
    deadline: room.startAt === null ? null : room.startAt + RACE_DURATION_MS,
    expiresAt: room.expiresAt,
    serverNow: now,
    you,
    winner: room.winner,
    reason: room.reason,
    players: room.players.map(
      ({ slot, ready, lastSeen, pose, result, rematch }) => ({
        slot,
        ready,
        lastSeen,
        pose,
        result,
        rematch,
      }),
    ),
  };
}

/** One conditional room write makes ready, joins, finishes and rematches atomic. */
export class RaceService {
  private store: RaceStore;
  private clock: () => number;
  private seed: () => number;
  constructor(store: RaceStore, clock = Date.now, seed = randomSeed) {
    this.store = store;
    this.clock = clock;
    this.seed = seed;
  }

  async act(input: unknown, token: string): Promise<RaceView> {
    if (!/^[a-f0-9]{64}$/.test(token))
      throw new RaceError(
        'Your room session is missing. Reopen the invite.',
        401,
      );
    if (!input || typeof input !== 'object')
      throw new RaceError('Invalid race request.');
    const body = input as RaceAction;
    if (
      !validRaceId(body.room) ||
      ![
        'create',
        'join',
        'poll',
        'ready',
        'finish',
        'rematch',
        'leave',
      ].includes(body.action)
    )
      throw new RaceError('This race link is invalid.');
    const tokenHash = hash(token),
      key = `rooms/${body.room}`;
    for (let attempt = 0; attempt < 10; attempt++) {
      const current = await this.store.getWithMetadata(key, { type: 'json' });
      const now = this.clock();
      if (!current && body.action !== 'create')
        throw new RaceError(
          'This room no longer exists. Create a new race.',
          404,
        );
      if (current && !current.etag)
        throw new RaceError('The room is temporarily unavailable.', 503);
      const room: StoredRace = current
        ? structuredClone(current.data)
        : {
            id: body.room,
            revision: 0,
            round: 1,
            seed: this.seed(),
            expiresAt: now + RACE_ROOM_TTL_MS,
            startAt: null,
            settleAt: null,
            finished: false,
            players: [makePlayer('host', tokenHash, now)],
            winner: null,
            reason: null,
          };
      if (room.expiresAt <= now)
        throw new RaceError('This room expired. Create a new race.', 410);
      let player = room.players.find((p) => p.tokenHash === tokenHash);
      if (!player && body.action === 'join') {
        if (room.players.length === 2 || room.startAt !== null || room.finished)
          throw new RaceError(
            'This two-player room is full. Ask for a new invite.',
            409,
          );
        player = makePlayer('guest', tokenHash, now);
        room.players.push(player);
      }
      if (!player)
        throw new RaceError('This session cannot access that race.', 403);
      // Expired connections cannot revive after seeing a forfeit result.
      advanceRoom(room, now);
      player.lastSeen = now;
      const sameRound = body.round === room.round;
      if (
        sameRound &&
        body.action === 'ready' &&
        !room.finished &&
        (room.startAt === null || now < room.startAt)
      ) {
        if (typeof body.ready !== 'boolean')
          throw new RaceError('Choose ready or not ready.');
        player.ready = body.ready;
        if (!body.ready) room.startAt = null;
        else if (
          room.players.length === 2 &&
          room.players.every(
            (p) => p.ready && now - p.lastSeen < RACE_DISCONNECT_MS,
          )
        )
          room.startAt ??= now + RACE_COUNTDOWN_MS;
      }
      if (
        sameRound &&
        body.action === 'poll' &&
        body.pose !== undefined &&
        !room.finished &&
        room.startAt !== null &&
        now >= room.startAt &&
        !player.result
      ) {
        if (!Number.isSafeInteger(body.seq) || body.seq! < 0)
          throw new RaceError('Invalid player update.');
        if (body.seq! > player.seq) {
          player.pose = parsePose(body.pose);
          player.seq = body.seq!;
        }
      }
      if (
        sameRound &&
        body.action === 'finish' &&
        !room.finished &&
        !player.result
      )
        player.result = verifyRaceFinish(body.replay, room, now);
      if (sameRound && body.action === 'leave' && !room.finished) {
        player.result = forfeit();
        player.lastSeen = 0;
        decide(room);
      }
      if (sameRound && body.action === 'rematch' && room.finished) {
        if (
          room.players.length !== 2 ||
          room.players.some((p) => now - p.lastSeen >= RACE_DISCONNECT_MS)
        )
          throw new RaceError('Your friend has left. Create a new race.', 409);
        player.rematch = true;
        if (room.players.every((p) => p.rematch)) {
          room.round++;
          room.seed = this.seed();
          room.startAt = now + RACE_COUNTDOWN_MS;
          room.settleAt = null;
          room.finished = false;
          room.winner = null;
          room.reason = null;
          for (const p of room.players) {
            p.ready = true;
            p.rematch = false;
            p.result = null;
            p.pose = null;
            p.seq = -1;
          }
        }
      }
      if (
        !room.finished &&
        room.startAt === null &&
        room.players.length === 2 &&
        room.players.every(
          (p) => p.ready && now - p.lastSeen < RACE_DISCONNECT_MS,
        )
      )
        room.startAt = now + RACE_COUNTDOWN_MS;
      advanceRoom(room, now);
      room.revision++;
      const result = await this.store.setJSON(key, room, {
        ...(current ? { onlyIfMatch: current.etag! } : { onlyIfNew: true }),
        metadata: { expiresAt: room.expiresAt },
      });
      if (result.modified) return view(room, player.slot, now);
    }
    throw new RaceError('The room is busy. Reconnecting…', 503);
  }
}
