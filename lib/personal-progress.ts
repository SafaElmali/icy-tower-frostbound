import type { GameMode } from './tower-engine';

export const PERSONAL_PROGRESS_STORAGE_KEY = 'frostbound-personal-progress-v1';
export type PersonalRecords = { floor: number; bestCombo: number; wallJumps: number };
export type PersonalProgress = { version: 1; modes: Record<GameMode, PersonalRecords> };
export type PersonalRun = PersonalRecords & { mode: GameMode; status?: string };
export type PersonalRunBaseline = Readonly<PersonalRecords & { mode: GameMode }>;
export type PersonalComparison = { metric: keyof PersonalRecords; label: string; current: number; previous: number; improvement: number };
const modes: readonly GameMode[] = ['arcade', 'party', 'practice'];
const metrics = ['floor', 'bestCombo', 'wallJumps'] as const;
const labels = { floor: 'Highest floor', bestCombo: 'Best combo', wallJumps: 'Wall rebounds' };
const count = (value: unknown): number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
const emptyRecords = (): PersonalRecords => ({ floor: 0, bestCombo: 0, wallJumps: 0 });
const emptyProgress = (): PersonalProgress => ({ version: 1, modes: { arcade: emptyRecords(), party: emptyRecords(), practice: emptyRecords() } });

export function readPersonalProgress(raw: string | null): PersonalProgress {
  const fresh = emptyProgress();
  if (!raw || raw.length > 10000) return fresh;
  try {
    const value = JSON.parse(raw);
    if (!value || value.version !== 1 || !value.modes || typeof value.modes !== 'object') return fresh;
    for (const mode of modes) {
      const saved = value.modes[mode];
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        for (const metric of metrics) fresh.modes[mode][metric] = count(saved[metric]);
      }
    }
  } catch { /* A damaged save must never prevent a climb. */ }
  return fresh;
}

/** Capture once before starting a run. Saving a new record cannot change this snapshot. */
export function personalRunBaseline(profile: PersonalProgress, mode: GameMode): PersonalRunBaseline {
  return Object.freeze({ mode, ...profile.modes[mode] });
}

/** Keep each skill's best independently, and compare only runs using the same mode. */
export function comparePersonalProgress(baseline: PersonalRunBaseline, run: PersonalRun): PersonalComparison[] {
  if (baseline.mode !== run.mode) return [];
  return metrics.map(metric => {
    const current = count(run[metric]);
    const previous = count(baseline[metric]);
    return { metric, label: labels[metric], current, previous, improvement: Math.max(0, current - previous) };
  });
}

export function recordPersonalProgress(profile: PersonalProgress, run: PersonalRun): PersonalProgress {
  if (run.status !== 'over' || !modes.includes(run.mode)) return profile;
  const previous = profile.modes[run.mode];
  const next = { ...previous };
  for (const metric of metrics) next[metric] = Math.max(previous[metric], count(run[metric]));
  if (metrics.every(metric => next[metric] === previous[metric])) return profile;
  return { version: 1, modes: { ...profile.modes, [run.mode]: next } };
}

export function loadPersonalProgress(storage: Pick<Storage, 'getItem'> | null): PersonalProgress {
  try { return readPersonalProgress(storage?.getItem(PERSONAL_PROGRESS_STORAGE_KEY) ?? null); }
  catch { return emptyProgress(); }
}

export function savePersonalProgress(storage: Pick<Storage, 'setItem'> | null, profile: PersonalProgress): boolean {
  if (!storage) return false;
  try { storage.setItem(PERSONAL_PROGRESS_STORAGE_KEY, JSON.stringify(profile)); return true; }
  catch { return false; }
}
