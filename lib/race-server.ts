import { createHash, randomBytes } from 'node:crypto';
import {
  DEFAULT_RACE_SETTINGS,
  isRaceMode,
  RACE_BUMP_COOLDOWN_MS,
  RACE_COUNTDOWN_MS,
  RACE_DISCONNECT_MS,
  RACE_DURATIONS,
  RACE_PROTOCOL_VERSION,
  RACE_ROOM_TTL_MS,
  RACE_RULES_VERSION,
  otherSlot,
  RACE_SLOTS,
  RACE_MAX_PLAYERS,
  signalKey,
  validRaceId,
  type RaceAction,
  type RaceBumpEvent,
  type RacePlayer,
  type RacePose,
  type RaceRecording,
  type RaceResult,
  type RaceSettings,
  type RaceSignal,
  type RaceSlot,
  type RaceView,
  type RaceVisibility,
  type RaceLobbyList,
} from './race-protocol.ts';
import { replayRaceRecording } from './race-simulation.ts';
import { normalizeRaceProfile } from './race-profile.ts';

export class RaceError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
type StoredPlayer = RacePlayer & {
  tokenHash: string;
  seq: number;
  poseAt: number;
  lastBumpAt: number;
};
export type StoredRace = {
  visibility?: RaceVisibility;
  protocolVersion: typeof RACE_PROTOCOL_VERSION;
  id: string;
  revision: number;
  round: number;
  seed: number;
  settings: RaceSettings;
  signals: Partial<Record<string, RaceSignal>>;
  bumps: RaceBumpEvent[];
  expiresAt: number;
  startAt: number | null;
  settleAt: number | null;
  finished: boolean;
  players: StoredPlayer[];
  winner: RaceSlot | null;
  reason: RaceView['reason'];
};
export type RaceStore = {
  listPublicRooms?(): AsyncIterable<string[]>;
  publishLobby?(id: string, expiresAt: number): Promise<void>;
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
  profile?: unknown,
): StoredPlayer => ({
  slot,
  profile: normalizeRaceProfile(profile, slot),
  tokenHash,
  ready: false,
  lastSeen: now,
  pose: null,
  poseAt: 0,
  result: null,
  rematch: false,
  seq: -1,
  lastBumpAt: 0,
});
const forfeit = (): RaceResult => ({ kind: 'forfeit', floor: 0, duration: 0 });

function parseSettings(raw: unknown): RaceSettings {
  if (!raw || typeof raw !== 'object')
    throw new RaceError('Choose the race rules.');
  const s = raw as RaceSettings;
  const mode = s.mode === undefined ? 'arcade' : s.mode;
  if (!isRaceMode(mode)) throw new RaceError('Choose Classic or Party mode.');
  if (
    !Number.isInteger(s.targetFloor) ||
    s.targetFloor < 5 ||
    s.targetFloor > 100 ||
    !RACE_DURATIONS.some((duration) => duration === s.durationMs) ||
    typeof s.bumping !== 'boolean'
  )
    throw new RaceError('Choose 5–100 floors and a supported race duration.');
  return {
    mode,
    targetFloor: s.targetFloor,
    durationMs: s.durationMs,
    bumping: s.bumping,
  };
}

function parsePose(raw: unknown, settings: RaceSettings): RacePose {
  if (!raw || typeof raw !== 'object')
    throw new RaceError('Invalid player update.');
  const p = raw as RacePose;
  if (
    ![p.x, p.y, p.vx, p.vy, p.time, p.floor].every(Number.isFinite) ||
    Math.abs(p.x) > 7 ||
    p.y < -100 ||
    p.y > settings.targetFloor * 2.35 + 30 ||
    Math.abs(p.vx) > 30 ||
    Math.abs(p.vy) > 100 ||
    p.time < 0 ||
    p.time > settings.durationMs / 1000 + 1 ||
    !Number.isInteger(p.floor) ||
    p.floor < 0 ||
    p.floor > settings.targetFloor ||
    (p.facing !== -1 && p.facing !== 1) ||
    !Number.isInteger(p.frame) ||
    p.frame < 0 ||
    p.frame > (settings.durationMs / 1000) * 120 ||
    !Number.isInteger(p.checkpointFloor) ||
    p.checkpointFloor < 0 ||
    p.checkpointFloor > p.floor ||
    typeof p.grounded !== 'boolean' ||
    typeof p.respawning !== 'boolean' ||
    typeof p.protected !== 'boolean'
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
    frame: p.frame,
    checkpointFloor: p.checkpointFloor,
    respawning: p.respawning,
    protected: p.protected,
  };
}

