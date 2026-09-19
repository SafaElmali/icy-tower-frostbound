import { normalizeOutfit } from './outfits.ts';
import { racePlayerLabel, type RaceProfile, type RaceSlot } from './race-protocol.ts';

export const RACE_NAME_MAX_LENGTH = 20;

/** Names are plain text; only catalog cosmetics are shared with other players. */
export function normalizeRaceProfile(raw: unknown, slot: RaceSlot = 'host'): RaceProfile {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Partial<RaceProfile>
    : {};
  const name = typeof value.name === 'string'
    ? Array.from(value.name.normalize('NFC')
        .replace(/\s+/gu, ' ')
        .replace(/[\p{Cc}\p{Cs}\u200B\u200E\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/gu, '')
        .trim())
        .slice(0, RACE_NAME_MAX_LENGTH).join('').trim()
    : '';
  return { name: name || racePlayerLabel(slot), outfit: normalizeOutfit(value.outfit) };
}
