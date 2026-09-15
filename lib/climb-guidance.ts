import type { Controls, GameEvent, GameMode, GameStatus } from './tower-engine';

export const GUIDANCE_STORAGE_KEY = 'frostbound-guidance-v1';
const STEPS = ['move', 'jump', 'momentum'] as const;
export type GuidanceStep = typeof STEPS[number];
export type GuidanceProfile = { version: 1; completed: GuidanceStep[]; skipped: boolean };
export type GuidanceObservation = {
  status: GameStatus; mode: GameMode; time: number; x: number; vx: number;
  grounded: boolean; maxY: number;
};
export type GuidanceRun = {
  previousTime: number; previousX: number; previousGrounded: boolean;
  groundTravel: number; frostStartedAt: number | null;
};
export type GuidanceCue = { id: GuidanceStep | 'frost'; title: string; text: string; skippable: boolean };

export const replayGuidance = (): GuidanceProfile => ({ version: 1, completed: [], skipped: false });
export const freshGuidanceRun = (): GuidanceRun => ({ previousTime: 0, previousX: 0, previousGrounded: true, groundTravel: 0, frostStartedAt: null });
export const skipGuidance = (profile: GuidanceProfile): GuidanceProfile => profile.skipped ? profile : { ...profile, skipped: true };

export function readGuidanceProfile(raw: string | null): GuidanceProfile {
  if (!raw || raw.length > 2000) return replayGuidance();
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1 || !('completed' in value) || !Array.isArray(value.completed)) return replayGuidance();
    const completed: GuidanceStep[] = [];
    for (const step of STEPS) {
      if (!value.completed.includes(step)) break;
      completed.push(step);
    }
    return { version: 1, completed, skipped: 'skipped' in value && value.skipped === true };
  } catch { return replayGuidance(); }
}

/** Observe once per frame after tick, with that frame's drained events. Never changes physics. */
export function advanceGuidance(
  profile: GuidanceProfile,
  run: GuidanceRun,
  observation: GuidanceObservation,
  events: readonly GameEvent[],
  controls: Controls,
): { profile: GuidanceProfile; run: GuidanceRun } {
  if (observation.status !== 'playing') return { profile, run };
  // A new run must get freshGuidanceRun; also reject duplicate or stale observations.
  if (observation.time <= run.previousTime) return { profile, run };
  const elapsed = observation.time - run.previousTime;
  const distance = Math.abs(observation.x - run.previousX);
  const moving = controls.left !== controls.right;
  const travel = moving && run.previousGrounded && observation.grounded && Math.abs(observation.vx) >= 2 && distance <= 9 * elapsed + .01 ? distance : 0;
  const nextRun = {
    ...run,
    previousTime: observation.time,
    previousX: observation.x,
    previousGrounded: observation.grounded,
    groundTravel: run.groundTravel + travel,
    // Keep the normal game's existing floor-five trigger (FLOOR_HEIGHT = 2.35).
    frostStartedAt: run.frostStartedAt ?? (observation.mode !== 'practice' && observation.maxY >= 5 * 2.35 ? observation.time : null),
  };
  if (profile.skipped) return { profile, run: nextRun };
  const step = STEPS.find(id => !profile.completed.includes(id));
  const jumped = events.some(event => event.type === 'jump');
  const momentumJumped = events.some(event => event.type === 'jump' && Number.isFinite(event.value) && Math.abs(event.value!) >= 4);
  const completed = step === 'move' ? nextRun.groundTravel >= .6 : step === 'jump' ? jumped : step === 'momentum' ? momentumJumped : false;
  return { profile: completed && step ? { ...profile, completed: [...profile.completed, step] } : profile, run: nextRun };
}

export function getGuidanceCue(profile: GuidanceProfile, run: GuidanceRun, observation: GuidanceObservation): GuidanceCue | null {
  if (observation.status !== 'playing') return null;
  if (run.frostStartedAt !== null && observation.time - run.frostStartedAt < 4) {
    return { id: 'frost', title: 'The frost is rising', text: 'Keep climbing. The frost now advances even when you stand still.', skippable: false };
  }
  if (profile.skipped) return null;
  const step = STEPS.find(id => !profile.completed.includes(id));
  if (step === 'move') return { id: step, title: 'Get moving', text: 'Hold ← or → (A / D), or a direction button, to run along the ledge.', skippable: true };
  if (step === 'jump') return { id: step, title: 'Your first jump', text: 'Press Space, ↑, W, or the jump button. Steer toward the next wide ledge.', skippable: true };
  if (step === 'momentum') return { id: step, title: 'Run, then jump', text: 'Build speed along a ledge before jumping. A faster takeoff sends you higher.', skippable: true };
  return null;
}
