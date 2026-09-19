import { isPlanId, type JevObservation } from './jev-planner.ts';
import type { Controls } from './tower-engine.ts';

export type JevLiveState = {
  controls: Controls;
  phase: JevObservation['phase'];
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetFloor: number | null;
};

export type JevDecision = {
  action: string;
  model: string | null;
  confidence: number | null;
  probabilities: Record<string, number>;
};
export type JevDebugRecord = {
  id: number;
  gameTime: number;
  forecastAhead: number;
  planningMs: number;
  responseMs: number | null;
  state: JevObservation;
  decision: JevDecision | null;
  status:
    | 'pending'
    | 'queued'
    | 'executing'
    | 'landed'
    | 'missed'
    | 'discarded'
    | 'error'
    | 'stopped';
  detail: string;
};

const probability = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
/** Keep only offered plan probabilities and bounded metadata, never an upstream error or credential. */
export function parseJevDecision(
  value: unknown,
  state: JevObservation,
): JevDecision | null {
  if (!value || typeof value !== 'object') return null;
  const result = value as Record<string, unknown>;
  if (
    !isPlanId(result.action) ||
    !state.plans.some((p) => p.id === result.action)
  )
    return null;
  const raw =
    result.probabilities && typeof result.probabilities === 'object'
      ? (result.probabilities as Record<string, unknown>)
      : {};
  const entries = state.plans.map((p) => [p.id, raw[p.id]] as const);
  const complete = entries.every(([, v]) => probability(v));
  const total = complete
    ? entries.reduce((sum, [, v]) => sum + (v as number), 0)
    : 0;
  return {
    action: result.action,
    model:
      typeof result.model === 'string' && result.model.length <= 80
        ? result.model
        : null,
    confidence: probability(result.confidence) ? result.confidence : null,
    probabilities:
      complete && Math.abs(total - 1) <= 0.02
        ? (Object.fromEntries(entries) as Record<string, number>)
        : {},
  };
}
