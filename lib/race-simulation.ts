import { type Controls, type Platform, platformFloor } from './tower-engine.ts';
import {
  createRaceEngine,
  DEFAULT_RACE_SETTINGS,
  RACE_DURATIONS,
  RACE_RULES_VERSION,
  racePose,
  type RaceBumpEvent,
  type RaceRecording,
  type RaceSettings,
  type RaceSlot,
} from './race-protocol.ts';

export const RACE_STEP = 1 / 120;
export const RACE_RESPAWN_FRAMES = 108;
export const RACE_RESPAWN_PROTECTION_FRAMES = 192;
export const RACE_PUSH_PROTECTION_FRAMES = 132;
export const MAX_RACE_RECORDING_SEGMENTS = 12_000;

/** Shared client/server physics. Every wait and accepted push occupies the same input timeline. */
export class RaceSimulation {
  readonly engine: ReturnType<typeof createRaceEngine>;
  readonly settings: RaceSettings;
  frame = 0;
  finished: 'goal' | 'time' | null = null;
  checkpointFloor = 0;
  private checkpoint: Platform;
  private checkpointLedges: Platform[];
  private respawnRemaining = 0;
  private protectedUntil = 0;
  private moves: [number, number][] = [];
  private appliedBumps: { id: string; frame: number }[] = [];
  private bumpIds = new Set<string>();

  constructor(seed: number, settings: RaceSettings = DEFAULT_RACE_SETTINGS) {
    if (
      !Number.isInteger(seed) ||
      seed < 0 ||
      seed > 0xffff_ffff ||
      !Number.isInteger(settings.targetFloor) ||
      settings.targetFloor < 5 ||
      settings.targetFloor > 100 ||
      !RACE_DURATIONS.some((duration) => duration === settings.durationMs) ||
      typeof settings.bumping !== 'boolean'
    )
      throw new Error('Invalid race simulation settings.');
    this.settings = { ...settings };
    this.engine = createRaceEngine(seed);
    this.checkpoint = { ...this.engine.platforms[0] };
    this.checkpointLedges = this.engine.platforms.map((platform) => ({
      ...platform,
    }));
  }

  get respawning() {
    return this.respawnRemaining > 0;
  }
  get protected() {
    return this.respawning || this.frame < this.protectedUntil;
  }
  get pose() {
    return {
      ...racePose(this.engine),
      frame: this.frame,
      checkpointFloor: this.checkpointFloor,
      respawning: this.respawning,
      protected: this.protected,
    };
  }

  step(controls: Controls) {
    if (this.finished) return;
    const mask =
      Number(controls.left) |
      (Number(controls.right) << 1) |
      (Number(controls.jump) << 2);
    const last = this.moves[this.moves.length - 1];
    if (last?.[1] === mask) last[0]++;
    else this.moves.push([1, mask]);
    this.frame++;

    if (this.respawnRemaining > 0) {
      // A fallen climber keeps falling out of view during the short recovery cue.
      this.engine.vy -= 23 * RACE_STEP;
      this.engine.y += this.engine.vy * RACE_STEP;
      this.engine.time = this.frame * RACE_STEP;
      if (--this.respawnRemaining === 0) {
        this.engine.respawnRace(this.checkpoint, this.checkpointLedges);
        this.protectedUntil = this.frame + RACE_RESPAWN_PROTECTION_FRAMES;
      }
    } else {
      this.engine.tick(RACE_STEP, controls);
      this.engine.time = this.frame * RACE_STEP;
      this.saveCheckpoint();
      if (this.engine.floor >= this.settings.targetFloor) {
        this.engine.floor = this.settings.targetFloor;
        this.finished = 'goal';
        this.settle();
      } else if (this.engine.status === 'over') {
        this.respawnRemaining = RACE_RESPAWN_FRAMES;
      }
    }
    if (!this.finished && this.frame >= (this.settings.durationMs * 120) / 1000)
      this.finishTime();
  }

  private saveCheckpoint() {
    const floor =
      Math.floor(Math.min(this.engine.floor, this.settings.targetFloor) / 5) *
      5;
    if (floor <= this.checkpointFloor) return;
    const ledge = this.engine.platforms.find(
      (platform) => platform.id === floor,
    );
    if (!ledge) throw new Error('Missing race checkpoint.');
    this.checkpointFloor = floor;
    this.checkpoint = { ...ledge };
    this.checkpointLedges = this.engine.platforms
      .filter((platform) => platform.y >= ledge.y && platform.y <= ledge.y + 26)
      .map((platform) => ({ ...platform }));
  }