function parseSignal(raw: unknown, offerer: boolean): RaceSignal {
  if (!raw || typeof raw !== 'object')
    throw new RaceError('Invalid connection offer.');
  const signal = raw as RaceSignal;
  if (
    signal.type !== (offerer ? 'offer' : 'answer') ||
    typeof signal.sdp !== 'string' ||
    signal.sdp.length < 1 ||
    Buffer.byteLength(signal.sdp, 'utf8') > 16 * 1024 ||
    typeof signal.generation !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,64}$/.test(signal.generation)
  )
    throw new RaceError('Invalid connection offer.');
  return { type: signal.type, sdp: signal.sdp, generation: signal.generation };
}

/** Positions are presentation only. Re-simulate controls, checkpoints and accepted shoves. */
export function verifyRaceFinish(
  raw: unknown,
  room: StoredRace,
  now: number,
  slot: RaceSlot = 'host',
): RaceResult {
  if (room.startAt === null || now < room.startAt)
    throw new RaceError('The race has not started.', 409);
  if (!raw || typeof raw !== 'object')
    throw new RaceError('Missing race recording.');
  const replay = raw as RaceRecording;
  const maxFrames = (room.settings.durationMs / 1000) * 120;
  if (
    replay.version !== 1 ||
    replay.rulesVersion !== RACE_RULES_VERSION ||
    replay.mode !== room.settings.mode ||
    replay.seed !== room.seed ||
    !Array.isArray(replay.moves) ||
    replay.moves.length > maxFrames ||
    !Array.isArray(replay.bumps) ||
    replay.bumps.length > 400
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
  const events = room.bumps.filter((event) => event.to === slot);
  const seen = new Set<string>();
  for (const bump of replay.bumps) {
    if (
      !bump ||
      typeof bump !== 'object' ||
      typeof bump.id !== 'string' ||
      !Number.isInteger(bump.frame) ||
      bump.frame < 0 ||
      bump.frame > total ||
      seen.has(bump.id)
    )
      throw new RaceError('Invalid shove recording.');
    const event = events.find((candidate) => candidate.id === bump.id);
    if (
      !event ||
      bump.frame < event.targetFrame ||
      (bump.frame / 120) * 1000 > now - room.startAt + 1_000
    )
      throw new RaceError('This shove does not belong to this player.');
    seen.add(bump.id);
  }
  // A recent in-flight shove may not have reached the client yet. Older accepted
  // shoves must appear once the recording progresses beyond their race time.
  for (const event of events) {
    if (
      event.at < now - 2_000 &&
      (total / 120) * 1000 > event.at - room.startAt + 2_000 &&
      !seen.has(event.id)
    )
      throw new RaceError('The recording is missing a shove.');
  }
  let simulation: ReturnType<typeof replayRaceRecording>;
  try {
    simulation = replayRaceRecording(replay, room.settings, events, slot);
  } catch (error) {
    throw new RaceError(
      error instanceof Error ? error.message : 'Invalid race recording.',
    );
  }
  const kind = simulation.finished === 'goal' ? 'goal' : 'time';
  if (
    kind === 'time' &&
    now < room.startAt + room.settings.durationMs &&
    room.settleAt === null
  )
    throw new RaceError('This climb is still in progress.');
  return {
    kind,
    floor: Math.min(room.settings.targetFloor, simulation.engine.floor),
    duration: Math.round(now - room.startAt),
  };
}

function decide(room: StoredRace) {
  const contenders = room.players.filter((p) => p.result?.kind !== 'forfeit');
  const best = Math.max(...contenders.map((p) => p.result?.floor ?? 0));
  const leaders = contenders.filter((p) => (p.result?.floor ?? 0) === best);
  room.winner = leaders.length === 1 ? leaders[0].slot : null;
  room.reason = !room.winner
    ? 'draw'
    : contenders.length === 1 &&
        room.players.some((p) => p.result?.kind === 'forfeit')
      ? 'forfeit'
      : leaders[0].result?.kind === 'goal'
        ? 'goal'
        : 'height';
  room.finished = true;
}

function advanceRoom(room: StoredRace, now: number) {
  if (room.finished || room.startAt === null) return;
  for (const player of room.players) {
    if (!player.result && now - player.lastSeen > RACE_DISCONNECT_MS)
      player.result = forfeit();
  }
  if (
    room.players.filter((p) => p.result?.kind !== 'forfeit').length <= 1 ||
    room.players.every((p) => p.result)
  ) {
    decide(room);
    return;
  }
  if (room.players.some((p) => p.result?.kind === 'goal'))
    room.settleAt ??= now + 3_000;
  if (now >= room.startAt + room.settings.durationMs)
    room.settleAt ??= room.startAt + room.settings.durationMs + 3_000;
  if (room.settleAt !== null && now >= room.settleAt) decide(room);
}

function view(room: StoredRace, you: RaceSlot, now: number): RaceView {
  return {
    id: room.id,
    visibility: room.visibility ?? 'private',
    revision: room.revision,
    round: room.round,
    seed: room.seed,
    rulesVersion: RACE_RULES_VERSION,
    settings: room.settings,
    signals: room.signals,
    bumps: room.bumps,
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
    deadline:
      room.startAt === null ? null : room.startAt + room.settings.durationMs,
    expiresAt: room.expiresAt,
    serverNow: now,
    you,
    winner: room.winner,
    reason: room.reason,
    players: room.players.map(
      ({ slot, profile, ready, lastSeen, pose, result, rematch }) => ({
        slot,
        profile: normalizeRaceProfile(profile, slot),
        ready,
        lastSeen,
        pose,
        result,
        rematch,
      }),
    ),
  };
}

function acceptBump(
  room: StoredRace,
  player: StoredPlayer,
  direction: unknown,
  now: number,
) {
  if (direction !== -1 && direction !== 1)
    throw new RaceError('Choose a shove direction.');
  if (!room.settings.bumping)
    throw new RaceError('Shoving is off for this race.', 409);
  if (
    room.finished ||
    room.settleAt !== null ||
    room.startAt === null ||
    now < room.startAt
  )
    throw new RaceError('Shoving is only available during the race.', 409);
  if (now - player.lastBumpAt < RACE_BUMP_COOLDOWN_MS)
    throw new RaceError('Your shove is recharging.', 409);
  const rival = room.players
    .filter((p) => {
      const a = player.pose,
        b = p.pose;
      return (
        p.slot !== player.slot &&
        !p.result &&
        a &&
        b &&
        now - p.poseAt <= 1_500 &&
        !b.respawning &&
        !b.protected &&
        Math.abs(a.x - b.x) <= 1.8 &&
        Math.abs(a.y - b.y) <= 1.7 &&
        (b.x - a.x) * direction >= -0.35
      );
    })
    .sort(
      (a, b) =>
        Math.abs(a.pose!.x - player.pose!.x) -
        Math.abs(b.pose!.x - player.pose!.x),
    )[0];
  const a = player.pose,
    b = rival?.pose;
  if (
    !rival ||
    !a ||
    !b ||
    player.result ||
    rival.result ||
    now - player.poseAt > 1_500 ||
    now - rival.poseAt > 1_500 ||
    a.respawning ||
    b.respawning ||
    a.protected ||
    b.protected ||
    Math.abs(a.x - b.x) > 1.8 ||
    Math.abs(a.y - b.y) > 1.7 ||
    direction !== a.facing ||
    (b.x - a.x) * direction < -0.35
  )
    throw new RaceError('Get closer and face your friend to shove.', 409);
  if (room.bumps.length >= 400)
    throw new RaceError('No more shoves this round.', 409);
  player.lastBumpAt = now;
  room.bumps.push({
    id: `${room.round}-${room.bumps.length + 1}`,
    from: player.slot,
    to: rival.slot,
    at: now,
    direction,
    targetFrame: b.frame,
  });
}

/** One conditional room write makes joins, rules, readiness and results atomic. */
export class RaceService {
  private store: RaceStore;
  private clock: () => number;
  private seed: () => number;
  private onFinished?: (result: RaceView) => Promise<void>;
  constructor(
    store: RaceStore,
    clock = Date.now,
    seed = randomSeed,
    onFinished?: (result: RaceView) => Promise<void>,
  ) {
    this.store = store;
    this.clock = clock;
    this.seed = seed;
    this.onFinished = onFinished;
  }

  async listLobbies(): Promise<RaceLobbyList> {
    if (!this.store.listPublicRooms)
      throw new RaceError(
        'The lobby browser is unavailable. Try again shortly.',
        503,
      );
    const lobbies: RaceLobbyList['lobbies'] = [];
    let scanned = 0;
    for await (const keys of this.store.listPublicRooms()) {
      // Bound reads and concurrency even when many expired listings await cleanup.
      for (let offset = 0; offset < keys.length; offset += 20) {
        const rooms = await Promise.all(
          keys
            .slice(offset, offset + Math.min(20, 500 - scanned))
            .map((id) =>
              this.store.getWithMetadata(`rooms/${id}`, { type: 'json' }),
            ),
        );
        for (const entry of rooms) {
          scanned++;
          const room = entry?.data;
          const now = this.clock();
          const host = room?.players.find((p) => p.slot === 'host');
          if (
            room &&
            host &&
            room.visibility === 'public' &&
            room.protocolVersion === RACE_PROTOCOL_VERSION &&
            room.expiresAt > now &&
            !room.finished &&
            room.startAt === null &&
            now - host.lastSeen < RACE_DISCONNECT_MS
          ) {
            const players = room.players.filter(
              (p) => now - p.lastSeen < RACE_DISCONNECT_MS,
            ).length;
            if (players < RACE_MAX_PLAYERS)
              lobbies.push({
                id: room.id,
                hostName: normalizeRaceProfile(host.profile, 'host').name,
                players,
                settings: { ...room.settings },
              });
          }
          if (lobbies.length >= 50 || scanned >= 500)
            return { lobbies, limited: true };
        }
      }
    }
    return { lobbies, limited: false };
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
      body.visibility !== undefined &&
      !['private', 'public'].includes(body.visibility)
    )
      throw new RaceError('Choose a public or private lobby.');
    if (
      !validRaceId(body.room) ||
      ![
        'create',
        'join',
        'poll',
        'ready',
        'configure',
        'profile',
        'signal',
        'bump',
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
            visibility: body.visibility ?? 'private',
            protocolVersion: RACE_PROTOCOL_VERSION,
            id: body.room,
            revision: 0,
            round: 1,
            seed: this.seed(),
            settings:
              body.settings === undefined
                ? { ...DEFAULT_RACE_SETTINGS }
                : parseSettings(body.settings),
            signals: {},
            bumps: [],
            expiresAt: now + RACE_ROOM_TTL_MS,
            startAt: null,
            settleAt: null,
            finished: false,
            players: [makePlayer('host', tokenHash, now, body.profile)],
            winner: null,
            reason: null,
          };
      if (room.expiresAt <= now)
        throw new RaceError('This room expired. Create a new race.', 410);
      if (room.protocolVersion !== RACE_PROTOCOL_VERSION)
        throw new RaceError(
          'The race rules have been updated. Create a new room.',
          410,
        );
      // Waiting public rooms release abandoned seats; active races retain their
      // existing forfeit behavior. A host must remain present to admit guests.
      if (
        room.visibility === 'public' &&
        room.startAt === null &&
        !room.finished
      ) {
        const host = room.players.find((p) => p.slot === 'host')!;
        if (
          body.action === 'join' &&
          tokenHash !== host.tokenHash &&
          now - host.lastSeen >= RACE_DISCONNECT_MS
        )
          throw new RaceError(
            'The host has left this lobby. Choose another room.',
            409,
          );
        const members = room.players.filter(
          (p) =>
            p.slot === 'host' ||
            p.tokenHash === tokenHash ||
            now - p.lastSeen < RACE_DISCONNECT_MS,
        );
        if (members.length !== room.players.length) {
          room.players = members;
          room.signals = {};
          for (const member of members) member.ready = false;
        }
      }
      let player = room.players.find((p) => p.tokenHash === tokenHash);
      if (!player && body.action === 'join') {
        if (
          room.players.length >= RACE_MAX_PLAYERS ||
          room.startAt !== null ||
          room.finished
        )
          throw new RaceError(
            'This lobby is full or has already started. Choose another room.',
            409,
          );
        player = makePlayer(
          RACE_SLOTS.find(
            (slot) => !room.players.some((p) => p.slot === slot),
          )!,
          tokenHash,
          now,
          body.profile,
        );
        room.players.push(player);
      }
      if (!player)
        throw new RaceError('This session cannot access that race.', 403);
      advanceRoom(room, now);
      player.lastSeen = now;
      const sameRound = body.round === room.round;
      if (sameRound && body.action === 'profile') {
        if (player.ready || room.startAt !== null || room.finished)
          throw new RaceError(
            'Choose your name and outfit before you ready up.',
            409,
          );
        player.profile = normalizeRaceProfile(body.profile, player.slot);
      }
      if (sameRound && body.action === 'configure') {
        if (player.slot !== 'host')
          throw new RaceError('Only the host can change the rules.', 403);
        if (room.finished || (room.startAt !== null && now >= room.startAt))
          throw new RaceError('The rules are locked for this round.', 409);
        room.settings = parseSettings(body.settings);
        room.startAt = null;
        for (const member of room.players) member.ready = false;
      }
      if (sameRound && body.action === 'signal') {
        const target = body.target ?? otherSlot(player.slot);
        if (
          target === player.slot ||
          !room.players.some((p) => p.slot === target)
        )
          throw new RaceError('Invalid connection recipient.');
        const offerer =
          RACE_SLOTS.indexOf(player.slot) < RACE_SLOTS.indexOf(target);
        const signal = parseSignal(body.signal, offerer);
        const ownKey = signalKey(player.slot, target);
        const peerKey = signalKey(target, player.slot);
        if (!offerer && room.signals[peerKey]?.generation !== signal.generation)
          throw new RaceError(
            'The connection offer changed. Reconnecting…',
            409,
          );
        if (offerer && room.signals[ownKey]?.generation !== signal.generation)
          delete room.signals[peerKey];
        room.signals[ownKey] = signal;
      }
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
          room.players.length >= 2 &&
          room.players.every(
            (p) => p.ready && now - p.lastSeen < RACE_DISCONNECT_MS,
          )
        )
          room.startAt ??= now + RACE_COUNTDOWN_MS;
      }
      if (
        sameRound &&
        (body.action === 'poll' ||
          body.action === 'bump' ||
          body.action === 'finish') &&
        body.pose !== undefined &&
        !room.finished &&
        room.startAt !== null &&
        now >= room.startAt &&
        !player.result
      ) {
        if (!Number.isSafeInteger(body.seq) || body.seq! < 0)
          throw new RaceError('Invalid player update.');
        if (body.seq! > player.seq) {
          player.pose = parsePose(body.pose, room.settings);
          player.poseAt = now;
          player.seq = body.seq!;
        }
      }
      if (sameRound && body.action === 'bump')
        acceptBump(room, player, body.direction, now);
      if (
        sameRound &&
        body.action === 'finish' &&
        !room.finished &&
        !player.result
      ) {
        player.result = verifyRaceFinish(body.replay, room, now, player.slot);
        if (player.pose) player.pose.floor = player.result.floor;
      }
      if (sameRound && body.action === 'leave' && !room.finished) {
        player.result = forfeit();
        player.lastSeen = 0;
        if (room.startAt === null) {
          if (player.slot === 'host') decide(room);
          else {
            room.players = room.players.filter((p) => p !== player);
            room.signals = {};
          }
        } else advanceRoom(room, now);
      }
      if (sameRound && body.action === 'rematch' && room.finished) {
        if (
          room.players.length < 2 ||
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
          room.bumps = [];
          for (const p of room.players) {
            p.ready = true;
            p.rematch = false;
            p.result = null;
            p.pose = null;
            p.seq = -1;
            p.poseAt = 0;
            p.lastBumpAt = 0;
          }
        }
      }
      if (
        !room.finished &&
        room.startAt === null &&
        room.players.length >= 2 &&
        room.players.every(
          (p) => p.ready && now - p.lastSeen < RACE_DISCONNECT_MS,
        )
      )
        room.startAt = now + RACE_COUNTDOWN_MS;
      advanceRoom(room, now);
      room.revision++;
      if (!current && room.visibility === 'public') {
        if (!this.store.publishLobby)
          throw new RaceError(
            'Public lobbies are unavailable. Try a private lobby.',
            503,
          );
        // Publish the pointer first. Discovery only returns committed room records,
        // so a failed room write cannot expose a phantom lobby.
        await this.store.publishLobby(room.id, room.expiresAt);
      }
      const result = await this.store.setJSON(key, room, {
        ...(current ? { onlyIfMatch: current.etag! } : { onlyIfNew: true }),
        metadata: { expiresAt: room.expiresAt },
      });
      if (result.modified) {
        const response = view(room, player.slot, now);
        if (room.finished && !current?.data.finished && this.onFinished) {
          try {
            await this.onFinished(response);
          } catch {
            /* Optional measurement cannot invalidate a committed result. */
          }
        }
        return response;
      }
    }
    throw new RaceError('The room is busy. Reconnecting…', 503);
  }
}
