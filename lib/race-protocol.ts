import { TowerEngine } from './tower-engine.ts';
import type { Outfit } from './outfits.ts';

export const RACE_RULES_VERSION = 6;
export const RACE_PROTOCOL_VERSION = 4;
export type RaceSettings = {
  targetFloor: number;
  durationMs: number;
  bumping: boolean;
};
export const RACE_DURATIONS = [60_000, 120_000, 180_000, 300_000] as const;
export const DEFAULT_RACE_SETTINGS: RaceSettings = {
  targetFloor: 30,
  durationMs: 180_000,
  bumping: false,
};
/** Defaults retained for callers that do not yet have a room. */
export const RACE_TARGET = DEFAULT_RACE_SETTINGS.targetFloor;
export const RACE_DURATION_MS = DEFAULT_RACE_SETTINGS.durationMs;
export const RACE_COUNTDOWN_MS = 4_000;
export const RACE_DISCONNECT_MS = 15_000;
export const RACE_ROOM_TTL_MS = 60 * 60_000;
export const RACE_POLL_MS = 500;
export const RACE_BUMP_COOLDOWN_MS = 1_500;
export const RACE_API = '/.netlify/functions/race';
export const RACE_SLOTS = ['host', 'guest', 'guest2', 'guest3'] as const;
export const RACE_MAX_PLAYERS = RACE_SLOTS.length;
export type RaceVisibility = 'public' | 'private';
export type RaceLobby = {
  id: string;
  hostName: string;
  players: number;
  settings: RaceSettings;
};
export type RaceLobbyList = { lobbies: RaceLobby[]; limited: boolean };
export type RaceSlot = (typeof RACE_SLOTS)[number];
export const racePlayerLabel = (slot: RaceSlot) =>
  `Player ${RACE_SLOTS.indexOf(slot) + 1}`;
export const signalKey = (from: RaceSlot, to: RaceSlot) =>
  (from === 'host' && to === 'guest') || (from === 'guest' && to === 'host')
    ? from
    : `${from}:${to}`;
export type RacePhase =
  | 'waiting'
  | 'countdown'
  | 'racing'
  | 'finishing'
  | 'finished';
export type RacePose = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  grounded: boolean;
  time: number;
  floor: number;
  frame: number;
  checkpointFloor: number;
  respawning: boolean;
  protected: boolean;
};
export type RaceResult = {
  kind: 'goal' | 'time' | 'forfeit';
  floor: number;
  duration: number;
};
export type RaceProfile = { name: string; outfit: Outfit };
export type RacePlayer = {
  slot: RaceSlot;
  profile?: RaceProfile;
  ready: boolean;
  lastSeen: number;
  pose: RacePose | null;
  result: RaceResult | null;
  rematch: boolean;
};
export type RaceSignal = {
  type: 'offer' | 'answer';
  sdp: string;
  generation: string;
};
export type RaceBumpEvent = {
  id: string;
  from: RaceSlot;
  to: RaceSlot;
  at: number;
  direction: -1 | 1;
  targetFrame: number;
};
export type RaceRecording = {
  version: 1;
  rulesVersion: typeof RACE_RULES_VERSION;
  seed: number;
  moves: [number, number][];
  bumps: { id: string; frame: number }[];
};
export type RaceView = {
  id: string;
  visibility?: RaceVisibility;
  revision: number;
  round: number;
  seed: number;
  rulesVersion: typeof RACE_RULES_VERSION;
  settings: RaceSettings;
  signals: Partial<Record<string, RaceSignal>>;
  bumps: RaceBumpEvent[];
  phase: RacePhase;
  startAt: number | null;
  deadline: number | null;
  expiresAt: number;
  serverNow: number;
  you: RaceSlot;
  players: RacePlayer[];
  winner: RaceSlot | null;
  reason: 'goal' | 'height' | 'draw' | 'forfeit' | null;
};
export type RaceSession = { room: string; token: string };
export type RaceAction = {
  action:
    | 'create'
    | 'join'
    | 'poll'
    | 'ready'
    | 'configure'
    | 'profile'
    | 'signal'
    | 'bump'
    | 'finish'
    | 'rematch'
    | 'leave';
  room: string;
  visibility?: RaceVisibility;
  round?: number;
  ready?: boolean;
  seq?: number;
  pose?: RacePose;
  replay?: RaceRecording;
  settings?: RaceSettings;
  profile?: RaceProfile;
  signal?: RaceSignal;
  target?: RaceSlot;
  direction?: -1 | 1;
};
export const validRaceId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
export const otherSlot = (slot: RaceSlot): RaceSlot =>
  slot === 'host' ? 'guest' : 'host';
export function createRaceEngine(seed: number) {
  const engine = new TowerEngine(seed, false, 5);
  engine.start('arcade');
  engine.useStaticRacePlatforms();
  engine.useRaceHazards();
  return engine;
}
export function racePose(engine: TowerEngine): RacePose {
  const { x, y, vx, vy, facing, grounded, time, floor } = engine;
  return {
    x,
    y,
    vx,
    vy,
    facing,
    grounded,
    time,
    floor,
    frame: Math.round(time * 120),
    checkpointFloor: Math.floor(floor / 5) * 5,
    respawning: false,
    protected: false,
  };
}
export function raceInvite(base: string, room: string) {
  const url = new URL('/race', base);
  url.searchParams.set('room', room);
  return url.href;
}