  /** Called only for server-issued events targeted to this runner. Repeated delivery is harmless. */
  applyBump(event: RaceBumpEvent) {
    if (this.finished || !this.settings.bumping || this.bumpIds.has(event.id))
      return false;
    if (event.direction !== -1 && event.direction !== 1)
      throw new Error('Invalid race push direction.');
    this.bumpIds.add(event.id);
    this.appliedBumps.push({ id: event.id, frame: this.frame });
    if (this.protected) return false;
    this.engine.applyRacePush(event.direction);
    this.protectedUntil = this.frame + RACE_PUSH_PROTECTION_FRAMES;
    return true;
  }

  /** Wall-clock expiry can happen before all elapsed time was rendered in a background tab. */
  finishTime() {
    if (this.finished) return;
    this.finished = 'time';
    this.respawnRemaining = 0;
    this.settle();
  }

  private settle() {
    const e = this.engine;
    const ledge =
      (e.grounded
        ? e.platforms.find((platform) => platform.id === e.standingId)
        : null) ??
      e.platforms
        .filter(
          (platform) => platform.y <= e.y && platformFloor(platform) <= e.floor,
        )
        .sort((a, b) => b.y - a.y)[0] ??
      this.checkpoint;
    if (!e.platforms.some((platform) => platform.id === ledge.id))
      e.platforms.push({ ...ledge });
    e.status = 'playing';
    e.settleRace(ledge);
    e.cameraY = Math.max(5.2, ledge.y + 2.2);
    e.stormY = Math.min(e.stormY, ledge.y - 8);
  }

  getRecording(): RaceRecording {
    return {
      version: 1,
      rulesVersion: RACE_RULES_VERSION,
      seed: this.engine.seed,
      moves: this.moves.map(([frames, mask]) => [frames, mask]),
      bumps: this.appliedBumps.map((event) => ({ ...event })),
    };
  }
}

/** Reject malformed or forged inputs before replaying them, then use the exact client simulation. */
export function replayRaceRecording(
  recording: RaceRecording,
  settings: RaceSettings,
  events: readonly RaceBumpEvent[],
  slot?: RaceSlot,
) {
  if (
    !recording ||
    recording.version !== 1 ||
    recording.rulesVersion !== RACE_RULES_VERSION ||
    !Array.isArray(recording.moves) ||
    recording.moves.length > MAX_RACE_RECORDING_SEGMENTS ||
    !Array.isArray(recording.bumps) ||
    recording.bumps.length > 400
  )
    throw new Error('Invalid race recording.');
  const simulation = new RaceSimulation(recording.seed, settings);
  let frames = 0;
  for (const move of recording.moves) {
    if (
      !Array.isArray(move) ||
      move.length !== 2 ||
      !Number.isInteger(move[0]) ||
      move[0] < 1 ||
      !Number.isInteger(move[1]) ||
      move[1] < 0 ||
      move[1] > 7
    )
      throw new Error('Invalid race controls.');
    frames += move[0];
    if (frames > (settings.durationMs * 120) / 1000)
      throw new Error('Race recording exceeds its time limit.');
  }
  const approved = new Map(events.map((event) => [event.id, event]));
  const appliedIds = new Set<string>();
  let priorFrame = -1;
  for (const bump of recording.bumps) {
    const event = bump && approved.get(bump.id);
    if (
      !bump ||
      !event ||
      (slot && event.to !== slot) ||
      appliedIds.has(bump.id) ||
      !settings.bumping ||
      !Number.isInteger(bump.frame) ||
      bump.frame < 0 ||
      bump.frame > frames ||
      bump.frame < priorFrame
    )
      throw new Error('Invalid race push recording.');
    if (
      !Number.isInteger(event.targetFrame) ||
      event.targetFrame < 0 ||
      bump.frame < event.targetFrame
    )
      throw new Error('Race push was recorded before it was issued.');
    priorFrame = bump.frame;
    appliedIds.add(bump.id);
  }
  let nextBump = 0;
  const applyAtFrame = () => {
    while (recording.bumps[nextBump]?.frame === simulation.frame) {
      if (simulation.finished)
        throw new Error('Race push was recorded after finishing.');
      simulation.applyBump(approved.get(recording.bumps[nextBump++].id)!);
    }
  };
  for (const [count, mask] of recording.moves) {
    const controls = {
      left: (mask & 1) !== 0,
      right: (mask & 2) !== 0,
      jump: (mask & 4) !== 0,
    };
    for (let frame = 0; frame < count; frame++) {
      if (simulation.finished)
        throw new Error('Race controls were recorded after finishing.');
      applyAtFrame();
      simulation.step(controls);
    }
  }
  applyAtFrame();
  return simulation;
}
