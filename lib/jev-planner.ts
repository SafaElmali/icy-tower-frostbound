import {
  freshControls,
  platformFloor,
  type Controls,
  type TowerEngine,
} from './tower-engine.ts';

const STEP = 1 / 60;
const round = (n: number) => Math.round(n * 100) / 100;
export type LandingPlan = {
  id: string;
  targetId: number;
  targetFloor: number;
  targetY: number;
  gain: number;
  seconds: number;
  landingMargin: number;
  direction: 'left' | 'right' | 'straight';
  moving: boolean;
  crumbling: boolean;
  hazards: number;
  collectsGem: boolean;
  kind: 'climb' | 'recover' | 'reposition';
};
export type InputPlan = { option: LandingPlan; frames: Controls[] };
export type JevObservation = {
  floor: number;
  currentFloor: number;
  phase: 'grounded' | 'rising' | 'falling';
  stalledFor: number;
  recent: { targetFloor: number; outcome: 'landed' | 'missed' }[];
  plans: LandingPlan[];
};
export type JevAction = string;
export const isPlanId = (value: unknown): value is string =>
  typeof value === 'string' && /^plan[0-5]$/.test(value);

const controls = (direction: number, jump = false): Controls => ({
  left: direction < 0,
  right: direction > 0,
  jump,
});

/** Enumerate button sequences in the real physics engine. Jev chooses a destination. */
export function planLandings(engine: TowerEngine): InputPlan[] {
  const standing = engine.platforms.find((p) => p.id === engine.standingId);
  const fromY = standing?.y ?? engine.y;
  const byTarget = new Map<number, InputPlan>();
  for (const direction of [-1, 0, 1]) {
    for (const delay of engine.grounded ? [0, 10, 20] : [0]) {
      for (const switchAt of [0, 9, 18, 27, 39, 54]) {
        for (const finish of [-1, 0, 1]) {
          if (finish === direction && switchAt !== 0) continue;
          const sim = engine.preview();
          const frames: Controls[] = [];
          let airborne = !sim.grounded;
          let landed = false;
          for (
            let frame = 0;
            frame < 100 && sim.status === 'playing';
            frame++
          ) {
            const input = controls(
              frame < delay + switchAt ? direction : finish,
              frame === delay,
            );
            sim.tick(STEP, input);
            frames.push(input);
            if (!sim.grounded) airborne = true;
            else if (airborne) {
              landed = true;
              break;
            }
          }
          if (!landed || sim.status !== 'playing') continue;
          const landing = sim.platforms.find((p) => p.id === sim.standingId);
          if (!landing || (engine.grounded && landing.y <= fromY + 0.1))
            continue;
          // Include braking after touchdown so waiting for the next choice is safe.
          for (
            let frame = 0;
            frame < 24 && Math.abs(sim.vx) > 0.4 && sim.grounded;
            frame++
          ) {
            const input = controls(-Math.sign(sim.vx));
            sim.tick(STEP, input);
            frames.push(input);
          }
          if (
            !sim.grounded ||
            sim.standingId !== landing.id ||
            sim.status !== 'playing'
          )
            continue;
          const margin = landing.width / 2 - Math.abs(sim.x - landing.x) - 0.28;
          if (margin < 0.15 || landing.crumble?.broken) continue;
          const targetFloor = platformFloor(landing);
          const option: LandingPlan = {
            id: '',
            targetId: landing.id,
            targetFloor,
            targetY: round(landing.y),
            gain:
              targetFloor -
              (standing
                ? platformFloor(standing)
                : Math.floor(engine.y / 2.35)),
            seconds: round(frames.length * STEP),
            landingMargin: round(margin),
            direction:
              landing.x < engine.x - 0.3
                ? 'left'
                : landing.x > engine.x + 0.3
                  ? 'right'
                  : 'straight',
            moving: landing.moving,
            crumbling: !!landing.crumble,
            hazards: Math.max(0, sim.action.hits - engine.action.hits),
            collectsGem: sim.gems > engine.gems,
            kind: landing.y > fromY + 0.1 ? 'climb' : 'recover',
          };
          const previous = byTarget.get(landing.id);
          const quality = (p: LandingPlan) =>
            p.landingMargin - p.hazards * 10 - p.seconds * 0.1;
          if (!previous || quality(option) > quality(previous.option))
            byTarget.set(landing.id, { option, frames });
        }
      }
    }
  }
  const plans = [...byTarget.values()]
    .sort((a, b) => b.option.targetY - a.option.targetY)
    .slice(0, 5);
  if (!plans.length && engine.grounded && standing) {
    // Offer short repositioning only when no simulated jump can land safely.
    for (const direction of [-1, 0, 1]) {
      const sim = engine.preview();
      const frames = Array.from({ length: 9 }, () => controls(direction));
      for (const input of frames) sim.tick(STEP, input);
      if (!sim.grounded || sim.status !== 'playing') continue;
      plans.push({
        option: {
          id: '',
          targetId: standing.id,
          targetFloor: platformFloor(standing),
          targetY: round(standing.y),
          gain: 0,
          seconds: 0.15,
          landingMargin: round(
            standing.width / 2 - Math.abs(sim.x - standing.x) - 0.28,
          ),
          direction:
            direction < 0 ? 'left' : direction > 0 ? 'right' : 'straight',
          moving: standing.moving,
          crumbling: !!standing.crumble,
          hazards: 0,
          collectsGem: false,
          kind: 'reposition',
        },
        frames,
      });
    }
  }
  return plans.map((plan, i) => ({
    ...plan,
    option: { ...plan.option, id: `plan${i}` },
  }));
}

export function observeTower(
  e: TowerEngine,
  plans = planLandings(e),
  recent: JevObservation['recent'] = [],
  stalledFor = 0,
): JevObservation {
  const standing = e.platforms.find((p) => p.id === e.standingId);
  return {
    floor: e.floor,
    currentFloor: standing ? platformFloor(standing) : Math.floor(e.y / 2.35),
    phase: e.grounded ? 'grounded' : e.vy > 0 ? 'rising' : 'falling',
    stalledFor: round(stalledFor),
    recent: recent.slice(-3),
    plans: plans.map((p) => p.option),
  };
}

export function coast(e: TowerEngine, seconds: number) {
  while (seconds > 1e-8 && e.status === 'playing') {
    const dt = Math.min(STEP, seconds);
    e.tick(dt, freshControls());
    seconds -= dt;
  }
}
