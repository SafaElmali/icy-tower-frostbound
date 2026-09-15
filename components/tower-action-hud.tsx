import { ArrowUp, Snowflake, Sparkles, TriangleAlert } from 'lucide-react';
import {
  FRENZY_COMBO_TARGET,
  FRENZY_DURATION,
  type TowerActionState,
} from '@/lib/tower-action';
import styles from './tower-action-hud.module.css';

export const hasActionNotice = (action: TowerActionState) =>
  !!action.notice || !!action.encounter || action.frenzyTime > 0;

/** Timers stay out of live regions so assistive tools announce the instruction once. */
export function TowerActionHud({ action }: { action: TowerActionState }) {
  if (!hasActionNotice(action)) return null;
  const encounter = action.encounter;
  const frenzy = action.frenzyTime > 0;
  const label =
    action.notice?.label ??
    (frenzy
      ? 'COMBO FRENZY'
      : encounter?.kind === 'ice-shower'
        ? 'ICE SHOWER'
        : 'CRUMBLE RUSH');
  const detail =
    action.notice?.detail ??
    (frenzy
      ? 'Boosted jumps. Follow the crystals!'
      : encounter?.kind === 'ice-shower'
        ? 'Dodge the falling ice.'
        : 'Cracked ledges break. Keep jumping!');
  const Icon =
    label === 'COMBO FRENZY'
      ? Sparkles
      : label === 'CATCH YOUR BREATH'
        ? Snowflake
        : TriangleAlert;

  return (
    <aside
      className={`${styles.notice} ${frenzy ? styles.frenzy : ''}`}
      aria-label="Tower action"
    >
      <output className={styles.message} aria-live="polite" aria-atomic="true">
        <strong>
          <Icon size={14} aria-hidden="true" />
          {label}
        </strong>
        <span className={styles.detail}>{detail}</span>
      </output>
      {encounter && (
        <div className={styles.encounter}>
          <span>
            {encounter.kind === 'ice-shower' ? 'Ice shower' : 'Crumble rush'}
          </span>
          <span>{Math.ceil(encounter.timeLeft)}s</span>
          <progress
            aria-label="Tower event time remaining"
            value={encounter.timeLeft}
            max={encounter.duration}
          />
        </div>
      )}
    </aside>
  );
}

export function TowerFrenzyMeter({ action }: { action: TowerActionState }) {
  const active = action.frenzyTime > 0;
  return (
    <div className={`${styles.meter} ${active ? styles.charged : ''}`}>
      <div>
        <span>
          <Sparkles size={11} aria-hidden="true" />
          {active ? 'FRENZY' : 'FRENZY CHARGE'}
        </span>
        <span>
          {active
            ? `${Math.ceil(action.frenzyTime)}s`
            : `${Math.min(FRENZY_COMBO_TARGET, Math.round(action.frenzyCharge * FRENZY_COMBO_TARGET))}/${FRENZY_COMBO_TARGET}`}
        </span>
      </div>
      <progress
        aria-label={active ? 'Frenzy time remaining' : 'Combo frenzy charge'}
        value={active ? action.frenzyTime : action.frenzyCharge}
        max={active ? FRENZY_DURATION : 1}
      />
    </div>
  );
}

export function TowerActionResults({ action }: { action: TowerActionState }) {
  return (
    <section className={styles.results} aria-labelledby="action-results-title">
      <h3 id="action-results-title">
        <ArrowUp size={16} aria-hidden="true" /> Reflex highlights
      </h3>
      <dl>
        <div>
          <dt>Close dodges</dt>
          <dd>{action.dodges}</dd>
        </div>
        <div>
          <dt>Bat stomps</dt>
          <dd>{action.stomps}</dd>
        </div>
        <div>
          <dt>Frenzies</dt>
          <dd>{action.frenzies}</dd>
        </div>
        <div>
          <dt>Hits taken</dt>
          <dd>{action.hits}</dd>
        </div>
      </dl>
    </section>
  );
}
