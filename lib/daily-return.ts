import {
  dailyTowerToken,
  todayDailyTower,
  type DailyTower,
} from './daily-tower.ts';

export function dailyReturnMessage(daily: DailyTower | null, now = new Date()) {
  const today = todayDailyTower(now);
  // Archived dates and old rules are still replayable, but are not today's tower.
  const isToday =
    daily !== null && dailyTowerToken(daily) === dailyTowerToken(today);
  return {
    action: isToday ? null : 'Try today’s tower',
    message: isToday
      ? 'Come back for a new route at 00:00 UTC. Today’s tower stays replayable.'
      : 'Learn today’s route. A new shared tower arrives every day at 00:00 UTC.',
  };
}
