import type { Snapshot } from './tower-engine.ts';
import type { PersonalRunBaseline } from './personal-progress.ts';
import {
  advanceSkillProgress,
  getFeaturedSkillGoal,
  type SkillProgress,
} from './skill-goals.ts';
import { getRunFeedback } from './run-feedback.ts';
import { COSMETICS, type AchievementProgress } from './outfits.ts';

export type NextClimbInput = {
  snapshot: Pick<
    Snapshot,
    | 'status'
    | 'mode'
    | 'floor'
    | 'gems'
    | 'wallJumps'
    | 'bestCombo'
    | 'failureEvidence'
  >;
  baseline: PersonalRunBaseline;
  skills: SkillProgress;
  challengeFloor?: number;
  daily?: boolean;
  achievementProgress?: AchievementProgress;
};
export type NextClimbGoal = {
  title: string;
  tip: string;
  progress: { label: string; value: number; target: number }[];
  note: string;
};
const count = (value: number) =>
  Number.isSafeInteger(value) && value >= 0 ? value : 0;

/** Read the real wardrobe catalog and personal bests; runs never add together. */
export function nextCosmeticReward(
  progress: AchievementProgress,
): string | null {
  const locked = COSMETICS.filter(
    (item) => count(progress[item.metric]) < item.target,
  ).sort(
    (a, b) =>
      count(progress[b.metric]) / b.target -
      count(progress[a.metric]) / a.target,
  );
  const item = locked[0];
  if (!item) return null;
  const best = count(progress[item.metric]);
  const requirement =
    item.metric === 'floor'
      ? `reach floor ${item.target}`
      : item.metric === 'score'
        ? `score ${item.target.toLocaleString('en-US')} in one run`
        : item.metric === 'stomps'
          ? `stomp ${item.target} bats in one run`
          : `land a ${item.target}× combo`;
  return `Next reward: ${item.name} · ${requirement} (best ${best.toLocaleString('en-US')}${item.metric === 'combo' ? '×' : ''}).`;
}

/** One reachable next step, using existing milestones rather than another save system. */
export function getNextClimb({
  snapshot: run,
  baseline,
  skills,
  challengeFloor,
  daily = false,
  achievementProgress,
}: NextClimbInput): NextClimbGoal | null {
  if (run.status !== 'over') return null;
  const floor = count(run.floor);
  const best = Math.max(
    floor,
    baseline.mode === run.mode ? count(baseline.floor) : 0,
  );
  const feedback = getRunFeedback(run)!;
  const tip =
    floor === 0 && !run.failureEvidence
      ? 'Hold a direction and tap jump. Steer toward the center of the first ledge.'
      : feedback.suggestion.replace(/^Next climb: /, '');
  const profile = advanceSkillProgress(skills, run);
  const reward =
    best >= 5 && achievementProgress
      ? nextCosmeticReward(achievementProgress)
      : null;
  const note =
    reward ??
    (daily
      ? 'Retry the same layout and learn each landing.'
      : profile.completed.length === 0
        ? 'First skill milestone: reach floor 5.'
        : `${profile.completed.length} skill milestone${profile.completed.length === 1 ? '' : 's'} earned · kept between climbs`);
  const floorGoal = (
    target: number,
    title = `Reach floor ${target}`,
  ): NextClimbGoal => ({
    title,
    tip: tip.charAt(0).toUpperCase() + tip.slice(1),
    progress: [{ label: 'This climb', value: Math.min(floor, target), target }],
    note,
  });

  // Early attempts get small steps before the persistent floor-5 milestone.
  if (best < 5) return floorGoal([1, 3, 5].find((target) => target > best)!);
  if (
    challengeFloor !== undefined &&
    Number.isSafeInteger(challengeFloor) &&
    challengeFloor >= 0 &&
    floor <= challengeFloor
  ) {
    return floorGoal(
      challengeFloor + 1,
      `Beat the challenge: floor ${challengeFloor + 1}`,
    );
  }

  // Honor the player's selected skill, advancing it if this run completed it.
  const featured = getFeaturedSkillGoal(profile, run);
  if (featured)
    return {
      title: featured.title,
      tip: featured.description,
      progress: featured.progress,
      note,
    };

  // A rough run should not demand an old, distant personal record immediately.
  const target = Math.min(best + 1, (Math.floor(floor / 5) + 1) * 5);
  return floorGoal(
    target,
    target > best
      ? `Set a new best: floor ${target}`
      : `Next checkpoint: floor ${target}`,
  );
}
