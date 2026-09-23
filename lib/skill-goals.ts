import type { Snapshot } from './tower-engine';

export const SKILL_GOALS_STORAGE_KEY = 'frostbound-skill-goals-v1';
export type SkillRun = Pick<Snapshot, 'status' | 'floor' | 'gems' | 'wallJumps' | 'bestCombo'>;
type SkillMetric = 'floor' | 'gems' | 'wallJumps' | 'bestCombo';
export type SkillGoal = {
  id: string;
  title: string;
  description: string;
  requires: readonly string[];
  targets: readonly { metric: SkillMetric; target: number; label: string }[];
};
export const SKILL_GOALS: readonly SkillGoal[] = [
  { id: 'floor-5', title: 'Reach floor 5', description: 'Land on floor 5 or higher. Take your time finding the next ledge.', requires: [], targets: [{ metric: 'floor', target: 5, label: 'Floors' }] },
  { id: 'crystal-1', title: 'Collect one crystal', description: 'Touch a floating crystal on your climb.', requires: [], targets: [{ metric: 'gems', target: 1, label: 'Crystals' }] },
  { id: 'wall-1', title: 'Perform one wall rebound', description: 'Hit a wall at speed while airborne to bounce back into the tower.', requires: [], targets: [{ metric: 'wallJumps', target: 1, label: 'Rebounds' }] },
  { id: 'combo-3', title: 'Land a 3-floor combo', description: 'Jump two or more floors at a time before the combo timer expires.', requires: ['floor-5'], targets: [{ metric: 'bestCombo', target: 3, label: 'Combo' }] },
  { id: 'floor-15', title: 'Reach floor 15', description: 'Use momentum to climb higher in one run.', requires: ['floor-5', 'combo-3'], targets: [{ metric: 'floor', target: 15, label: 'Floors' }] },
  { id: 'crystal-5', title: 'Collect five crystals', description: 'Collect five crystals in a single run. Choose your detours carefully.', requires: ['crystal-1'], targets: [{ metric: 'gems', target: 5, label: 'Crystals' }] },
  { id: 'wall-3', title: 'Perform three wall rebounds', description: 'Make three airborne rebounds in one run.', requires: ['wall-1'], targets: [{ metric: 'wallJumps', target: 3, label: 'Rebounds' }] },
  { id: 'combo-6', title: 'Land a 6-floor combo', description: 'Build enough speed to connect a longer climbing chain.', requires: ['combo-3'], targets: [{ metric: 'bestCombo', target: 6, label: 'Combo' }] },
  { id: 'combine-skills', title: 'Put your skills together', description: 'Reach floor 15 with a 6-floor combo and three rebounds in the same run.', requires: ['floor-15', 'wall-3', 'combo-6'], targets: [{ metric: 'floor', target: 15, label: 'Floors' }, { metric: 'bestCombo', target: 6, label: 'Combo' }, { metric: 'wallJumps', target: 3, label: 'Rebounds' }] },
  { id: 'floor-30', title: 'Reach floor 30', description: 'Keep climbing after a combo breaks. Every higher landing counts.', requires: ['combine-skills'], targets: [{ metric: 'floor', target: 30, label: 'Floors' }] },
  { id: 'combo-15', title: 'Land a 15-floor combo', description: 'Connect your momentum jumps into a sustained climbing chain.', requires: ['combine-skills'], targets: [{ metric: 'bestCombo', target: 15, label: 'Combo' }] },
];
export type SkillProgress = { version: 1; completed: string[]; featuredId: string | null };
export type SkillGoalView = SkillGoal & {
  status: 'locked' | 'available' | 'complete';
  featured: boolean;
  progress: { label: string; value: number; target: number }[];
};
const unlocked = (goal: SkillGoal, completed: readonly string[]) => goal.requires.every(id => completed.includes(id));
const defaultFeatured = (completed: readonly string[]) => SKILL_GOALS.find(goal => !completed.includes(goal.id) && unlocked(goal, completed))?.id ?? null;
const count = (value: number) => Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

/** Shared learning milestones: Practice can teach the same skills as ranked modes. */
export function readSkillProgress(raw: string | null): SkillProgress {
  const fresh: SkillProgress = { version: 1, completed: [], featuredId: 'floor-5' };
  if (!raw || raw.length > 10000) return fresh;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1 || !('completed' in value) || !Array.isArray(value.completed)) return fresh;
    const saved = value.completed;
    // Ignore unknown/duplicate IDs and achievements missing their prerequisites.
    const completed: string[] = [];
    for (const goal of SKILL_GOALS) if (saved.includes(goal.id) && unlocked(goal, completed)) completed.push(goal.id);
    const featuredId = 'featuredId' in value && typeof value.featuredId === 'string' ? value.featuredId : null;
    const featured = SKILL_GOALS.find(goal => goal.id === featuredId && !completed.includes(goal.id) && unlocked(goal, completed));
    return { version: 1, completed, featuredId: featured?.id ?? defaultFeatured(completed) };
  } catch { return fresh; }
}

/** Call with real engine snapshots; counters represent this run, never a lifetime sum. */
export function advanceSkillProgress(profile: SkillProgress, run: SkillRun): SkillProgress {
  if (run.status === 'ready') return profile;
  let completed = profile.completed;
  for (const goal of SKILL_GOALS) {
    if (!completed.includes(goal.id) && unlocked(goal, completed) && goal.targets.every(target => count(run[target.metric]) >= target.target)) completed = [...completed, goal.id];
  }
  if (completed === profile.completed) return profile;
  const featuredId = profile.featuredId && !completed.includes(profile.featuredId) ? profile.featuredId : defaultFeatured(completed);
  return { version: 1, completed, featuredId };
}

export function selectSkillGoal(profile: SkillProgress, id: string): SkillProgress {
  const goal = SKILL_GOALS.find(item => item.id === id);
  if (!goal || profile.featuredId === id || profile.completed.includes(id) || !unlocked(goal, profile.completed)) return profile;
  return { ...profile, featuredId: id };
}

export function getSkillGoals(profile: SkillProgress, run?: SkillRun): SkillGoalView[] {
  return SKILL_GOALS.map(goal => {
    const complete = profile.completed.includes(goal.id);
    return {
      ...goal, status: complete ? 'complete' : unlocked(goal, profile.completed) ? 'available' : 'locked', featured: profile.featuredId === goal.id,
      progress: goal.targets.map(target => ({ label: target.label, target: target.target, value: complete ? target.target : Math.min(target.target, run && run.status !== 'ready' ? count(run[target.metric]) : 0) })),
    };
  });
}

export function getFeaturedSkillGoal(profile: SkillProgress, run?: SkillRun): SkillGoalView | null {
  return getSkillGoals(profile, run).find(goal => goal.featured && goal.status === 'available') ?? null;
}

export function loadSkillProgress(storage: Pick<Storage, 'getItem'> | null): SkillProgress {
  try { return readSkillProgress(storage?.getItem(SKILL_GOALS_STORAGE_KEY) ?? null); }
  catch { return readSkillProgress(null); }
}

export function saveSkillProgress(storage: Pick<Storage, 'setItem'> | null, profile: SkillProgress): boolean {
  if (!storage) return false;
  try { storage.setItem(SKILL_GOALS_STORAGE_KEY, JSON.stringify(profile)); return true; }
  catch { return false; }
}
