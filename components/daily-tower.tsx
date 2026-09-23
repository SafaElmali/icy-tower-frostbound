'use client';

import {
  CalendarDays,
  Share2,
  Trophy,
  Play,
  ArrowRight,
  Clock3,
} from 'lucide-react';
import type { DailyBest, DailyTower } from '@/lib/daily-tower';
import styles from './daily-tower.module.css';

export function DailyTowerCard({
  daily,
  best,
  onStart,
  onShare,
  onToday,
}: {
  daily: DailyTower;
  best?: DailyBest | null;
  onStart: () => void;
  onShare?: () => void;
  onToday?: () => void;
}) {
  const date = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${daily.date}T00:00:00Z`));
  return (
    <section className={styles.card} aria-label="Daily shared tower">
      <div className={styles.date}>
        <CalendarDays size={28} strokeWidth={1.5} aria-hidden="true" />
        <div>
          <time dateTime={daily.date}>{date}</time>
          <span>
            Classic · {onToday ? 'Shared tower' : 'Daily route'} · UTC
          </span>
        </div>
      </div>
      <div className={styles.best}>
        <Trophy size={22} strokeWidth={1.5} aria-hidden="true" />
        <div>
          {best ? (
            <>
              <strong>Your best: floor {best.floor}</strong>
              <span>{best.score.toLocaleString()} points on this tower</span>
            </>
          ) : (
            <>
              <strong>Set your first best.</strong>
              <span>Finish a climb, then come back to beat it.</span>
            </>
          )}
        </div>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.start} onClick={onStart}>
          <Play size={17} aria-hidden="true" />
          {best ? 'Climb again' : 'Climb this tower'}
          <ArrowRight size={18} aria-hidden="true" />
        </button>
        {onShare && (
          <button type="button" className={styles.share} onClick={onShare}>
            <Share2 size={16} aria-hidden="true" />
            Share tower
          </button>
        )}
      </div>
      {onToday && (
        <button type="button" className={styles.today} onClick={onToday}>
          Switch to today’s tower <ArrowRight size={15} aria-hidden="true" />
        </button>
      )}
      <div className={styles.note}>
        <p>
          <Clock3 size={14} aria-hidden="true" />
          <span>
            A new tower arrives every day at <strong>00:00 UTC.</strong>
          </span>
        </p>
        <p>Shared links always keep their original tower.</p>
      </div>
    </section>
  );
}

export function DailyTowerBanner({
  daily,
  best,
}: {
  daily: DailyTower;
  best?: DailyBest | null;
}) {
  return (
    <div className={styles.banner} aria-label="Active daily tower">
      <CalendarDays size={14} aria-hidden="true" />
      <span>Daily · {daily.date} · Classic</span>
      {best && <strong>Best: {best.floor}</strong>}
    </div>
  );
}
