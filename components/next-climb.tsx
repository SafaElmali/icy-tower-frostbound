import { Target } from 'lucide-react';
import { getNextClimb, type NextClimbInput } from '@/lib/next-climb';
import styles from './next-climb.module.css';

export function NextClimb(props: NextClimbInput) {
  const goal = getNextClimb(props);
  if (!goal) return null;
  return (
    <section className={styles.card} aria-label="Your next climb">
      <h3 className={styles.title}>
        <Target size={16} aria-hidden="true" />
        <span>Next climb: {goal.title}</span>
      </h3>
      <div className={styles.progress}>
        {goal.progress.map((item) => (
          <span key={item.label}>
            <span>
              {item.label}{' '}
              <b>
                {item.value} / {item.target}
              </b>
            </span>
            <progress
              aria-label={`${item.label} toward ${goal.title}`}
              value={item.value}
              max={item.target}
            />
          </span>
        ))}
      </div>
      <p className={styles.tip}>{goal.tip}</p>
      <small className={styles.note}>{goal.note}</small>
    </section>
  );
}
