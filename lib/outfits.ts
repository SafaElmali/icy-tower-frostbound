export type CoreOutfitSlot = 'hat' | 'sweater' | 'trail';
/** Slots added after launch are optional so older saves, leaderboard rows and race profiles stay valid. */
export type OptionalOutfitSlot = 'accessory' | 'climber';
export type OutfitSlot = CoreOutfitSlot | OptionalOutfitSlot;
export type Outfit = Record<CoreOutfitSlot, string> & Partial<Record<OptionalOutfitSlot, string>>;
export type AchievementProgress = { floor: number; score: number; combo: number; stomps: number };
/** `shape` picks the procedural geometry in `character-accessories.ts`; a missing shape only recolors. */
export type CosmeticShape = 'bobble' | 'crown' | 'horned-helm' | 'wizard' | 'trapper' | 'propeller' | 'top-hat' | 'scarf' | 'cape' | 'bat-cape';
export type Cosmetic = { id: string; slot: OutfitSlot; name: string; colors: readonly number[]; achievement: string; metric: keyof AchievementProgress; target: number; shape?: CosmeticShape };

export const COSMETICS: readonly Cosmetic[] = [
  { id: 'blue-beanie', slot: 'hat', name: 'Blue beanie', colors: [0x285fac], achievement: 'A tower classic', metric: 'floor', target: 0 },
  // IDs are stored in saves and leaderboard rows; only names and shapes may change.
  { id: 'frost-beanie', slot: 'hat', name: 'Frost bobble hat', colors: [0x9fe7ee, 0xffffff], achievement: 'First ascent · Reach floor 10', metric: 'floor', target: 10, shape: 'bobble' },
  { id: 'summit-beanie', slot: 'hat', name: 'Summit crown', colors: [0xffc85c, 0xc8283f, 0x5fd4ff], achievement: 'Summit seeker · Reach floor 50', metric: 'floor', target: 50, shape: 'crown' },
  { id: 'trapper-hat', slot: 'hat', name: 'Yeti trapper', colors: [0xc8423a, 0xf4efe4], achievement: 'Deep freeze · Reach floor 75', metric: 'floor', target: 75, shape: 'trapper' },
  { id: 'glacier-beanie', slot: 'hat', name: 'Glacier horned helm', colors: [0x2f9fb4, 0xdff9ff], achievement: 'Into the vault · Reach floor 100', metric: 'floor', target: 100, shape: 'horned-helm' },
  { id: 'starfall-beanie', slot: 'hat', name: 'Starfall wizard hat', colors: [0x4b4fc4, 0xffd65c], achievement: 'Starfall summit · Reach floor 200', metric: 'floor', target: 200, shape: 'wizard' },
  { id: 'propeller-cap', slot: 'hat', name: 'Propeller cap', colors: [0xff5a5f, 0xffd65c, 0x3f8cff, 0x3fcf6a], achievement: 'Lift off · Land a 10× combo', metric: 'combo', target: 10, shape: 'propeller' },
  { id: 'top-hat', slot: 'hat', name: 'Top hat', colors: [0x2a2b35, 0xd7263d], achievement: 'Dapper climber · Score 10,000 in a run', metric: 'score', target: 10000, shape: 'top-hat' },
  { id: 'green-knit', slot: 'sweater', name: 'Green knit', colors: [0x16bb2c], achievement: 'Your first layer', metric: 'score', target: 0 },
  { id: 'berry-knit', slot: 'sweater', name: 'Berry knit', colors: [0xe66f9e], achievement: 'Point collector · Score 1,000 in a run', metric: 'score', target: 1000 },
  { id: 'aurora-knit', slot: 'sweater', name: 'Aurora knit', colors: [0xa28bff], achievement: 'High scorer · Score 5,000 in a run', metric: 'score', target: 5000 },
  { id: 'storm-knit', slot: 'sweater', name: 'Storm knit', colors: [0x5d7383], achievement: 'Eye of the storm · Reach floor 150', metric: 'floor', target: 150 },
  { id: 'batbane-knit', slot: 'sweater', name: 'Batbane knit', colors: [0x7a3a9c], achievement: 'Bat bouncer · Stomp 3 bats in one run', metric: 'stomps', target: 3 },
  { id: 'no-accessory', slot: 'accessory', name: 'No extra', colors: [0x6f8793], achievement: 'Travel light', metric: 'floor', target: 0 },
  { id: 'knit-scarf', slot: 'accessory', name: 'Striped scarf', colors: [0xe8454f, 0xfff1dc], achievement: 'Bundle up · Reach floor 25', metric: 'floor', target: 25, shape: 'scarf' },
  { id: 'aurora-scarf', slot: 'accessory', name: 'Aurora scarf', colors: [0x55e8b8, 0x8f7bff, 0x68daff], achievement: 'Northern lights · Land a 20× combo', metric: 'combo', target: 20, shape: 'scarf' },
  { id: 'royal-cape', slot: 'accessory', name: 'Royal cape', colors: [0xc8283f, 0xffd65c, 0xf4efe4], achievement: 'Tower royalty · Score 15,000 in a run', metric: 'score', target: 15000, shape: 'cape' },
  { id: 'bat-cape', slot: 'accessory', name: 'Bat cape', colors: [0x3a2250, 0xc23a5c], achievement: 'Bat lord · Stomp 5 bats in one run', metric: 'stomps', target: 5, shape: 'bat-cape' },
  { id: 'harold', slot: 'climber', name: 'Harold', colors: [0x16bb2c, 0x285fac], achievement: 'The original climber', metric: 'floor', target: 0 },
  { id: 'pip-penguin', slot: 'climber', name: 'Pip the penguin', colors: [0x1f2a36, 0xffa22e, 0xf2f5f7], achievement: 'Feathered friend · Reach floor 20', metric: 'floor', target: 20 },
  { id: 'rainbow', slot: 'trail', name: 'Rainbow stars', colors: [0xffd65c, 0xff71c5, 0x68daff, 0xabf767, 0xb496ff], achievement: 'The original starlight', metric: 'combo', target: 0 },
  { id: 'glacier', slot: 'trail', name: 'Glacier stars', colors: [0x68daff, 0xb9f5ff, 0xffffff], achievement: 'Find your rhythm · Land a 5× combo', metric: 'combo', target: 5 },
  { id: 'sunset', slot: 'trail', name: 'Sunset stars', colors: [0xffa45c, 0xff71c5, 0xffd65c], achievement: 'Unstoppable · Land a 15× combo', metric: 'combo', target: 15 },
  { id: 'frenzy', slot: 'trail', name: 'Frenzy stars', colors: [0x8affd5, 0x3de0b0, 0xffffff], achievement: 'Chain master · Land a 25× combo', metric: 'combo', target: 25 },
  { id: 'aurora', slot: 'trail', name: 'Aurora stars', colors: [0x77efc6, 0xa28bff, 0x68daff, 0xffd65c], achievement: 'Star climber · Score 25,000 in a run', metric: 'score', target: 25000 },
];
export const DEFAULT_OUTFIT: Outfit = { hat: 'blue-beanie', sweater: 'green-knit', trail: 'rainbow' };
/** Every slot's default, including optional slots that normalized outfits leave out. */
export const SLOT_DEFAULTS: Readonly<Record<OutfitSlot, string>> = { ...DEFAULT_OUTFIT, accessory: 'no-accessory', climber: 'harold' };
export const EMPTY_PROGRESS: AchievementProgress = { floor: 0, score: 0, combo: 0, stomps: 0 };
export const OUTFIT_STORAGE_KEY = 'frostbound-outfits-v1';
export const OUTFIT_SLOTS: OutfitSlot[] = ['hat', 'sweater', 'accessory', 'trail', 'climber'];
const OPTIONAL_SLOTS: readonly OptionalOutfitSlot[] = ['accessory', 'climber'];
export const ACHIEVEMENT_METRICS = ['floor', 'score', 'combo', 'stomps'] as const;
export const isUnlocked = (item: Cosmetic, progress: AchievementProgress) => progress[item.metric] >= item.target;
export const cosmeticFor = (slot: OutfitSlot, id: string) => COSMETICS.find(item => item.slot === slot && item.id === id) ?? COSMETICS.find(item => item.slot === slot && item.id === SLOT_DEFAULTS[slot])!;
/** The item worn in a slot; optional slots missing from older data mean the default. */
export const equippedId = (outfit: Outfit, slot: OutfitSlot) => outfit[slot] ?? SLOT_DEFAULTS[slot];
/** A stable cache key covering every slot. */
export const outfitKey = (outfit: Outfit) => OUTFIT_SLOTS.map(slot => equippedId(outfit, slot)).join('/');
export const cssColor = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

