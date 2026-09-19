import {
  RACE_API,
  RACE_RULES_VERSION,
  isRaceMode,
  validRaceId,
  type RaceAction,
  type RaceSession,
  type RaceView,
  type RaceLobbyList,
} from './race-protocol.ts';

export class RaceRequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function listRaceLobbies(
  signal: AbortSignal,
  transport: typeof fetch = fetch,
): Promise<RaceLobbyList> {
  const response = await transport(RACE_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'list' }),
    cache: 'no-store',
    signal,
  });
  const data = (await response.json()) as RaceLobbyList & { error?: unknown };
  if (!response.ok)
    throw new RaceRequestError(
      typeof data?.error === 'string' ? data.error : 'Could not load lobbies.',
      response.status,
    );
  if (
    !Array.isArray(data?.lobbies) ||
    typeof data.limited !== 'boolean' ||
    !data.lobbies.every(
      (lobby: RaceLobbyList['lobbies'][number]) =>
        lobby &&
        validRaceId(lobby.id) &&
        typeof lobby.hostName === 'string' &&
        Number.isInteger(lobby.players) &&
        lobby.players >= 1 &&
        lobby.players < 4 &&
        isRaceMode(lobby.settings?.mode) &&
        Number.isInteger(lobby.settings?.targetFloor) &&
        Number.isFinite(lobby.settings?.durationMs) &&
        typeof lobby.settings?.bumping === 'boolean',
    )
  )
    throw new RaceRequestError('Unexpected lobby response.', 502);
  return data;
}
const randomHex = (bytes: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
export function newRaceSession(room = randomHex(16)): RaceSession {
  return { room, token: randomHex(32) };
}
export function readRaceSession(raw: string | null): RaceSession | null {
  try {
    const data = JSON.parse(raw ?? 'null');
    return validRaceId(data?.room) &&
      typeof data.token === 'string' &&
      /^[a-f0-9]{64}$/.test(data.token)
      ? { room: data.room, token: data.token }
      : null;
  } catch {
    return null;
  }
}

/** Revision checks protect the UI from delayed poll responses after a ready or rematch. */
export class RaceConnection {
  view: RaceView | null = null;
  private offset = 0;
  private bestLatency = Infinity;
  private controllers = new Set<AbortController>();
  private closed = false;
  readonly session: RaceSession;
  private onView: (view: RaceView) => void;
  private transport: typeof fetch;
  private clock: () => number;
  constructor(
    session: RaceSession,
    onView: (view: RaceView) => void,
    transport: typeof fetch = (url, options) => fetch(url, options),
    clock = Date.now,
  ) {
    this.session = session;
    this.onView = onView;
    this.transport = transport;
    this.clock = clock;
  }
  now() {
    return this.clock() + this.offset;
  }
  async send(action: Omit<RaceAction, 'room'>) {
    if (this.closed) throw new RaceRequestError('Connection closed.', 0);
    const controller = new AbortController();
    this.controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), 5_000),
      sent = this.clock();
    try {
      const response = await this.transport(RACE_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.session.token}`,
        },
        body: JSON.stringify({ ...action, room: this.session.room }),
        signal: controller.signal,
        cache: 'no-store',
      });
      const data = (await response.json()) as RaceView & { error?: unknown };
      if (!response.ok)
        throw new RaceRequestError(
          typeof data?.error === 'string'
            ? data.error
            : 'Could not connect to this race.',
          response.status,
        );
      if (
        data?.id !== this.session.room ||
        !Number.isFinite(data.serverNow) ||
        !Number.isSafeInteger(data.revision) ||
        !Array.isArray(data.players)
      )
        throw new RaceRequestError('Unexpected race response.', 502);
      if (
        data.rulesVersion !== RACE_RULES_VERSION ||
        !isRaceMode(data.settings?.mode)
      )
        throw new RaceRequestError(
          'The race rules have changed. Reload the game to join.',
          409,
        );
      const received = this.clock(),
        latency = received - sent;
      if (latency < this.bestLatency) {
        this.bestLatency = latency;
        this.offset = data.serverNow + latency / 2 - received;
      }
      if (!this.closed && (!this.view || data.revision > this.view.revision)) {
        this.view = data;
        this.onView(data);
      }
      return this.view!;
    } finally {
      clearTimeout(timeout);
      this.controllers.delete(controller);
    }
  }
  close() {
    this.closed = true;
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
  }
}
