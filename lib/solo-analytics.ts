import type { TowerEngine } from './tower-engine.ts';

type Properties = Record<string, string | number | boolean | null | undefined>;
type Capture = (event: string, properties: Properties) => void;

/** Per-run terminal guard; never emits from simulation or replay verification. */
export class SoloAnalytics {
  private run: {
    id: string;
    properties: Properties;
    started: number;
    terminal: boolean;
    paused: number | null;
  } | null = null;
  private ordinal = 0;
  private resolved = new Set<string>();
  private capture: Capture;
  private id: () => string;
  private now: () => number;
  constructor(capture: Capture, id: () => string, now = () => Date.now()) {
    this.capture = capture;
    this.id = id;
    this.now = now;
  }
  get runId() {
    return this.run?.id ?? null;
  }
  event(name: string, properties: Properties = {}) {
    this.capture(name, {
      surface: 'solo',
      ...this.run?.properties,
      run_id: this.run?.id,
      ...properties,
    });
  }
  start(engine: TowerEngine, properties: Properties) {
    const previous = this.run?.id ?? null;
    this.run = {
      id: this.id(),
      started: this.now(),
      terminal: false,
      paused: null,
      properties: {
        mode: engine.mode,
        rules_version: engine.rulesVersion,
        feature_version: 'tower-action-v1',
        visit_run_ordinal: ++this.ordinal,
        previous_run_id: previous,
        ...properties,
      },
    };
    this.resolved.clear();
    this.event('run_started');
  }
  summary(engine: TowerEngine): Properties {
    const challenges = engine.snapshot().challenges;
    return {
      quick_challenges_completed: challenges.filter(
        (challenge) => challenge.status === 'complete',
      ).length,
      quick_challenges_failed: challenges.filter(
        (challenge) => challenge.status === 'failed',
      ).length,
      quick_challenges_missed: challenges.filter(
        (challenge) => challenge.status === 'missed',
      ).length,
      floor: engine.floor,
      score: engine.score,
      best_combo: engine.bestCombo,
      gems: engine.gems,
      wall_rebounds: engine.wallJumps,
      active_duration_s: engine.time,
      elapsed_duration_s: this.run
        ? Math.max(0, this.now() - this.run.started) / 1000
        : 0,
      failure_kind: engine.failureEvidence?.kind ?? null,
      hits: engine.action.hits,
      dodges: engine.action.dodges,
      stomps: engine.action.stomps,
      frenzies: engine.action.frenzies,
    };
  }
  terminal(
    engine: TowerEngine,
    outcome: 'finished' | 'abandoned',
    properties: Properties = {},
  ) {
    if (!this.run || this.run.terminal) return false;
    this.run.terminal = true;
    this.event(`run_${outcome}`, { ...this.summary(engine), ...properties });
    return true;
  }
  pause(engine: TowerEngine, reason: string) {
    if (!this.run || this.run.terminal) return;
    if (engine.status === 'paused' && this.run.paused === null) {
      this.run.paused = this.now();
      this.event('run_paused', {
        reason,
        active_duration_s: engine.time,
        floor: engine.floor,
      });
    } else if (engine.status === 'playing' && this.run.paused !== null) {
      const duration = Math.max(0, this.now() - this.run.paused) / 1000;
      this.run.paused = null;
      this.event('run_resumed', {
        reason,
        pause_duration_s: duration,
        active_duration_s: engine.time,
        floor: engine.floor,
      });
    }
  }
  progress(engine: TowerEngine) {
    if (!this.run || this.run.terminal) return;
    for (const floor of [5, 10, 25, 50, 100, 200]) {
      const key = `floor:${floor}`;
      if (engine.floor >= floor && !this.resolved.has(key)) {
        this.resolved.add(key);
        this.event('floor_milestone_reached', {
          milestone: floor,
          active_duration_s: engine.time,
        });
      }
    }
    for (const challenge of engine.snapshot().challenges) {
      if (challenge.status === 'active' || this.resolved.has(challenge.id))
        continue;
      this.resolved.add(challenge.id);
      this.event('quick_challenge_resolved', {
        challenge_id: challenge.id,
        outcome: challenge.status,
        floor: engine.floor,
      });
    }
  }
}
