'use client';

import { CalendarDays, Share2 } from 'lucide-react';
import type { DailyBest, DailyTower } from '@/lib/daily-tower';
import styles from './daily-tower.module.css';

export function DailyTowerCard({ daily, best, onStart, onShare, onToday }: { daily: DailyTower; best?: DailyBest | null; onStart: () => void; onShare?: () => void; onToday?: () => void }) {
  return <section className={styles.card} aria-label="Daily shared tower">
    <div className={styles.heading}><CalendarDays size={18} aria-hidden="true" /><strong>Daily tower</strong><span>Classic</span></div>
    <time dateTime={daily.date}>{daily.date} · UTC</time>
    <p>One tower for everyone. Unlimited climbs to find your best route.</p>
    <div className={styles.best}>{best ? <>Your best: <strong>floor {best.floor}</strong><span>{best.score.toLocaleString()} points</span></> : 'Set your first best on this tower.'}</div>
    <div className={styles.actions}>
      <button type="button" onClick={onStart}>Climb this daily</button>
      {onShare && <button type="button" onClick={onShare}><Share2 size={14} aria-hidden="true" />Share tower</button>}
      {onToday && <button type="button" onClick={onToday}>Today’s tower</button>}
    </div>
    <small>New tower each day at 00:00 UTC. Shared links keep their original tower.</small>
  </section>;
}

export function DailyTowerBanner({ daily, best }: { daily: DailyTower; best?: DailyBest | null }) {
  return <div className={styles.banner} aria-label="Active daily tower"><CalendarDays size={14} aria-hidden="true" /><span>Daily · {daily.date} · Classic</span>{best && <strong>Best: {best.floor}</strong>}</div>;
}
