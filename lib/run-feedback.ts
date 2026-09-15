import type { FailureEvidence, GameStatus } from './tower-engine.ts';

export type FeedbackRun = { status: GameStatus; failureEvidence?: FailureEvidence | null };
export type FailureFeedback = { explanation: string; suggestion: string };

/** Missing evidence (including older saved runs) always receives a general tip. */
export function getRunFeedback(run: FeedbackRun): FailureFeedback | null {
  if (run.status !== 'over') return null;
  switch (run.failureEvidence?.kind) {
    case 'left-ledge':
      return {
        explanation: `You left the ledge on floor ${run.failureEvidence.floor} without jumping and fell into the frost.`,
        suggestion: 'Next climb: press jump before reaching the edge of the ledge.',
      };
    case 'frost-on-ledge':
      return {
        explanation: 'The frost reached your ledge.',
        suggestion: 'Next climb: move to a higher platform when the frost approaches.',
      };
    case 'fell':
      return {
        explanation: 'You fell into the frost.',
        suggestion: 'Next climb: aim for the center of a landing ledge and start steering toward it before you descend.',
      };
    default:
      return {
        explanation: 'The frost caught you.',
        suggestion: 'Next climb: keep a higher landing ledge in sight as the frost rises.',
      };
  }
}
