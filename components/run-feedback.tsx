import { getRunFeedback, type FeedbackRun } from '@/lib/run-feedback';
import styles from './run-feedback.module.css';

export function RunFeedback({
  snapshot,
  compact = false,
  nextGoal,
}: {
  snapshot: FeedbackRun;
  compact?: boolean;
  nextGoal?: string;
}) {
  const feedback = getRunFeedback(snapshot);
  if (!feedback) return null;
  if (compact)
    return (
      <section className={styles.compact} aria-label="Climb feedback">
        <p className={styles.explanation}>{feedback.explanation}</p>
        <p className={styles.suggestion}>{feedback.suggestion}</p>
        {nextGoal && <p className={styles.goal}>Next goal: {nextGoal}.</p>}
      </section>
    );
  return (
    <section className={styles.feedback} aria-label="Climb feedback">
      <p className={styles.explanation}>{feedback.explanation}</p>
      <p className={styles.suggestion}>{feedback.suggestion}</p>
    </section>
  );
}
