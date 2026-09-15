import { ArrowUp, Snowflake } from 'lucide-react';
import type { GuidanceCue } from '@/lib/climb-guidance';
import styles from './climb-guidance.module.css';

export function ClimbGuidance({ cue, onSkip }: { cue: GuidanceCue | null; onSkip: () => void }) {
  if (!cue) return null;
  return <aside className={`${styles.guide} ${cue.id === 'frost' ? styles.frost : ''}`} aria-label="Climbing guidance">
    <output className={styles.copy} aria-live="polite" aria-atomic="true">
      <strong>{cue.id === 'frost' ? <Snowflake size={15} aria-hidden="true" /> : <ArrowUp size={15} aria-hidden="true" />}{cue.title}</strong>
      <p>{cue.text}</p>
    </output>
    {cue.skippable && <button type="button" onClick={onSkip} aria-label="Skip climbing guidance">Skip tips</button>}
  </aside>;
}
