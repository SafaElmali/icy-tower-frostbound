import type { TowerEngine } from './tower-engine.ts';

// Daily rules are pinned independently of engine defaults. A future rules update
// must keep decoding this version so archived links continue to play identically.
export const DAILY_RULES_VERSION = 4;
export const DAILY_PROGRESS_STORAGE_KEY = 'frostbound-daily-progress-v1';
export const MAX_DAILY_BESTS = 90;
export type DailyTower = { date: string; version: 4; mode: 'arcade'; seed: number };
export type DailyBest = { floor: number; score: number };
export type DailyProgress = { version: 1; bests: Record<string, DailyBest> };

export function dailyForDate(date: string, version: number = DAILY_RULES_VERSION): DailyTower | null {
  if (version !== DAILY_RULES_VERSION || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return null;
  let seed = 2166136261;
  for (const char of `frostbound-daily:${version}:${date}:arcade`) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  return { date, version, mode: 'arcade', seed };
}

export function todayDailyTower(now = new Date()): DailyTower {
  return dailyForDate(now.toISOString().slice(0, 10))!;
}

export function dailyTowerToken(daily: DailyTower): string { return `${daily.version}.${daily.date}.a`; }

export function decodeDailyTower(token: string | null): DailyTower | null {
  if (!token || token.length > 20) return null;
  const match = /^(4)\.(\d{4}-\d{2}-\d{2})\.a$/.exec(token);
  return match ? dailyForDate(match[2], Number(match[1])) : null;
}

export function dailyTowerUrl(base: string, daily: DailyTower): string {
  const url = new URL(base);
  url.search = ''; url.hash = '';
  url.searchParams.set('daily', dailyTowerToken(daily));
  return url.toString();
}

export function startDailyRun(engine: TowerEngine, daily: DailyTower) {
  engine.start(daily.mode, daily.seed, daily.version);
}

const validCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export function readDailyProgress(raw: string | null): DailyProgress {
  const empty: DailyProgress = { version: 1, bests: {} };
  if (!raw || raw.length > 50000) return empty;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1 || !('bests' in value) || !value.bests || typeof value.bests !== 'object' || Array.isArray(value.bests)) return empty;
    for (const [key, best] of Object.entries(value.bests).sort(([a], [b]) => b.localeCompare(a))) {
      if (Object.keys(empty.bests).length >= MAX_DAILY_BESTS) break;
      if (!decodeDailyTower(key) || !best || typeof best !== 'object' || !('floor' in best) || !('score' in best) || !validCount(best.floor) || !validCount(best.score)) continue;
      empty.bests[key] = { floor: best.floor, score: best.score };
    }
    return empty;
  } catch { return empty; }
}

export function getDailyBest(progress: DailyProgress, daily: DailyTower): DailyBest | null {
  return progress.bests[dailyTowerToken(daily)] ?? null;
}

/** Persist only a completed attempt on this exact daily tower. No attempt limit. */
export function updateDailyProgress(progress: DailyProgress, daily: DailyTower, engine: Pick<TowerEngine, 'status' | 'seed' | 'mode' | 'rulesVersion' | 'floor' | 'score'>): DailyProgress {
  if (engine.status !== 'over' || engine.seed !== daily.seed || engine.mode !== daily.mode || engine.rulesVersion !== daily.version || !validCount(engine.floor) || !validCount(engine.score)) return progress;
  const best = getDailyBest(progress, daily);
  if (best && (best.floor > engine.floor || (best.floor === engine.floor && best.score >= engine.score))) return progress;
  const key = dailyTowerToken(daily);
  // Keep the tower just played, including an old shared link, plus the most recent
  // other dates. This avoids losing an archived result immediately after a run.
  const entries = Object.entries(progress.bests).filter(([id]) => id !== key).sort(([a], [b]) => b.localeCompare(a)).slice(0, MAX_DAILY_BESTS - 1);
  return { version: 1, bests: { ...Object.fromEntries(entries), [key]: { floor: engine.floor, score: engine.score } } };
}