/** Only catalog IDs may reach rendering or leaderboard storage. Cosmetics never affect scores. */
export function normalizeOutfit(value: unknown, progress?: AchievementProgress): Outfit {
  const data = value && typeof value === 'object' ? value as Partial<Outfit> : {};
  return Object.fromEntries(OUTFIT_SLOTS.flatMap(slot => {
    const raw = data[slot];
    const item = cosmeticFor(slot, typeof raw === 'string' ? raw : '');
    const id = !progress || isUnlocked(item, progress) ? item.id : SLOT_DEFAULTS[slot];
    // Optional slots are omitted at their default, so older rows and newer default rows match exactly.
    return OPTIONAL_SLOTS.includes(slot as OptionalOutfitSlot) && id === SLOT_DEFAULTS[slot] ? [] : [[slot, id]];
  })) as Outfit;
}

/** Older saves and records may lack newer metrics; a missing value counts as zero. */
export function advanceProgress(previous: AchievementProgress, run: Partial<AchievementProgress>): AchievementProgress {
  return Object.fromEntries(ACHIEVEMENT_METRICS.map(metric => [metric, Math.max(previous[metric] ?? 0, run[metric] ?? 0)])) as AchievementProgress;
}

export type WardrobeProfile = { progress: AchievementProgress; equipped: Outfit };
export function readProfile(raw: string | null): WardrobeProfile {
  try {
    const data = JSON.parse(raw ?? '{}');
    const progress = { ...EMPTY_PROGRESS };
    for (const metric of ACHIEVEMENT_METRICS) {
      const value = data?.progress?.[metric];
      if (Number.isSafeInteger(value) && value >= 0) progress[metric] = value;
    }
    return { progress, equipped: normalizeOutfit(data?.equipped, progress) };
  } catch { return { progress: { ...EMPTY_PROGRESS }, equipped: { ...DEFAULT_OUTFIT } }; }
}
