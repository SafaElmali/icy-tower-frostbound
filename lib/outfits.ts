export type OutfitSlot = 'hat' | 'sweater' | 'trail';
export type Outfit = Record<OutfitSlot, string>;
export type AchievementProgress = { floor: number; score: number; combo: number };
export type Cosmetic = { id: string; slot: OutfitSlot; name: string; colors: readonly number[]; achievement: string; metric: keyof AchievementProgress; target: number };

export const COSMETICS: readonly Cosmetic[] = [
  { id: 'blue-beanie', slot: 'hat', name: 'Blue beanie', colors: [0x285fac], achievement: 'A tower classic', metric: 'floor', target: 0 },
  { id: 'frost-beanie', slot: 'hat', name: 'Frost beanie', colors: [0x9fe7ee], achievement: 'First ascent · Reach floor 10', metric: 'floor', target: 10 },
  { id: 'summit-beanie', slot: 'hat', name: 'Summit beanie', colors: [0xffc85c], achievement: 'Summit seeker · Reach floor 50', metric: 'floor', target: 50 },
  { id: 'green-knit', slot: 'sweater', name: 'Green knit', colors: [0x16bb2c], achievement: 'Your first layer', metric: 'score', target: 0 },
  { id: 'berry-knit', slot: 'sweater', name: 'Berry knit', colors: [0xe66f9e], achievement: 'Point collector · Score 1,000 in a run', metric: 'score', target: 1000 },
  { id: 'aurora-knit', slot: 'sweater', name: 'Aurora knit', colors: [0xa28bff], achievement: 'High scorer · Score 5,000 in a run', metric: 'score', target: 5000 },
  { id: 'rainbow', slot: 'trail', name: 'Rainbow stars', colors: [0xffd65c, 0xff71c5, 0x68daff, 0xabf767, 0xb496ff], achievement: 'The original starlight', metric: 'combo', target: 0 },
  { id: 'glacier', slot: 'trail', name: 'Glacier stars', colors: [0x68daff, 0xb9f5ff, 0xffffff], achievement: 'Find your rhythm · Land a 5× combo', metric: 'combo', target: 5 },
  { id: 'sunset', slot: 'trail', name: 'Sunset stars', colors: [0xffa45c, 0xff71c5, 0xffd65c], achievement: 'Unstoppable · Land a 15× combo', metric: 'combo', target: 15 },
];
export const DEFAULT_OUTFIT: Outfit = { hat: 'blue-beanie', sweater: 'green-knit', trail: 'rainbow' };
export const EMPTY_PROGRESS: AchievementProgress = { floor: 0, score: 0, combo: 0 };
export const OUTFIT_STORAGE_KEY = 'frostbound-outfits-v1';
export const OUTFIT_SLOTS: OutfitSlot[] = ['hat', 'sweater', 'trail'];
export const isUnlocked = (item: Cosmetic, progress: AchievementProgress) => progress[item.metric] >= item.target;
export const cosmeticFor = (slot: OutfitSlot, id: string) => COSMETICS.find(item => item.slot === slot && item.id === id) ?? COSMETICS.find(item => item.id === DEFAULT_OUTFIT[slot])!;
export const cssColor = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

/** Only catalog IDs may reach rendering or leaderboard storage. Cosmetics never affect scores. */
export function normalizeOutfit(value: unknown, progress?: AchievementProgress): Outfit {
  const data = value && typeof value === 'object' ? value as Partial<Outfit> : {};
  return Object.fromEntries(OUTFIT_SLOTS.map(slot => {
    const item = cosmeticFor(slot, data[slot] ?? '');
    return [slot, !progress || isUnlocked(item, progress) ? item.id : DEFAULT_OUTFIT[slot]];
  })) as Outfit;
}

export function advanceProgress(previous: AchievementProgress, run: AchievementProgress): AchievementProgress {
  return { floor: Math.max(previous.floor, run.floor), score: Math.max(previous.score, run.score), combo: Math.max(previous.combo, run.combo) };
}

export type WardrobeProfile = { progress: AchievementProgress; equipped: Outfit };
export function readProfile(raw: string | null): WardrobeProfile {
  try {
    const data = JSON.parse(raw ?? '{}');
    const progress = { ...EMPTY_PROGRESS };
    for (const metric of ['floor', 'score', 'combo'] as const) {
      const value = data?.progress?.[metric];
      if (Number.isSafeInteger(value) && value >= 0) progress[metric] = value;
    }
    return { progress, equipped: normalizeOutfit(data?.equipped, progress) };
  } catch { return { progress: { ...EMPTY_PROGRESS }, equipped: { ...DEFAULT_OUTFIT } }; }
}
