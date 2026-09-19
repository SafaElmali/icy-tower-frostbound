import {
  parseJevDecision,
  type JevDecision,
  type JevDebugRecord,
  type JevLiveState,
} from './jev-debug.ts';
import { freshControls, type TowerEngine } from './tower-engine.ts';
import {
  coast,
  observeTower,
  planLandings,
  type InputPlan,
  type JevObservation,
  type LandingPlan,
} from './jev-planner.ts';
export { observeTower, type JevObservation } from './jev-planner.ts';
export type JevAction = string;
export const JEV_API = '/.netlify/functions/jev';
export const DECISION_INTERVAL = 0.4;
export const MAX_DECISION_AGE = 2;
const STEP = 1 / 60;
const PREFETCH_SECONDS = 0.6;

export async function requestJevAction(
  state: JevObservation,
  signal: AbortSignal,
): Promise<JevDecision> {
  const response = await fetch(JEV_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
    signal,
  });
  if (!response.ok)
    throw new Error(
      response.status === 503
        ? 'Jev is not configured. Add TYPESAFE_API_KEY on the server.'
        : response.status === 429
          ? 'Jev reached its request limit. Try again shortly.'
          : 'Jev could not decide. Start a new AI run to retry.',
    );
  const result = parseJevDecision(await response.json(), state);
  if (!result) throw new Error('Jev returned an invalid plan.');
  return result;
}

/** Jev owns destination choices; exact simulated button sequences execute at frame rate. */
export class JevPlayer {
  private controller = new AbortController();
  private pending = false;
  private nextDecisionAt = 0;
  private active: InputPlan | null = null;
  private frameIndex = 0;
  private frameRemaining = STEP;
  private queued: LandingPlan | null = null;
  private recent: JevObservation['recent'] = [];
  private bestFloor = 0;
  private lastProgressAt = 0;
  private decisions = 0;
  private stopped = false;
  private epoch = 0;
  private paused = false;
  private trace: JevDebugRecord[] = [];
  private activeRecord: number | null = null;
  private queuedRecord: number | null = null;
  private appliedControls = freshControls();
  private jumpDisplayUntil = 0;
  private inspect: (records: JevDebugRecord[]) => void;
  private decide: (
    state: JevObservation,
    signal: AbortSignal,
  ) => Promise<JevAction | JevDecision>;
  private report: (message: string) => void;
  constructor(
    decide: (
      state: JevObservation,
      signal: AbortSignal,
    ) => Promise<JevAction | JevDecision> = requestJevAction,
    report: (message: string) => void = () => {},
    inspect: (records: JevDebugRecord[]) => void = () => {},
  ) {
    this.decide = decide;
    this.report = report;
    this.inspect = inspect;
  }
  private updateRecord(id: number | null, patch: Partial<JevDebugRecord>) {
    if (id === null) return;
    this.trace = this.trace.map((record) =>
      record.id === id ? { ...record, ...patch } : record,
    );
    this.inspect(this.trace);
  }
  get finished() {
    return this.stopped;
  }
  liveState(e: TowerEngine): JevLiveState {
    return {
      controls:
        e.status === 'playing' && !this.stopped
          ? { ...this.appliedControls, jump: e.time < this.jumpDisplayUntil }
          : freshControls(),
      phase: e.grounded ? 'grounded' : e.vy > 0 ? 'rising' : 'falling',
      x: e.x,
      y: e.y,
      vx: e.vx,
      vy: e.vy,
      targetFloor: this.active?.option.targetFloor ?? null,
    };
  }
  stop() {
    this.stopped = true;
    this.controller.abort();
    this.trace = this.trace.map((record) =>
      ['pending', 'queued', 'executing'].includes(record.status)
        ? {
            ...record,
            status: 'stopped' as const,
            detail: 'AI player stopped.',
          }
        : record,
    );
    this.inspect(this.trace);
  }

  private finishPlan(e: TowerEngine) {
    if (!this.active) return;
    this.recent = [
      ...this.recent.slice(-2),
      {
        targetFloor: this.active.option.targetFloor,
        outcome:
          e.grounded && e.standingId === this.active.option.targetId
            ? ('landed' as const)
            : ('missed' as const),
      },
    ];
    this.updateRecord(this.activeRecord, {
      status: this.recent[this.recent.length - 1].outcome,
      detail:
        e.grounded && e.standingId === this.active.option.targetId
          ? `Landed on floor ${this.active.option.targetFloor}.`
          : 'The actual landing differed from the chosen target.',
    });
    this.activeRecord = null;
    this.active = null;
  }

