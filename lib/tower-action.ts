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
/**
 * Version 9 late-tower hunter. It drifts to a hover point beside the climber,
 * glows while its dash line is locked (the tell), dashes along exactly that
 * line, then fades out harmlessly.
 */
export type WraithState = 'drift' | 'tell' | 'dash' | 'fade';
export type FrostWraith = {
  id: number; x: number; y: number; side: -1 | 1;
  state: WraithState; time: number;
  /** Unit dash direction, locked when the tell starts. */
  dirX: number; dirY: number;
  /** Where the tell began; the dash path runs from here for WRAITH_DASH_LENGTH. */
  startX: number; startY: number;
  alive: boolean;
};
export const WRAITH_FLOOR = 100;
export const WRAITH_DRIFT_TIME = 1.6;
export const WRAITH_TELL_TIME = .9;
export const WRAITH_DASH_SPEED = 13;
export const WRAITH_DASH_TIME = .6;
export const WRAITH_DASH_LENGTH = WRAITH_DASH_SPEED * WRAITH_DASH_TIME;
export const WRAITH_FADE_TIME = .55;
export type FrenzyCrystal = { id: number; x: number; y: number; collected: boolean };
export type TowerEncounter = { kind: 'ice-shower' | 'crumble-rush'; timeLeft: number; duration: number };
export type ActionNotice = { label: string; detail: string; timeLeft: number };
export type TowerActionState = {
  icicles: FallingIcicle[]; bats: FrostBat[]; crystals: FrenzyCrystal[];
  /** Version 9 only, from WRAITH_FLOOR; always empty in races and older rules. */
  wraiths: FrostWraith[];
  /** Charge is normalized to 0..1 and earned only on fresh higher-floor landings. */
  frenzyTime: number; frenzyCharge: number; invulnerableTime: number;
  encounter: TowerEncounter | null; notice: ActionNotice | null;
  dodges: number; stomps: number; hits: number; frenzies: number;
};
export const freshTowerAction = (): TowerActionState => ({
  icicles: [], bats: [], crystals: [], wraiths: [], frenzyTime: 0, frenzyCharge: 0,
  invulnerableTime: 0, encounter: null, notice: null,
  dodges: 0, stomps: 0, hits: 0, frenzies: 0,
});
