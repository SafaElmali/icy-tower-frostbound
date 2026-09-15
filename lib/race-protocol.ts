import { TowerEngine, type RunReplay } from './tower-engine.ts';

export const RACE_RULES_VERSION = 5;
export const RACE_TARGET = 20;
export const RACE_DURATION_MS = 90_000;
export const RACE_COUNTDOWN_MS = 4_000;
export const RACE_DISCONNECT_MS = 15_000;
export const RACE_ROOM_TTL_MS = 60 * 60_000;
export const RACE_POLL_MS = 500;
export const RACE_API = '/.netlify/functions/race';
export type RaceSlot = 'host' | 'guest';
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
};
export type RaceResult = {
  kind: 'goal' | 'fell' | 'time' | 'forfeit';
  floor: number;
  duration: number;
};
export type RacePlayer = {
  slot: RaceSlot;
  ready: boolean;
  lastSeen: number;
  pose: RacePose | null;
  result: RaceResult | null;
  rematch: boolean;
};
export type RaceView = {
  id: string;
  revision: number;
  round: number;
  seed: number;
  rulesVersion: typeof RACE_RULES_VERSION;
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
  action: 'create' | 'join' | 'poll' | 'ready' | 'finish' | 'rematch' | 'leave';
  room: string;
  round?: number;
  ready?: boolean;
  seq?: number;
  pose?: RacePose;
  replay?: RunReplay;
};
export const validRaceId = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
export const otherSlot = (slot: RaceSlot): RaceSlot =>
  slot === 'host' ? 'guest' : 'host';
export function createRaceEngine(seed: number) {
  const engine = new TowerEngine(seed, true, RACE_RULES_VERSION);
  engine.start('arcade');
  return engine;
}
export function racePose(engine: TowerEngine): RacePose {
  const { x, y, vx, vy, facing, grounded, time, floor } = engine;
  return { x, y, vx, vy, facing, grounded, time, floor };
}
export function raceInvite(base: string, room: string) {
  const url = new URL('/race', base);
  url.searchParams.set('room', room);
  return url.href;
}
