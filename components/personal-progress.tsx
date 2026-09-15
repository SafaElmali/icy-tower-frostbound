'use client';

import { comparePersonalProgress, type PersonalRun, type PersonalRunBaseline } from '@/lib/personal-progress';
import { MODE_LABELS } from '@/lib/tower-engine';
import styles from './personal-progress.module.css';

export function PersonalProgressResults({ baseline, run }: { baseline: PersonalRunBaseline; run: PersonalRun }) {
  const comparisons = comparePersonalProgress(baseline, run);
  if (!comparisons.length) return null;
  const records = comparisons.filter(row => row.improvement > 0);
  return <section className={styles.results} aria-label={`${MODE_LABELS[run.mode]} personal progress`}>
    <div className={styles.heading}><strong>Your progress</strong><span>{MODE_LABELS[run.mode]} records</span></div>
    {records.length > 0 && <p className={styles.celebration}>{records.map(row => `New ${row.label.toLowerCase()}: ${row.current}`).join(' · ')}</p>}
    <div className={styles.rows}>
      {comparisons.map(row => <div className={styles.row} key={row.metric}>
        <span>{row.label}</span><strong>{row.current}</strong>
        <span className={row.improvement > 0 ? styles.improved : styles.previous}>{row.improvement > 0 ? `+${row.improvement} · previous ${row.previous}` : `Best ${row.previous}`}</span>
      </div>)}
    </div>
  </section>;
}
