/** Local-only, bounded playtest measurements. No identity, network requests or key logs. */
export const PLAYTEST_STORAGE_KEY = 'frostbound:playtest:v1';
export const PLAYTEST_FEATURE_VERSION = 'replay-features-v1';
export const MAX_PLAYTEST_RUNS = 300;
const SESSION_GAP_MS = 30 * 60 * 1000;
const DAY_MS = 86_400_000;
export type PlaytestDevice = 'mobile' | 'desktop';
export type PlaytestRun = {
  id: string; sessionId: string; startedAt: number; finishedAt?: number; abandonedAt?: number; lastActivityAt?: number; abandonmentReason?: 'menu' | 'restart' | 'unload';
  device: PlaytestDevice; mode: string; featureVersion: string;
  goals: string[]; result?: { floor: number; bestCombo: number; wallRebounds: number; gems: number };
};
type Dataset = { schema: 1; runs: PlaytestRun[]; discardedRuns: number };
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type PlaytestSummary = {
  device: PlaytestDevice; mode: string; featureVersion: string; runs: number;
  sessions: number; replaySessions: number; replayRate: number;
  finishedRuns: number; abandonedRuns: number; goalCompletingRuns: number; goalCompletionRate: number;
  nextDayReturn: 'pending' | 'returned' | 'did not return' | 'history truncated';
};
const day = (timestamp: number) => Math.floor(timestamp / DAY_MS);
const empty = (): Dataset => ({ schema: 1, runs: [], discardedRuns: 0 });
function validRun(value: unknown): value is PlaytestRun {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<PlaytestRun>;
  return typeof row.id === 'string' && typeof row.sessionId === 'string'
    && Number.isFinite(row.startedAt) && (row.device === 'mobile' || row.device === 'desktop')
    && typeof row.mode === 'string' && typeof row.featureVersion === 'string'
    && Array.isArray(row.goals) && row.goals.every(goal => typeof goal === 'string')
    && (row.finishedAt === undefined || Number.isFinite(row.finishedAt));
}
export function summarizePlaytest(data: Dataset, now = Date.now()): PlaytestSummary[] {
  const groups = new Map<string, PlaytestRun[]>();
  for (const run of data.runs) {
    const key = JSON.stringify([run.device, run.mode, run.featureVersion]);
    groups.set(key, [...(groups.get(key) ?? []), run]);
  }
  return [...groups.values()].map(runs => {
    const sessions = new Map<string, number>();
    for (const run of runs) sessions.set(run.sessionId, (sessions.get(run.sessionId) ?? 0) + 1);
    const replaySessions = [...sessions.values()].filter(count => count > 1).length;
    const finishedRuns = runs.filter(run => run.finishedAt !== undefined).length;
    const goalCompletingRuns = runs.filter(run => run.goals.length > 0).length;
    const firstDay = Math.min(...runs.map(run => day(run.startedAt)));
    const returned = runs.some(run => day(run.startedAt) === firstDay + 1);
    return {
      device: runs[0].device, mode: runs[0].mode, featureVersion: runs[0].featureVersion,
      runs: runs.length, sessions: sessions.size, replaySessions, replayRate: replaySessions / sessions.size,
      finishedRuns, abandonedRuns: runs.filter(run => run.abandonedAt !== undefined).length, goalCompletingRuns, goalCompletionRate: goalCompletingRuns / runs.length,
      nextDayReturn: data.discardedRuns > 0 ? 'history truncated' : returned ? 'returned' : day(now) <= firstDay + 1 ? 'pending' : 'did not return',
    };
  });
}
export class PlaytestAnalytics {
  private data: Dataset;
  private sessionId: string | null = null;
  private lastActivity = 0;
  private serial = 0;
  private storageAvailable = true;
  private storage?: Storage;
  private now: () => number;
  constructor(storage?: Storage, now: () => number = Date.now) {
    this.storage = storage; this.now = now;
    this.data = empty();
    if (!storage) this.storageAvailable = false;
    try {
      const raw = storage?.getItem(PLAYTEST_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<Dataset>;
        if (saved.schema === 1 && Array.isArray(saved.runs) && saved.runs.every(validRun)) {
          this.data = { schema: 1, runs: saved.runs.slice(-MAX_PLAYTEST_RUNS), discardedRuns: Math.max(0, Number(saved.discardedRuns) || 0) + Math.max(0, saved.runs.length - MAX_PLAYTEST_RUNS) };
        }
      }
    } catch { this.storageAvailable = false; }
    const latest = this.data.runs.at(-1);
    if (latest) { this.lastActivity = latest.lastActivityAt ?? latest.finishedAt ?? latest.startedAt; this.sessionId = latest.sessionId; }
  }
  private save() {
    try { this.storage?.setItem(PLAYTEST_STORAGE_KEY, JSON.stringify(this.data)); }
    catch { this.storageAvailable = false; }
  }
  beginRun(context: { mode: string; device?: PlaytestDevice; featureVersion?: string }): string {
    const now = this.now();
    const id = `${now.toString(36)}-${++this.serial}-${Math.random().toString(36).slice(2, 10)}`;
    if (!this.sessionId || now - this.lastActivity >= SESSION_GAP_MS || now < this.lastActivity) this.sessionId = id;
    this.lastActivity = now;
    this.data.runs.push({ id, sessionId: this.sessionId, startedAt: now, device: context.device ?? detectPlaytestDevice(), mode: context.mode, featureVersion: context.featureVersion ?? PLAYTEST_FEATURE_VERSION, goals: [] });
    if (this.data.runs.length > MAX_PLAYTEST_RUNS) {
      this.data.discardedRuns += this.data.runs.length - MAX_PLAYTEST_RUNS;
      this.data.runs = this.data.runs.slice(-MAX_PLAYTEST_RUNS);
    }
    this.save(); return id;
  }
  finishRun(id: string, result: NonNullable<PlaytestRun['result']>) {
    const run = this.data.runs.find(row => row.id === id);
    if (!run || run.finishedAt !== undefined || run.abandonedAt !== undefined) return;
    run.finishedAt = this.now();
    run.result = Object.fromEntries(Object.entries(result).map(([key, value]) => [key, Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0])) as typeof result;
    this.lastActivity = run.finishedAt; run.lastActivityAt = this.lastActivity;
    this.save();
  }
  completeGoal(id: string, goalId: string) {
    const run = this.data.runs.find(row => row.id === id);
    if (!run || !goalId || run.goals.includes(goalId) || run.goals.length >= 30) return;
    run.goals.push(goalId.slice(0, 100)); this.lastActivity = this.now(); run.lastActivityAt = this.lastActivity; this.save();
  }
  abandonRun(id: string, reason: 'menu' | 'restart' | 'unload' = 'menu') {
    const run = this.data.runs.find(row => row.id === id);
    if (!run || run.finishedAt !== undefined || run.abandonedAt !== undefined) return;
    run.abandonedAt = this.now(); run.lastActivityAt = run.abandonedAt; run.abandonmentReason = reason;
    this.lastActivity = run.abandonedAt; this.save();
  }
  getReport() { return { summary: summarizePlaytest(this.data, this.now()), discardedRuns: this.data.discardedRuns, persistent: this.storageAvailable }; }
  exportJSON() { return JSON.stringify({ ...this.data, exportedAt: this.now(), summary: this.getReport().summary }, null, 2); }
  clear() { this.data = empty(); this.sessionId = null; this.lastActivity = 0; this.save(); }
}
export function detectPlaytestDevice(): PlaytestDevice {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches ? 'mobile' : 'desktop';
}
let browserAnalytics: PlaytestAnalytics | undefined;
export function createPlaytestAnalytics(): PlaytestAnalytics {
  if (typeof window === 'undefined') return new PlaytestAnalytics();
  if (!browserAnalytics) {
    let storage: Storage | undefined;
    try { storage = window.localStorage; } catch { /* Private browsing can block storage. */ }
    browserAnalytics = new PlaytestAnalytics(storage);
  }
  return browserAnalytics;
}
