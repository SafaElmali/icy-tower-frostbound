import type { FailureEvidence, GameStatus } from './tower-engine.ts';

export type FeedbackRun = { status: GameStatus; failureEvidence?: FailureEvidence | null };
export type FailureFeedback = { explanation: string; suggestion: string };

/** Missing evidence (including older saved runs) always receives a general tip. */
export function getRunFeedback(run: FeedbackRun): FailureFeedback | null {
  if (run.status !== 'over') return null;
  switch (run.failureEvidence?.kind) {
    case 'left-ledge':
      return {
        explanation: `You walked off floor ${run.failureEvidence.floor} without jumping.`,
        suggestion: 'Jump before the edge, then steer toward the next ledge.',
      };
    case 'frost-on-ledge':
      return {
        explanation: 'The frost reached your ledge.',
        suggestion: 'Jump to a higher ledge before the frost catches up.',
      };
    case 'fell':
      return {
        explanation: 'You fell into the frost.',
        suggestion: 'Steer toward the center of a ledge as you fall.',
      };
    default:
      return {
        explanation: 'The frost caught you.',
        suggestion: 'Keep a higher landing ledge in sight as the frost rises.',
      };
  }
}
