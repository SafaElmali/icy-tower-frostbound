import { ClimberMotion } from './climber-motion.ts';
import { MAX_REPLAY_FRAMES, MAX_REPLAY_SEGMENTS, TowerEngine, type RunReplay, type GameMode } from './tower-engine.ts';

export const GHOST_STORAGE_KEY = 'frostbound-ghost-v1';
export type GhostRecord = { floor: number; score: number; time: number; replay: RunReplay };

/** Highest completed arcade climb wins; score, then duration, break floor ties. */
export function bestGhost(current: GhostRecord | null, engine: TowerEngine): GhostRecord | null {
  const replay = engine.getReplay();
  if (!replay || engine.mode !== 'arcade' || (replay.version !== 2 && replay.version !== 3)) return current;
  if (current && (engine.floor < current.floor || (engine.floor === current.floor &&
    (engine.score < current.score || (engine.score === current.score && engine.time >= current.time))))) return current;
  return { floor: engine.floor, score: engine.score, time: engine.time, replay };
}

/** Browser storage is optional and untrusted. Reject incompatible or unbounded recordings. */
export function readGhost(raw: string | null): GhostRecord | null {
  if (!raw || raw.length > 300_000) return null;
  try {
    const record = JSON.parse(raw) as GhostRecord;
    if (!record || !Number.isSafeInteger(record.floor) || record.floor < 1 ||
      !Number.isSafeInteger(record.score) || record.score < 0 || !Number.isFinite(record.time) ||
      record.time <= 0 || record.time > MAX_REPLAY_FRAMES / 120 + .001) return null;
    const replay = record.replay;
    if (!replay || (replay.version !== 2 && replay.version !== 3) || (replay.version === 3 && replay.mode !== 'arcade') || !Number.isInteger(replay.seed) || replay.seed < 0 ||
      replay.seed > 0xffffffff || !Array.isArray(replay.moves) || !replay.moves.length ||
      replay.moves.length > MAX_REPLAY_SEGMENTS) return null;
    let total = 0;
    for (const move of replay.moves) {
      if (!Array.isArray(move) || move.length !== 2) return null;
      const [frames, mask] = move;
      if (!Number.isInteger(frames) || !Number.isInteger(mask) || mask < 0 || mask > 8 ||
        (mask === 8 ? frames !== 0 : frames < 1)) return null;
      total += frames;
      if (total > MAX_REPLAY_FRAMES) return null;
    }
    if (!total || Math.abs(total / 120 - record.time) > .001) return null;
    return record;
  } catch { return null; }
}

/** Runs in its own world, locked to the live simulation clock (including pauses). */
export class TowerGhost {
  readonly engine: TowerEngine;
  readonly record: GhostRecord;
  readonly motion = new ClimberMotion();
  private segment = 0;
  private frameInSegment = 0;
  private frames = 0;

  constructor(record: GhostRecord) {
    this.record = record;
    this.engine = new TowerEngine(record.replay.seed, false, record.replay.version);
    this.engine.start('arcade');
  }

  get finished() { return this.engine.status === 'over' || this.segment >= this.record.replay.moves.length; }

  advanceTo(time: number) {
    const target = Math.round(time * 120);
    while (this.frames < target && !this.finished) {
      const [length, mask] = this.record.replay.moves[this.segment];
      if (mask === 8) {
        // Recorded pauses consume no race time, but reset jump buffering.
        this.engine.togglePause(); this.engine.togglePause(); this.segment++; continue;
      }
      this.engine.tick(1 / 120, { left: !!(mask & 1), right: !!(mask & 2), jump: !!(mask & 4) });
      for (const event of this.engine.drainEvents()) {
        if (event.type === 'jump') this.motion.jump(event.value ?? 0, this.engine.time);
      }
      // Clear landed spins even when several simulation steps share a render frame.
      this.motion.pose(this.engine);
      this.frames++;
      if (++this.frameInSegment === length) { this.segment++; this.frameInSegment = 0; }
    }
  }

  snapshot(player: TowerEngine) {
    return { floor: this.record.floor, finished: this.finished, lead: Math.round((player.y - this.engine.y) * 3), beaten: player.floor > this.record.floor };
  }
}

/** Choose the rematch layout once when a run starts. */
export function startGhostRun(engine: TowerEngine, best: GhostRecord | null, mode: GameMode) {
  const ghost = mode === 'arcade' && best ? new TowerGhost(best) : null;
  engine.start(mode, ghost?.record.replay.seed ?? Math.floor(Math.random() * 2 ** 30));
  return ghost;
}
