import type { GameMode, TowerEngine } from './tower-engine';

// This version pins both the layout generator and the run rules. Reject unknown
// versions rather than silently sending friends into a different tower.
export type FriendChallenge = { version: 2; seed: number; mode: GameMode; floor: number; score: number };

export function decodeChallenge(value: string | null): FriendChallenge | null {
  if (!value || value.length > 100) return null;
  const parts = value.split('.');
  if (parts.length !== 5 || parts[0] !== '2' || !['a', 'p'].includes(parts[2])) return null;
  if (![parts[1], parts[3], parts[4]].every(part => /^(0|[1-9]\d*)$/.test(part))) return null;
  const seed = Number(parts[1]), floor = Number(parts[3]), score = Number(parts[4]);
  if (!Number.isSafeInteger(seed) || seed > 0xffffffff || !Number.isSafeInteger(floor) || floor < 1 || !Number.isSafeInteger(score)) return null;
  return { version: 2, seed, mode: parts[2] === 'a' ? 'arcade' : 'practice', floor, score };
}

export function challengeFromRun(engine: TowerEngine): FriendChallenge | null {
  if (engine.status !== 'over' || engine.floor < 1) return null;
  return { version: 2, seed: engine.seed, mode: engine.mode, floor: engine.floor, score: engine.score };
}

export function challengeUrl(base: string, challenge: FriendChallenge): string {
  const url = new URL(base);
  url.search = '';
  url.hash = '';
  url.searchParams.set('challenge', `${challenge.version}.${challenge.seed}.${challenge.mode === 'arcade' ? 'a' : 'p'}.${challenge.floor}.${challenge.score}`);
  return url.toString();
}

export function challengeText(challenge: FriendChallenge): string {
  return `Beat my floor ${challenge.floor}. ${challenge.score.toLocaleString('en-US')} points · ${challenge.mode === 'arcade' ? 'Arcade' : 'Practice'} · Icy Tower — Frostbound`;
}

// Every start path (buttons, keyboard, and game tools) uses the same rules.
export function startChallengeRun(engine: TowerEngine, challenge: FriendChallenge | null, mode: GameMode) {
  engine.start(challenge?.mode ?? mode, challenge?.seed ?? Math.floor(Math.random() * 2 ** 30));
}
