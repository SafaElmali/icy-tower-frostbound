import { parseJevDecision } from './jev-debug.ts';
import {
  isPlanId,
  type JevObservation,
  type LandingPlan,
} from './jev-planner.ts';

const finite = (v: unknown, bound = 100000) =>
  typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= bound;
export function validObservation(v: unknown): v is JevObservation {
  if (!v || typeof v !== 'object') return false;
  const s = v as JevObservation;
  return (
    finite(s.floor) &&
    finite(s.currentFloor) &&
    finite(s.stalledFor) &&
    s.stalledFor >= 0 &&
    ['grounded', 'rising', 'falling'].includes(s.phase) &&
    Array.isArray(s.recent) &&
    s.recent.length <= 3 &&
    s.recent.every(
      (r) =>
        r && finite(r.targetFloor) && ['landed', 'missed'].includes(r.outcome),
    ) &&
    Array.isArray(s.plans) &&
    s.plans.length > 0 &&
    s.plans.length <= 6 &&
    new Set(s.plans.map((p) => p?.id)).size === s.plans.length &&
    s.plans.every(
      (p) =>
        p &&
        isPlanId(p.id) &&
        finite(p.targetId) &&
        finite(p.targetFloor) &&
        finite(p.targetY) &&
        finite(p.gain) &&
        finite(p.seconds, 3) &&
        p.seconds > 0 &&
        finite(p.landingMargin, 20) &&
        ['left', 'right', 'straight'].includes(p.direction) &&
        ['climb', 'recover', 'reposition'].includes(p.kind) &&
        typeof p.moving === 'boolean' &&
        typeof p.crumbling === 'boolean' &&
        typeof p.collectsGem === 'boolean' &&
        finite(p.hazards, 100),
    )
  );
}
const projectPlan = (p: LandingPlan): LandingPlan => ({
  id: p.id,
  targetId: p.targetId,
  targetFloor: p.targetFloor,
  targetY: p.targetY,
  gain: p.gain,
  seconds: p.seconds,
  landingMargin: p.landingMargin,
  direction: p.direction,
  moving: p.moving,
  crumbling: p.crumbling,
  hazards: p.hazards,
  collectsGem: p.collectsGem,
  kind: p.kind,
});
export function createJevHandler(
  key: () => string | undefined,
  upstream: typeof fetch = fetch,
) {
  return async (request: Request): Promise<Response> => {
    const json = (value: unknown, status = 200) =>
      Response.json(value, {
        status,
        headers: { 'Cache-Control': 'no-store' },
      });
    if (request.method !== 'POST')
      return json({ error: 'Method not allowed' }, 405);
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin)
      return json({ error: 'Origin rejected' }, 403);
    // Bound streamed input as well as Content-Length before parsing or inference.
    const reader = request.body?.getReader();
    if (!reader) return json({ error: 'Missing state' }, 400);
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 4096) {
        await reader.cancel();
        return json({ error: 'State too large' }, 413);
      }
      chunks.push(value);
    }
    let state: JevObservation;
    try {
      const buffer = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) {
        buffer.set(chunk, offset);
        offset += chunk.length;
      }
      const value: unknown = JSON.parse(new TextDecoder().decode(buffer));
      if (!validObservation(value))
        return json({ error: 'Invalid state' }, 400);
      // Project the fields so arbitrary client text never becomes instructions.
      state = {
        floor: value.floor,
        currentFloor: value.currentFloor,
        phase: value.phase,
        stalledFor: value.stalledFor,
        recent: value.recent.map((r) => ({
          targetFloor: r.targetFloor,
          outcome: r.outcome,
        })),
        plans: value.plans.map(projectPlan),
      };
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }
    const apiKey = key();
    if (!apiKey) return json({ error: 'Jev not configured' }, 503);
    try {
      const response = await upstream('https://api.typesafe.ai/v1/systemone', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(8000)]),
        body: JSON.stringify({
          model: 'jev-latest',
          state,
          questions: {
            move: {
              type: 'choice',
              instructions: [
                'Choose one landing plan for the Icy Tower climber. Goal: climb as high as possible while staying alive.',
                'Each candidate was simulated using the real physics engine, including takeoff, air steering, and braking on touchdown. You select the destination; the game executes its timed buttons and rechecks feasibility from the live position.',
                'Prefer a higher safe landing with generous landingMargin and no predicted hazard hits. Compare floor gain against duration; a well-supported two-floor jump is useful. Narrow, moving, or crumbling ledges are riskier, especially with recent misses.',
                'When stalled, avoid repeatedly choosing a recently missed target if another climbing route exists. Recover onto a lower platform when no safe climb exists. Reposition only when there is no climb or recovery candidate.',
                'If phase is grounded, this may be the forecast end of a jump still playing. Candidate seconds includes the full jump and braking time. Positive landingMargin is spare horizontal space after stopping.',
              ],
              criteria: Object.fromEntries(
                state.plans.map((p) => [
                  p.id,
                  `${p.kind} to floor ${p.targetFloor}; gain ${p.gain}; ${p.seconds}s; landing clearance ${p.landingMargin}; predicted hits ${p.hazards}; ${p.crumbling ? 'crumbling' : 'solid'}; ${p.moving ? 'moving' : 'stationary'}; ${p.collectsGem ? 'collects crystal' : 'no crystal'}.`,
                ]),
              ),
            },
          },
        }),
      });
      if (!response.ok)
        return json(
          { error: 'Jev unavailable' },
          response.status === 429 ? 429 : 502,
        );
      const result = (await response.json()) as {
        model?: unknown;
        answers?: {
          move?: {
            type?: unknown;
            choice?: unknown;
            confidence?: unknown;
            probabilities?: unknown;
          };
        };
      };
      const answer = result?.answers?.move;
      if (
        answer?.type !== 'choice' ||
        !isPlanId(answer.choice) ||
        !state.plans.some((p) => p.id === answer.choice)
      )
        return json({ error: 'Invalid Jev answer' }, 502);
      return json(
        parseJevDecision(
          {
            action: answer.choice,
            model: result.model,
            confidence: answer.confidence,
            probabilities: answer.probabilities,
          },
          state,
        ),
      );
    } catch {
      return json({ error: 'Jev unavailable' }, 502);
    }
  };
}
