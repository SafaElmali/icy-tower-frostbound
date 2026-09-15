import { type Controls } from './tower-engine.ts';
import {
  DEFAULT_RACE_SETTINGS,
  type RaceBumpEvent,
  type RaceRecording,
  type RaceSettings,
  type RaceSlot,
} from './race-protocol.ts';
import { RaceSimulation, RACE_STEP } from './race-simulation.ts';

/** Fixed-step input recording starts on the shared clock and survives checkpoint recovery. */
export class RaceRunner {
  readonly simulation: RaceSimulation;
  recording: RaceRecording | null = null;
  started = false;
  private last: number | null = null;
  private accumulator = 0;
  readonly round: number;

  constructor(
    round: number,
    seed: number,
    settings: RaceSettings = DEFAULT_RACE_SETTINGS,
  ) {
    this.round = round;
    this.simulation = new RaceSimulation(seed, settings);
  }
  get engine() {
    return this.simulation.engine;
  }
  get frame() {
    return this.simulation.frame;
  }
  get pose() {
    return this.simulation.pose;
  }
  get respawning() {
    return this.simulation.respawning;
  }
  get checkpointFloor() {
    return this.simulation.checkpointFloor;
  }
  get protected() {
    return this.simulation.protected;
  }
  get finished() {
    return this.simulation.finished;
  }

  applyBumps(events: readonly RaceBumpEvent[], you: RaceSlot) {
    for (const event of events) {
      if (event.to === you) this.simulation.applyBump(event);
    }
  }

  /** Snapshot the current climb when the server ends the round for both players. */
  finish() {
    if (!this.recording) {
      this.simulation.finishTime();
      this.recording = this.simulation.getRecording();
      this.accumulator = 0;
    }
    return this.recording;
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
    // Brief frame stalls recover, while background tabs cannot replay minutes of held input.
    const deadline = startAt + this.simulation.settings.durationMs;
    this.accumulator +=
      Math.min(
        100,
        Math.max(0, Math.min(now, deadline) - Math.max(previous, startAt)),
      ) / 1000;
    while (this.accumulator + 1e-9 >= RACE_STEP && !this.simulation.finished) {
      this.accumulator -= RACE_STEP;
      this.simulation.step(controls);
    }
    if (now >= deadline || this.simulation.finished) this.finish();
  }
}

export { RaceRival } from './race-rival.ts';
