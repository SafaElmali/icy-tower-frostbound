import type {
  FallingIcicle,
  FrostBat,
  TowerActionState,
} from './tower-action.ts';
import type { GameEvent } from './tower-engine.ts';

const STEP = 1 / 120;
const REGION_HEIGHT = 5 * 2.35;
export const RACE_ICE_START_FRAME = 240;
export const RACE_ICE_PERIOD_FRAMES = 720;
export const RACE_ICE_WARNING_FRAMES = 132;
export const RACE_BAT_START_FRAME = 480;
export const RACE_BAT_PERIOD_FRAMES = 960;
export const RACE_BAT_WARNING_FRAMES = 102;

function hash(seed: number, region: number, cycle: number) {
  let value =
    seed ^ Math.imul(region + 1, 0x9e3779b1) ^ Math.imul(cycle + 1, 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  return (value ^ (value >>> 15)) >>> 0;
}

/**
 * Shared race weather, independent of the runner and of platform generation RNG.
 * Each five-floor region has ice aimed at floor 3 and a bat crossing at floor 5.
 * Ice starts at race second 2, every 6s, with 1.1s warning. Bats start at second 4,
 * every 8s, with .85s warning. Entering a region samples its existing wave, never
 * restarts it. At most four nearby regions (four of each hazard) are materialized.
 */
export function sampleRaceHazards(
  seed: number,
  frame: number,
  cameraY: number,
) {
  const icicles: FallingIcicle[] = [],
    bats: FrostBat[] = [];
  const firstRegion = Math.max(0, Math.floor((cameraY - 14) / REGION_HEIGHT));
  const lastRegion = Math.min(20, Math.floor((cameraY + 14) / REGION_HEIGHT));
  for (let region = firstRegion; region <= lastRegion; region++) {
    const baseY = region * REGION_HEIGHT;
    if (frame >= RACE_ICE_START_FRAME) {
      const cycle = Math.floor(
        (frame - RACE_ICE_START_FRAME) / RACE_ICE_PERIOD_FRAMES,
      );
      const age = (frame - RACE_ICE_START_FRAME) % RACE_ICE_PERIOD_FRAMES;
      const targetY = baseY + 3 * 2.35,
        spawnY = targetY + 7;
      const fallingFrames = Math.max(0, age - RACE_ICE_WARNING_FRAMES);
      const y =
        spawnY -
        5 * fallingFrames * STEP -
        (28 * STEP * STEP * fallingFrames * (fallingFrames + 1)) / 2;
      if (y > targetY - 12)
        icicles.push({
          id: cycle * 1000 + region * 2,
          x: ((hash(seed, region, cycle) % 10001) / 10000 - 0.5) * 9.6,
          y,
          spawnY,
          targetY,
          state: age < RACE_ICE_WARNING_FRAMES ? 'warning' : 'falling',
          warningTime: Math.max(0, RACE_ICE_WARNING_FRAMES - age) * STEP,
          vy:
            age < RACE_ICE_WARNING_FRAMES ? 0 : -5 - 28 * fallingFrames * STEP,
          nearMiss: false,
        });
    }
    if (frame >= RACE_BAT_START_FRAME) {
      const cycle = Math.floor(
        (frame - RACE_BAT_START_FRAME) / RACE_BAT_PERIOD_FRAMES,
      );
      const age = (frame - RACE_BAT_START_FRAME) % RACE_BAT_PERIOD_FRAMES;
      const phase = Math.max(0, age - RACE_BAT_WARNING_FRAMES) * STEP;
      const originX =
        (hash(seed ^ 0xa5a5a5a5, region, cycle) & 1 ? 1 : -1) * 7.1;
      const originY = baseY + 5 * 2.35 + 0.8;
      if (phase < 5.5)
        bats.push({
          id: cycle * 1000 + region * 2 + 1,
          originX,
          originY,
          phase,
          alive: true,
          x: originX - Math.sign(originX) * phase * 2.8,
          y: originY + Math.sin(phase * 3) * 0.28,
          warningTime: Math.max(0, RACE_BAT_WARNING_FRAMES - age) * STEP,
        });
    }
  }
  return { icicles, bats };
}

/** A runner's collisions consume only their own hazards; the course remains shared. */
export class RaceHazards {
  private consumed = new Map<number, number>();
  private dodged = new Map<number, number>();
  private frame = 0;

  consume(id: number) {
    this.consumed.set(id, this.frame + RACE_BAT_PERIOD_FRAMES);
  }

  advance(
    action: TowerActionState,
    seed: number,
    frame: number,
    cameraY: number,
    events: GameEvent[],
  ) {
    this.frame = frame;
    for (const ice of action.icicles) {
      if (ice.nearMiss) this.dodged.set(ice.id, frame + RACE_ICE_PERIOD_FRAMES);
    }
    for (const entries of [this.consumed, this.dodged]) {
      for (const [id, expires] of entries)
        if (expires < frame) entries.delete(id);
    }
    const hazards = sampleRaceHazards(seed, frame, cameraY);
    action.icicles = hazards.icicles.filter(
      (ice) => !this.consumed.has(ice.id),
    );
    action.bats = hazards.bats.filter((bat) => !this.consumed.has(bat.id));
    for (const ice of action.icicles) {
      ice.nearMiss = this.dodged.has(ice.id);
      if (ice.warningTime === RACE_ICE_WARNING_FRAMES * STEP)
        events.push({ type: 'icicle-warning', x: ice.x, y: ice.spawnY });
    }
    for (const bat of action.bats) {
      if (bat.warningTime === RACE_BAT_WARNING_FRAMES * STEP)
        events.push({
          type: 'bat-warning',
          x: Math.sign(bat.originX) * 5.5,
          y: bat.originY,
        });
    }
  }
}