  tick(e: TowerEngine, dt: number) {
    if (this.stopped) return;
    if (e.status !== 'playing') {
      if (!this.paused) {
        this.epoch++;
        this.updateRecord(this.queuedRecord, {
          status: 'discarded',
          detail: 'Queued plan cleared when play paused or ended.',
        });
        this.queued = null;
        this.queuedRecord = null;
        if (e.status === 'over')
          this.updateRecord(this.activeRecord, {
            status: 'missed',
            detail: 'Run ended before the plan completed.',
          });
      }
      this.paused = true;
      return;
    }
    this.paused = false;
    if (!this.active && this.queued) {
      const target = this.queued;
      const targetRecord = this.queuedRecord;
      this.queued = null;
      this.queuedRecord = null;
      // Recalculate timing from the live position. Never substitute a different destination.
      const fresh = planLandings(e).find(
        (p) =>
          p.option.targetId === target.targetId &&
          p.option.kind === target.kind &&
          (target.kind !== 'reposition' ||
            p.option.direction === target.direction),
      );
      if (fresh) {
        this.active = fresh;
        this.activeRecord = targetRecord;
        this.updateRecord(targetRecord, {
          status: 'executing',
          detail: `Executing verified inputs toward floor ${fresh.option.targetFloor}.`,
        });
        this.frameIndex = 0;
        this.frameRemaining = STEP;
        this.report(
          `Jev → floor ${fresh.option.targetFloor} · ${fresh.option.kind} · ${this.decisions} choices`,
        );
      } else {
        this.recent = [
          ...this.recent.slice(-2),
          { targetFloor: target.targetFloor, outcome: 'missed' },
        ];
        this.updateRecord(targetRecord, {
          status: 'discarded',
          detail:
            'The selected destination was no longer reachable from the live position.',
        });
        this.report('Jev · landing changed, choosing a new route');
      }
    }
    let remaining = Math.min(Math.max(dt, 0), 0.1);
    while (remaining > 1e-8 && e.status === 'playing') {
      if (!this.active) {
        this.appliedControls = freshControls();
        coast(e, remaining);
        break;
      }
      const step = Math.min(remaining, this.frameRemaining);
      this.appliedControls =
        this.active.frames[this.frameIndex] ?? freshControls();
      // Keep a one-frame jump press visible between slower UI updates.
      if (this.appliedControls.jump) this.jumpDisplayUntil = e.time + 0.15;
      e.tick(step, this.appliedControls);
      remaining -= step;
      this.frameRemaining -= step;
      if (this.frameRemaining < 1e-8) {
        this.frameIndex++;
        this.frameRemaining = STEP;
      }
      if (this.frameIndex >= this.active.frames.length) this.finishPlan(e);
    }
    if (e.floor > this.bestFloor) {
      this.bestFloor = e.floor;
      this.lastProgressAt = e.time;
    }
    if (
      e.status !== 'playing' ||
      this.pending ||
      this.queued ||
      e.time < this.nextDecisionAt
    )
      return;
    const remainingPlan = this.active
      ? (this.active.frames.length - this.frameIndex - 1) * STEP +
        this.frameRemaining
      : 0;
    if (remainingPlan > PREFETCH_SECONDS) return;
    if (this.decisions >= 240) {
      if (this.active) return;
      this.stop();
      e.togglePause();
      this.report(
        'AI session complete · 240 choices. Start another run from Menu.',
      );
      return;
    }
    // Ask during the end of the current jump using its forecast landing state.
    const planningStarted = performance.now();
    const forecast = e.preview();
    if (this.active) {
      forecast.tick(this.frameRemaining, this.active.frames[this.frameIndex]);
      for (let i = this.frameIndex + 1; i < this.active.frames.length; i++)
        forecast.tick(STEP, this.active.frames[i]);
    }
    const options = planLandings(forecast);
    this.nextDecisionAt = e.time + DECISION_INTERVAL;
    if (!options.length) {
      this.report('Jev · looking for a recoverable landing');
      return;
    }
    const observed = observeTower(
      forecast,
      options,
      this.recent,
      e.time - this.lastProgressAt,
    );
    const observedAt = e.time;
    const epoch = this.epoch;
    const recordId = this.decisions + 1;
    this.trace = [
      ...this.trace.slice(-29),
      {
        id: recordId,
        gameTime: observedAt,
        forecastAhead: remainingPlan,
        planningMs: performance.now() - planningStarted,
        responseMs: null,
        state: observed,
        decision: null,
        status: 'pending',
        detail: this.active
          ? 'Choosing from a forecast landing state.'
          : 'Choosing from the current game state.',
      },
    ];
    this.inspect(this.trace);
    const requestedAt = performance.now();
    this.pending = true;
    this.report(
      `Jev · planning ${this.active ? 'the next jump' : 'a route'} · ${this.decisions} choices`,
    );
    void this.decide(
      observed,
      AbortSignal.any([this.controller.signal, AbortSignal.timeout(10000)]),
    )
      .then((result) => {
        if (this.stopped) return;
        this.decisions++;
        const decision = parseJevDecision(
          typeof result === 'string' ? { action: result } : result,
          observed,
        );
        this.updateRecord(recordId, {
          responseMs: performance.now() - requestedAt,
          decision,
        });
        if (
          e.status !== 'playing' ||
          epoch !== this.epoch ||
          e.time - observedAt > MAX_DECISION_AGE
        ) {
          this.updateRecord(recordId, {
            status: 'discarded',
            detail:
              e.status !== 'playing' || epoch !== this.epoch
                ? 'Play paused, ended, or resumed while the request was in flight.'
                : 'Response exceeded the two-second age limit.',
          });
          return;
        }
        const selected = options.find((p) => p.option.id === decision?.action);
        if (!selected) throw new Error('Jev returned an invalid plan.');
        this.queued = selected.option;
        this.queuedRecord = recordId;
        this.updateRecord(recordId, {
          status: 'queued',
          detail: `Jev selected floor ${selected.option.targetFloor}; awaiting live feasibility check.`,
        });
      })
      .catch((error) => {
        if (this.stopped) return;
        this.updateRecord(recordId, {
          responseMs: performance.now() - requestedAt,
          status: 'error',
          detail: 'Decision request failed; the AI run paused.',
        });
        this.stop();
        if (e.status === 'playing') e.togglePause();
        this.report(
          error instanceof Error && error.name !== 'TimeoutError'
            ? error.message
            : 'Jev timed out. Start a new AI run to retry.',
        );
      })
      .finally(() => {
        this.pending = false;
      });
  }
}
