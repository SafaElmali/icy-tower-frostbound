/** Shared simulation/rendering contract for the tower's action mechanics. */
export const CRUMBLE_DELAY = 1.15;
export const ICICLE_WARNING_TIME = 1.1;
export const FRENZY_DURATION = 6;
export const FRENZY_COMBO_TARGET = 10;

export type CrumbleState = { remaining: number | null; broken: boolean };
export type FallingIcicle = {
  id: number; x: number; y: number; spawnY: number; targetY: number;
  state: 'warning' | 'falling'; warningTime: number; vy: number; nearMiss: boolean;
};
export type FrostBat = {
  id: number; x: number; y: number; originX: number; originY: number;
  phase: number; alive: boolean; warningTime: number;
};
export type FrenzyCrystal = { id: number; x: number; y: number; collected: boolean };
export type TowerEncounter = { kind: 'ice-shower' | 'crumble-rush'; timeLeft: number; duration: number };
export type ActionNotice = { label: string; detail: string; timeLeft: number };
export type TowerActionState = {
  icicles: FallingIcicle[]; bats: FrostBat[]; crystals: FrenzyCrystal[];
  /** Charge is normalized to 0..1 and earned only on fresh higher-floor landings. */
  frenzyTime: number; frenzyCharge: number; invulnerableTime: number;
  encounter: TowerEncounter | null; notice: ActionNotice | null;
  dodges: number; stomps: number; hits: number; frenzies: number;
};
export const freshTowerAction = (): TowerActionState => ({
  icicles: [], bats: [], crystals: [], frenzyTime: 0, frenzyCharge: 0,
  invulnerableTime: 0, encounter: null, notice: null,
  dodges: 0, stomps: 0, hits: 0, frenzies: 0,
});
