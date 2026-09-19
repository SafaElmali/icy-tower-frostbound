import { ArrowRight, CalendarDays } from 'lucide-react';
import type { DailyTower } from '@/lib/daily-tower';
import { dailyReturnMessage } from '@/lib/daily-return';
import styles from './daily-return.module.css';

export function DailyReturn({
  daily,
  onStartToday,
}: {
  daily: DailyTower | null;
  onStartToday: () => void;
}) {
  const reminder = dailyReturnMessage(daily);
  return (
    <div className={styles.reminder}>
      {reminder.action && (
        <button type="button" onClick={onStartToday}>
          <CalendarDays size={14} aria-hidden="true" />
          {reminder.action}
          <ArrowRight size={14} aria-hidden="true" />
        </button>
      )}
      <p>{reminder.message}</p>
    </div>
  );
}
