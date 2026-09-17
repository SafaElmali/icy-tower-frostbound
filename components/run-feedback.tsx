import { getRunFeedback, type FeedbackRun } from '@/lib/run-feedback';
import styles from './run-feedback.module.css';

export function RunFeedback({
  snapshot,
  compact = false,
}: {
  snapshot: FeedbackRun;
  compact?: boolean;
}) {
  const feedback = getRunFeedback(snapshot);
  if (!feedback) return null;
  if (compact)
    return (
      <p className={styles.compact} aria-label="Tip for your next climb">
        {feedback.suggestion}
      </p>
    );
  return (
    <section className={styles.feedback} aria-label="Climb feedback">
      <p className={styles.explanation}>{feedback.explanation}</p>
      <p className={styles.suggestion}>{feedback.suggestion}</p>
    </section>
  );
}
