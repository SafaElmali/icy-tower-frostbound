/** Rules version 9 changed combo scoring, so its runs compete on a fresh board. */
export const SEASON_START_VERSION = 9;
export type LeaderboardSeason = 'current' | 'legacy';
export const SEASON_LABELS: Record<LeaderboardSeason, string> = {
  current: 'Season 2',
  legacy: 'Legacy',
};
export const seasonForVersion = (version: number): LeaderboardSeason =>
  version >= SEASON_START_VERSION ? 'current' : 'legacy';
export const isLeaderboardSeason = (
  value: unknown,
): value is LeaderboardSeason => value === 'current' || value === 'legacy';
