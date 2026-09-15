import { ClimberMotion } from './climber-motion.ts';
import {
  type Controls,
  type GameStatus,
  type RunReplay,
} from './tower-engine.ts';
import {
  createRaceEngine,
  RACE_DURATION_MS,
  RACE_TARGET,
  type RacePose,
} from './race-protocol.ts';

/** Fixed-step input recording starts on the shared clock and stops on the exact goal frame. */
export class RaceRunner {
  engine: ReturnType<typeof createRaceEngine>;
  recording: RunReplay | null = null;
  started = false;
  private last: number | null = null;
  private accumulator = 0;
  readonly round: number;
  constructor(round: number, seed: number) {
    this.round = round;
    this.engine = createRaceEngine(seed);
  }
  advance(
    now: number,
    startAt: number | null,
    controls: Controls,
    finished = false,
  ) {
    const previous = this.last ?? now;
    this.last = now;
    if (startAt === null || now < startAt || finished || this.recording) return;
    this.started = true;
    this.accumulator +=
      Math.min(100, Math.max(0, now - Math.max(previous, startAt))) / 1000;
    while (
      this.accumulator + 1e-9 >= 1 / 120 &&
      this.engine.time < RACE_DURATION_MS / 1000 - 1e-8
    ) {
      this.accumulator -= 1 / 120;
      this.engine.tick(1 / 120, controls);
      if (this.engine.status === 'over' || this.engine.floor >= RACE_TARGET)
        break;
    }
    if (
      this.engine.status === 'over' ||
      this.engine.floor >= RACE_TARGET ||
      now >= startAt + RACE_DURATION_MS ||
      this.engine.time >= RACE_DURATION_MS / 1000 - 1e-8
    ) {
      this.recording = this.engine.getRecording();
    }
  }
}

/** A visual rival never participates in the local player's collisions or scoring. */
export class RaceRival {
  engine = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    time: 0,
    facing: 1,
    grounded: true,
    status: 'playing' as GameStatus,
  };
  motion = new ClimberMotion();
  finished = true;
  private target: RacePose | null = null;
  private received = 0;
  receive(pose: RacePose | null, now: number, finished: boolean) {
    this.finished = finished || pose === null;
    if (!pose || pose.time === this.target?.time) return;
    if (this.target?.grounded && !pose.grounded)
      this.motion.jump(pose.vx, pose.time);
    if (!this.target) Object.assign(this.engine, pose);
    this.target = pose;
    this.received = now;
  }
  advance(now: number, dt: number) {
    if (!this.target || this.finished) return;
    const p = this.target,
      ahead = Math.min(0.15, Math.max(0, (now - this.received) / 1000));
    const mix = 1 - Math.exp(-14 * dt);
    this.engine.x +=
      (Math.max(-6.12, Math.min(6.12, p.x + p.vx * ahead)) - this.engine.x) *
      mix;
    this.engine.y +=
      (p.y +
        (p.grounded ? 0 : p.vy * ahead - 11.5 * ahead * ahead) -
        this.engine.y) *
      mix;
    this.engine.vx = p.vx;
    this.engine.vy = p.vy;
    this.engine.grounded = p.grounded;
    this.engine.facing = p.facing;
    this.engine.time = p.time + ahead;
  }
}
