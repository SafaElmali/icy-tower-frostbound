import { Target } from 'lucide-react';
import { getNextClimb, type NextClimbInput } from '@/lib/next-climb';
import styles from './next-climb.module.css';

export function NextClimb(props: NextClimbInput) {
  const goal = getNextClimb(props);
  if (!goal) return null;
  return (
    <section className={styles.card} aria-label="Your next climb">
      <span className={styles.label}>
        <Target size={13} aria-hidden="true" /> NEXT CLIMB
      </span>
      <strong className={styles.title}>{goal.title}</strong>
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
