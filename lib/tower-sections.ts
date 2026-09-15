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
];

export function getTowerSection(floor: number): TowerSection {
  if (!Number.isFinite(floor)) return TOWER_SECTIONS[0];
  return TOWER_SECTIONS.findLast(section => floor >= section.startsAtFloor) ?? TOWER_SECTIONS[0];
}
