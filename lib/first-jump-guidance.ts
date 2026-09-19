import type { GuidanceProfile } from './climb-guidance';
import type { Controls, Platform, TowerEngine } from './tower-engine';

export type FirstJumpGuidance = {
  targetId: number;
  x: number;
  y: number;
  width: number;
  floor: number;
  direction: 'left' | 'right' | null;
  phase: 'move' | 'jump' | 'airborne' | 'release';
};
export type FirstJumpObservation = Pick<
  TowerEngine,
  | 'status'
  | 'time'
  | 'floor'
  | 'x'
  | 'y'
  | 'vx'
  | 'vy'
  | 'grounded'
  | 'standingId'
  | 'platforms'
>;

/** Capture once at run start so learning momentum mid-jump does not remove its landing cue. */
export const shouldStartFirstJumpGuidance = (
  profile: GuidanceProfile,
  bestFloor = 0,
) =>
  !profile.skipped &&
  (bestFloor < 3 || !profile.completed.includes('momentum'));

const safeTarget = (platform: Platform) =>
  !platform.moving &&
  !platform.spring &&
  !platform.crumble &&
  platform.route !== 'shortcut';

/** Presentation only: points at the next ordinary ledge, never changes the simulation. */
export function getFirstJumpGuidance(
  observation: FirstJumpObservation,
  controls: Controls,
  previous: FirstJumpGuidance | null,
  enabled: boolean,
): FirstJumpGuidance | null {
  if (
    !enabled ||
    observation.status !== 'playing' ||
    observation.time > 60 ||
    observation.floor >= 3
  )
    return null;
  const standing = observation.grounded
    ? observation.platforms.find(
        (platform) => platform.id === observation.standingId,
      )
    : undefined;
  // A target belongs to the whole jump, including descent. Selecting from the
  // player's current height would move the goal upward before their first landing.
  const target =
    !observation.grounded && previous
      ? observation.platforms.find(
          (platform) =>
            platform.id === previous.targetId && safeTarget(platform),
        )
      : standing &&
        observation.platforms
          .filter(
            (platform) =>
              safeTarget(platform) &&
              platform.y > standing.y + 0.01 &&
              platform.y - standing.y <= 2.36,
          )
          .sort(
            (a, b) =>
              a.y - b.y ||
              Math.abs(a.x - observation.x) - Math.abs(b.x - observation.x),
          )[0];
  if (!target) return null;
  if (!observation.grounded && observation.vy <= 0 && observation.y < target.y)
    return null;
  const difference = target.x - observation.x;
  // Aim inside the ledge, with space for the body and a little braking room.
  const aligned = Math.abs(difference) < Math.max(0.25, target.width / 2 - 0.7);
  const direction =
    !observation.grounded && aligned
      ? Math.abs(observation.vx) > 2
        ? observation.vx > 0
          ? 'left'
          : 'right'
        : null
      : difference < 0
        ? 'left'
        : 'right';
  const toward = direction === 'left' ? -1 : 1;
  const edgeRoom = standing
    ? standing.width / 2 - toward * (observation.x - standing.x)
    : 0;
  const phase = !observation.grounded
    ? 'airborne'
    : controls.jump
      ? 'release'
      : observation.vx * toward >= 2.6 || edgeRoom <= 0.7
        ? 'jump'
        : 'move';
  return {
    targetId: target.id,
    x: target.x,
    y: target.y,
    width: target.width,
    floor: target.floor ?? target.id,
    direction,
    phase,
  };
}

export function firstJumpInstruction(
  guidance: FirstJumpGuidance,
  touch: boolean,
): string {
  const jump = touch ? 'JUMP' : 'Space';
  if (guidance.phase === 'release') return `Release ${jump}, then tap again`;
  if (guidance.phase === 'airborne')
    return guidance.direction
      ? `Steer ${guidance.direction} to line up your landing`
      : 'Release the arrow and land on the marked ledge';
  if (guidance.phase === 'jump') return `Keep moving + tap ${jump} now`;
  return `Hold ${guidance.direction === 'left' ? '←' : '→'} to build speed`;
}
