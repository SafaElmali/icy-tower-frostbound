export interface TowerSection {
  id: string;
  name: string;
  startsAtFloor: number;
  /** Background architecture stays subdued so the pale landing surfaces remain legible. */
  palette: {
    background: number; fog: number; keyLight: number; rimLight: number;
    stone: number; trim: number; dark: number; metal: number; ice: number;
    flame: number; windowLow: number; windowHigh: number; shaft: number;
  };
  auroraStrength: number;
}

export const TOWER_SECTIONS: readonly TowerSection[] = [
  {
    id: 'forgotten-hall', name: 'THE FORGOTTEN HALL', startsAtFloor: 0,
    palette: {
      background: 0x140f13, fog: 0x241e24, keyLight: 0xffead6, rimLight: 0xd69a65,
      stone: 0x413333, trim: 0x6b5146, dark: 0x211923, metal: 0x927047,
      ice: 0x6d8e99, flame: 0xffad54, windowLow: 0x151923, windowHigh: 0x6a4534, shaft: 0x9b7955,
    },
    auroraStrength: 0,
  },
  {
    id: 'frozen-belfry', name: 'THE FROZEN BELFRY', startsAtFloor: 25,
    palette: {
      background: 0x07121e, fog: 0x101f2c, keyLight: 0xe0f6ff, rimLight: 0x58cfff,
      stone: 0x253e4b, trim: 0x46616a, dark: 0x122330, metal: 0x597d8a,
      ice: 0x66adbf, flame: 0x9adfff, windowLow: 0x071727, windowHigh: 0x215e7d, shaft: 0x388cb3,
    },
    auroraStrength: 0,
  },
  {
    id: 'crystal-spire', name: 'CRYSTAL SPIRE', startsAtFloor: 50,
    palette: {
      background: 0x110b24, fog: 0x211735, keyLight: 0xece5ff, rimLight: 0xac86ff,
      stone: 0x382e52, trim: 0x615076, dark: 0x1b1530, metal: 0x8f71a6,
      ice: 0x9f81c6, flame: 0xc5a0ff, windowLow: 0x1d1037, windowHigh: 0x684ca2, shaft: 0x9972c5,
    },
    auroraStrength: .15,
  },
  {
    id: 'aurora', name: 'THE AURORA', startsAtFloor: 75,
    palette: {
      background: 0x061b20, fog: 0x0c2b32, keyLight: 0xd5fff2, rimLight: 0x77efc6,
      stone: 0x233f41, trim: 0x446d68, dark: 0x0c242e, metal: 0x588a86,
      ice: 0x7ac0b7, flame: 0x83f2c4, windowLow: 0x192148, windowHigh: 0x277762, shaft: 0x62cfa6,
    },
    auroraStrength: 1,
  },
  {
    id: 'glacier-vault', name: 'THE GLACIER VAULT', startsAtFloor: 100,
    palette: {
      background: 0x0b2027, fog: 0x163540, keyLight: 0xf0fbff, rimLight: 0x9fe8ff,
      stone: 0x35545d, trim: 0x6f969c, dark: 0x132a32, metal: 0xc4a15c,
      ice: 0xa8e4ee, flame: 0xffd88a, windowLow: 0x0d2a36, windowHigh: 0x5fb3c4, shaft: 0xbfe9f2,
    },
    auroraStrength: .25,
  },
  {
    id: 'stormcrown', name: 'THE STORMCROWN', startsAtFloor: 150,
    palette: {
      background: 0x0d1117, fog: 0x1b222b, keyLight: 0xd8e6ff, rimLight: 0x3ee6ff,
      stone: 0x2e3540, trim: 0x4d5866, dark: 0x14181f, metal: 0x6f7f91,
      ice: 0x7fd8ff, flame: 0x5cf0ff, windowLow: 0x10151e, windowHigh: 0x3a6b8f, shaft: 0x7ad9ff,
    },
    auroraStrength: .4,
  },
  {
    id: 'starfall-summit', name: 'STARFALL SUMMIT', startsAtFloor: 200,
    palette: {
      background: 0x060a1f, fog: 0x10163a, keyLight: 0xfff1dc, rimLight: 0xffc36e,
      stone: 0x252a4d, trim: 0x4a4f82, dark: 0x0d1030, metal: 0xd0a45e,
      ice: 0x9fb2ff, flame: 0xffc96b, windowLow: 0x0b0f33, windowHigh: 0x8a6bd6, shaft: 0xffd28a,
    },
    auroraStrength: 1,
  },
];

export function getTowerSection(floor: number): TowerSection {
  if (!Number.isFinite(floor)) return TOWER_SECTIONS[0];
  return TOWER_SECTIONS.findLast(section => floor >= section.startsAtFloor) ?? TOWER_SECTIONS[0];
}
