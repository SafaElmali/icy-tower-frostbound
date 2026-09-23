import { normalizeOutfit, type Outfit } from './outfits.ts';
import { seasonForVersion, type LeaderboardSeason } from './leaderboard-season.ts';
import { createHash } from 'node:crypto';
import { MAX_REPLAY_FRAMES, MAX_REPLAY_SEGMENTS, TowerEngine, isRulesVersion, replayMode, type RankedMode, type RunReplay } from './tower-engine.ts';

export type LeaderboardEntry = { id: string; name: string; score: number; floor: number; combo: number; duration: number; createdAt: string; mode?: RankedMode; outfit?: Outfit };
export class LeaderboardError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
export type LeaderboardStore = {
  getWithMetadata(key: string, options: { type: 'json' }): Promise<{ data: LeaderboardEntry[]; etag?: string } | null>;
  setJSON(key: string, data: unknown, options: { onlyIfMatch: string } | { onlyIfNew: true }): Promise<{ modified: boolean }>;
};
// Legacy keys keep their original names so earlier rankings remain intact.
const boardKey = (mode: RankedMode, season: LeaderboardSeason) => season === 'current' ? `${mode}-s2` : mode === 'party' ? 'party-v1' : 'arcade-v1';
export type VerifiedEntry = LeaderboardEntry & { mode: RankedMode; season: LeaderboardSeason };
export const compareScores = (a: LeaderboardEntry, b: LeaderboardEntry) => b.score - a.score || b.floor - a.floor || a.duration - b.duration || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

/** Replays inputs on the server; score, floor, and combo are never accepted from the client. */
export function verifySubmission(input: unknown): VerifiedEntry {
  if (!input || typeof input !== 'object') throw new LeaderboardError('The score submission is incomplete.');
  const { name: rawName, replay, outfit } = input as { name?: unknown; replay?: RunReplay; outfit?: unknown };
  const name = typeof rawName === 'string' ? rawName.normalize('NFKC').trim().replace(/\s+/g, ' ') : '';
  if (!/^[\p{L}\p{N} ._'’-]{2,20}$/u.test(name)) throw new LeaderboardError('Use 2–20 letters, numbers, spaces, or simple punctuation for your name.');
  if (!replay || !isRulesVersion(replay.version) || !Number.isInteger(replay.seed) || replay.seed < 0 || replay.seed > 0xffffffff || !Array.isArray(replay.moves) || !replay.moves.length || replay.moves.length > MAX_REPLAY_SEGMENTS) throw new LeaderboardError('This run cannot be verified. Start a new ranked run.');
  if (replay.version >= 3 ? replay.mode !== 'arcade' && replay.mode !== 'party' : replay.mode !== undefined) throw new LeaderboardError('Invalid ranked mode.');
  const mode = replayMode(replay);
  let totalFrames = 0;
  for (const move of replay.moves) {
    if (!Array.isArray(move) || move.length !== 2) throw new LeaderboardError('Invalid run recording.');
    const [frames, mask] = move;
    if (!Number.isInteger(frames) || !Number.isInteger(mask) || mask < 0 || mask > 8 || (mask === 8 ? frames !== 0 : frames < 1)) throw new LeaderboardError('Invalid run recording.');
    totalFrames += frames;
    if (totalFrames > MAX_REPLAY_FRAMES) throw new LeaderboardError('Ranked runs must be under 30 minutes.');
  }
  const engine = new TowerEngine(replay.seed, false, replay.version); engine.start(mode);
  for (const [frames, mask] of replay.moves) {
    if (engine.status !== 'playing') throw new LeaderboardError('The run contains moves after it ended.');
    if (mask === 8) { engine.togglePause(); engine.togglePause(); continue; }
    const input = { left: !!(mask & 1), right: !!(mask & 2), jump: !!(mask & 4) };
    for (let i = 0; i < frames; i++) {
      if (engine.status !== 'playing') throw new LeaderboardError('The run contains moves after it ended.');
      engine.tick(1 / 120, input); engine.drainEvents();
    }
  }
  if (engine.status !== 'over' || engine.floor < 1) throw new LeaderboardError('Finish a ranked run and reach at least floor 1 to submit.');
  // Keep legacy hashes stable so previously submitted runs remain deduplicated.
  const identity = { version: replay.version, seed: replay.seed, moves: replay.moves, ...(replay.version >= 3 ? { mode } : {}) };
  const id = createHash('sha256').update(JSON.stringify(identity)).digest('hex');
  return { id, name, mode, season: seasonForVersion(replay.version), outfit: normalizeOutfit(outfit), score: engine.score, floor: engine.floor, combo: engine.bestCombo, duration: Math.round(engine.time * 1000), createdAt: new Date().toISOString() };
}

/** Bounded shared leaderboard with conditional writes, so simultaneous finishes cannot lose scores. */
export class Leaderboard {
  private store: LeaderboardStore;
  constructor(store: LeaderboardStore) { this.store = store; }
  async list(mode: RankedMode = 'arcade', season: LeaderboardSeason = 'current') { return (await this.store.getWithMetadata(boardKey(mode, season), { type: 'json' }))?.data ?? []; }
  /** The verified rules version selects the board; the season itself is not stored in rows. */
  async submit({ season = 'legacy', ...entry }: LeaderboardEntry & { season?: LeaderboardSeason }) {
    const key = boardKey(entry.mode ?? 'arcade', season);
    for (let attempt = 0; attempt < 8; attempt++) {
      const current = await this.store.getWithMetadata(key, { type: 'json' });
      const entries = current?.data ?? [];
      const existing = entries.findIndex(row => row.id === entry.id);
      if (existing !== -1) return { entries, rank: existing + 1, id: entry.id };
      const next = [...entries, entry].sort(compareScores).slice(0, 50);
      const rank = next.findIndex(row => row.id === entry.id) + 1;
      if (!rank) return { entries, rank: null, id: entry.id };
      if (current && !current.etag) throw new LeaderboardError('The leaderboard is temporarily unavailable. Please try again.', 503);
      const result = await this.store.setJSON(key, next, current ? { onlyIfMatch: current.etag! } : { onlyIfNew: true });
      if (result.modified) return { entries: next, rank, id: entry.id };
    }
    throw new LeaderboardError('The leaderboard is busy. Please try submitting again.', 503);
  }
}
