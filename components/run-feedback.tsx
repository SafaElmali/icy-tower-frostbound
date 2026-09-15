import { getRunFeedback, type FeedbackRun } from '@/lib/run-feedback';
import styles from './run-feedback.module.css';

export function RunFeedback({ snapshot }: { snapshot: FeedbackRun }) {
  const feedback = getRunFeedback(snapshot);
  if (!feedback) return null;
  return <section className={styles.feedback} aria-label="Climb feedback">
    <p className={styles.explanation}>{feedback.explanation}</p>
    <p className={styles.suggestion}>{feedback.suggestion}</p>
  </section>;
}
