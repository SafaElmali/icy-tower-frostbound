import { RaceHazards } from './race-hazards.ts';
import { CRUMBLE_DELAY, FRENZY_COMBO_TARGET, FRENZY_DURATION, ICICLE_WARNING_TIME, freshTowerAction, type CrumbleState, type TowerActionState } from './tower-action.ts';

export type GameStatus = 'ready' | 'playing' | 'paused' | 'over';
export type GameMode = 'arcade' | 'party' | 'practice';
export type RankedMode = Exclude<GameMode, 'practice'>;
export const MODE_LABELS = { arcade: 'Classic', party: 'Party', practice: 'Practice' } as const;
export const DOUBLE_JUMP_DURATION = 8;
export type Controls = { left: boolean; right: boolean; jump: boolean };
export type QuickChallenge = {
  id: 'combo' | 'crystals' | 'walls'; title: string; description: string;
  progress: number; target: number; status: 'active' | 'complete' | 'failed' | 'missed';
};
export type Platform = { floor?: number; route?: 'approach' | 'safe' | 'shortcut' | 'merge'; id: number; x: number; y: number; width: number; gem: boolean; collected: boolean; moving: boolean; spring: boolean; origin: number; phase: number; crumble?: CrumbleState };
export type GameEvent = { type: 'jump' | 'land' | 'gem' | 'combo' | 'wall' | 'over' | 'icicle-warning' | 'bat-warning' | 'crumble' | 'collapse' | 'hurt' | 'stomp' | 'dodge' | 'frenzy' | 'frenzy-end' | 'encounter' | 'combo-short'; x: number; y: number; value?: number; spinDirection?: number };
export type FailureEvidence = { kind: 'left-ledge'; floor: number } | { kind: 'frost-on-ledge' | 'fell' | 'frost' };
export const FLOOR_HEIGHT = 2.35;
export const WALL = 6.4;
export const STAGE_WIDTH = 13.6;
export const isStageFloor = (id: number) => id > 0 && id % 50 === 0;
export const CURRENT_RULES_VERSION = 9;
/** Version 9 combos continue only on jumps that climb at least this many floors. */
export const COMBO_MIN_JUMP = 2;
export const COMBO_MULTIPLIER_CAP = 10;
export const PACE_INTERVAL = 30;
export const platformFloor = (platform: Platform) => platform.floor ?? platform.id;
export const MAX_REPLAY_FRAMES = 216000;
export const MAX_REPLAY_SEGMENTS = 12000;
export type RunReplay = { seed: number; moves: [number, number][] } & ({ version: 1 | 2; mode?: never } | { version: 3 | 4 | 5 | 6 | 7 | 8 | 9; mode: RankedMode });
/** Every rules version this build can replay, including legacy leaderboard recordings. */
export const isRulesVersion = (value: unknown): value is RunReplay['version'] =>
  Number.isInteger(value) && (value as number) >= 1 && (value as number) <= CURRENT_RULES_VERSION;
export const replayMode = (replay: RunReplay): RankedMode => replay.mode ?? 'arcade';
export const freshControls = (): Controls => ({ left: false, right: false, jump: false });
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** Fixed-step arcade simulation. Rendering and input devices share this contract. */
export class TowerEngine {
  status: GameStatus = 'ready';
  mode: GameMode = 'arcade';
  x = 0; y = 0; vx = 0; vy = 0;
  grounded = true; standingId = 0; facing = 1;
  time = 0; maxY = 0; cameraY = 5.2; stormY = -8;
  floor = 0; score = 0; gems = 0; combo = 0; bestCombo = 0; comboTime = 0;
  wallJumps = 0;
  failureEvidence: FailureEvidence | null = null;
  private walkedOff: { floor: number; y: number } | null = null;
  private comboChallengeFloor = 0;
  private comboChallengeBroken = false;
  doubleJumpTime = 0;
  private doubleJumpUsed = false;
  platforms: Platform[] = [];
  events: GameEvent[] = [];
  action: TowerActionState = freshTowerAction();
  private nextActionId = 1;
  private icicleCooldown = 1.4;
  private batCooldown = 2;
  private crystalCooldown = 0;
  private nextEncounterFloor = 30;
  private encounterCount = 0;
  private breatherTime = 0;
  private introduced = new Set<string>();
  private encounterCrumbles = new Set<number>();
  seed: number;
  private state = 1;
  private nextId = 0;
  private lastPrimary!: Platform;
  private jumpBuffer = 0;
  private coyote = .12;
  private jumpWasDown = false;
  private accumulator = 0;
  private lastFloor = 0;
  /** Floor of the most recent landing; version 9 measures combo jumps from it. */
  private takeoffFloor = 0;
  private scrollStartedAt: number | null = null;
  private wallControlTime = 0;
  private lastWallJumpSide = 0;
  private replay: [number, number][] | null = [];
  private replayFrames = 0;
  private recordReplay: boolean;
  private _rulesVersion: RunReplay['version'];
  private raceStaticPlatforms = false;
  private raceHazards: RaceHazards | null = null;
  get rulesVersion() { return this._rulesVersion; }
  get showHazardWarnings() { return this.rulesVersion < 8 && !this.raceHazards; }
  constructor(seed = 73091, recordReplay = true, rulesVersion: RunReplay['version'] = CURRENT_RULES_VERSION) { this.seed = seed; this.recordReplay = recordReplay; this._rulesVersion = rulesVersion; this.resetWorld(); }
  get version() { return this.rulesVersion; }
  get pace() {
    const elapsed = this.scrollStartedAt === null ? 0 : Math.max(0, this.time - this.scrollStartedAt);
    const increases = Math.floor((elapsed + (this.rulesVersion >= 4 ? 1e-8 : 0)) / PACE_INTERVAL);
    const level = this.scrollStartedAt === null ? 0 : 1 + (this.rulesVersion >= 4 ? increases : Math.min(5, increases)) + this.difficultyTier(this.floor);
    return { level, speed: level === 0 ? 0 : .65 + (level - 1) * .4,
      nextIn: level === 0 || (this.rulesVersion < 4 && level === 6) ? null : clamp((increases + 1) * PACE_INTERVAL - elapsed, 0, PACE_INTERVAL) };
  }
  private difficultyTier(floor: number) { return this.rulesVersion >= 7 ? Math.floor(floor / 50) : 0; }
  private random() { this.state = (Math.imul(1664525, this.state) + 1013904223) >>> 0; return this.state / 4294967296; }
  private resetWorld() {
    this.state = this.seed; this.nextId = 0; this.platforms = [];
    this.platforms.push({ id: 0, x: 0, y: 0, width: STAGE_WIDTH, gem: false, collected: false, moving: false, spring: false, origin: 0, phase: 0 });
    this.lastPrimary = this.platforms[0];
    this.nextId = 1;
    this.generate(42);
  }
  private generate(top: number) {
    while (this.nextId * FLOOR_HEIGHT <= top) {
      const id = this.nextId++;
      // Keep the generation anchor separate from active collision/render ledges.
      // Its live position preserves legacy behavior when the last ledge moves.
      const previous = this.lastPrimary;
      const legacyWidth = id < 8 ? 3.7 : Math.max(2.45, 3.7 - id * .007) + this.random() * .5;
      // Generate each band by its own floor, even when it is visible before the
      // milestone landing. Keep enough width for ordinary momentum jumps.
      const normalWidth = Math.max(2.1, legacyWidth - this.difficultyTier(id) * .25);
      // Version 1 retains the original layout for already-recorded leaderboard runs.
      const stage = this.rulesVersion >= 2 && isStageFloor(id);
      // Four-floor route sections leave the first eleven floors and rest stages alone.
      const section = Math.floor(id / 12) * 12;
      const routeStep = id - section;
      const routeSection = this.rulesVersion >= 5 && section >= 12 && routeStep <= 3 &&
        ![section, section + 1, section + 2, section + 3].some(isStageFloor);
      const side = ((this.seed ^ (section / 12)) & 1) ? -1 : 1;
      const width = stage ? STAGE_WIDTH : routeSection ? 3.7 : normalWidth;
      // Neighboring ledges always overlap the base jump's reachable horizontal range.
      const offset = (this.random() > .5 ? 1 : -1) * (1.5 + this.random() * 2.3);
      const x = stage ? 0 : routeSection ? (routeStep === 3 ? 0 : side * 2.35) : clamp(previous.x + offset, -5.9 + width / 2, 5.9 - width / 2);
      this.platforms.push({ id, x, y: id * FLOOR_HEIGHT, width, gem: routeSection ? false : id % 3 === 0, collected: false, moving: !this.raceStaticPlatforms && !stage && !routeSection && id > 24 && id % 7 === 0, spring: this.mode === 'party' && !stage && !routeSection && id % 5 === 0, origin: x, phase: this.random() * Math.PI * 2,
        ...(routeSection ? { route: routeStep === 0 ? 'approach' as const : routeStep === 3 ? 'merge' as const : 'safe' as const } : {}) });
      this.lastPrimary = this.platforms[this.platforms.length - 1];
      if (this.rulesVersion >= 6 && id >= 8 && id % 8 === 0 && !stage && !routeSection && !this.lastPrimary.moving && !this.lastPrimary.spring && !this.restFloor(id)) {
        this.lastPrimary.crumble = { remaining: null, broken: false };
      }
      if (routeSection && routeStep === 2) {
        // An optional narrow crystal ledge two floors above the takeoff rewards a
        // running jump. Negative IDs are stable render identities, never scores.
        const shortcutX = -side * 2.35;
        this.platforms.push({ id: -id - 1, floor: id, route: 'shortcut', x: shortcutX, y: id * FLOOR_HEIGHT, width: 1.8, gem: true, collected: false, moving: false, spring: false, origin: shortcutX, phase: 0 });
      }
    }
  }
  start(mode: GameMode = 'arcade', seed = this.seed, rulesVersion: RunReplay['version'] = this.rulesVersion) {
    this._rulesVersion = rulesVersion;
    if (mode === 'party' && this.rulesVersion < 3) throw new Error('Party mode requires current replay rules.');
    this.replay = []; this.replayFrames = 0;
    this.seed = seed; this.mode = mode; this.status = 'playing';
    this.x = this.y = this.vx = this.vy = this.time = this.maxY = this.floor = this.score = this.gems = this.combo = this.bestCombo = this.comboTime = this.lastFloor = this.takeoffFloor = 0;
    this.cameraY = 5.2; this.stormY = -8; this.facing = 1; this.grounded = true; this.standingId = 0;
    this.wallJumps = this.comboChallengeFloor = 0; this.comboChallengeBroken = false;
    this.failureEvidence = null; this.walkedOff = null;
    this.accumulator = this.jumpBuffer = 0; this.coyote = .12; this.jumpWasDown = false; this.events = []; this.scrollStartedAt = null;
    this.doubleJumpTime = 0; this.doubleJumpUsed = false;
    this.wallControlTime = 0; this.lastWallJumpSide = 0;
    this.action = freshTowerAction(); this.nextActionId = 1;
    this.icicleCooldown = 1.4; this.batCooldown = 2; this.crystalCooldown = 0;
    this.nextEncounterFloor = 30; this.encounterCount = 0; this.breatherTime = 0;
    this.introduced.clear(); this.encounterCrumbles.clear();
    this.resetWorld();
  }
  /** Isolated physics forecast for AI input planning; never records or mutates the live run. */
  preview() {
    const copy = new TowerEngine(this.seed, false, this.rulesVersion);
    Object.assign(copy, structuredClone(this));
    copy.recordReplay = false;
    copy.replay = null;
    copy.events = [];
    return copy;
  }
  togglePause() {
    if (this.status === 'playing' && this.recordReplay && this.replay) {
      if (this.replay.length >= MAX_REPLAY_SEGMENTS) this.replay = null;
      else this.replay.push([0, 8]);
    }
    if (this.status === 'playing') this.status = 'paused';
    else if (this.status === 'paused') this.status = 'playing';
    this.jumpBuffer = this.accumulator = 0; this.jumpWasDown = false;
  }
  /** Opt-in race rules never change the motion of an existing solo replay. */
  useStaticRacePlatforms() {
    this.raceStaticPlatforms = true;
    for (const platform of this.platforms) {
      platform.moving = false;
      platform.x = platform.origin;
    }
  }
  /** Race weather uses its own frame clock and never enables solo action rules. */
  useRaceHazards() { this.raceHazards = new RaceHazards(); }
  advanceRaceHazards(frame: number) {
    this.action.invulnerableTime = Math.max(0, this.action.invulnerableTime - 1 / 120);
    if (this.action.invulnerableTime < 1e-8) this.action.invulnerableTime = 0;
    this.raceHazards?.advance(this.action, this.seed, frame, this.cameraY, this.events);
  }
  /** The race owns checkpoint snapshots, including ledges already pruned by the camera. */
  respawnRace(checkpoint: Platform, nearby: readonly Platform[]) {
    const present = new Set(this.platforms.map(platform => platform.id));
    for (const platform of [checkpoint, ...nearby]) {
      if (present.has(platform.id)) continue;
      this.platforms.push({ ...platform });
      present.add(platform.id);
    }
    this.status = 'playing';
    this.x = checkpoint.x;
    this.takeoffFloor = platformFloor(checkpoint);
    this.settleRace(checkpoint);
    this.cameraY = Math.max(5.2, checkpoint.y + 2.2);
    this.stormY = checkpoint.y - 8;
    this.scrollStartedAt = this.time;
    this.failureEvidence = this.walkedOff = null;
    this.combo = this.comboTime = this.doubleJumpTime = 0;
    this.accumulator = this.jumpBuffer = this.wallControlTime = 0;
    this.coyote = .12;
    this.jumpWasDown = this.doubleJumpUsed = false;
    this.lastWallJumpSide = 0;
    this.events = [];
  }
  /** A fixed server-approved impulse; no client-selected strength is accepted. */
  applyRacePush(direction: -1 | 1) {
    this.vx = direction * 7.5;
    this.vy = Math.max(this.vy, 2.6);
    this.facing = direction;
    this.grounded = false;
    this.standingId = -1;
    this.coyote = this.jumpBuffer = 0;
    this.wallControlTime = .18;
    this.walkedOff = null;
  }
  /** Keep a finished climber resting on a visible ledge, rather than suspended in a jump. */
  settleRace(platform: Platform) {
    this.x = clamp(this.x, platform.x - platform.width / 2 + .25, platform.x + platform.width / 2 - .25);
    this.y = platform.y;
    this.vx = this.vy = 0;
    this.grounded = true;
    this.standingId = platform.id;
  }
  menu() { this.status = 'ready'; this.start(this.mode); this.status = 'ready'; }
  tick(dt: number, input: Controls) {
    if (this.status !== 'playing') return;
    this.accumulator += clamp(dt, 0, .1);
    const step = 1 / 120;
    while (this.accumulator >= step && this.status === 'playing') { this.step(step, input); this.accumulator -= step; }
  }
  private emit(type: GameEvent['type'], value?: number, spinDirection?: number) { this.events.push({ type, x: this.x, y: this.y, value, ...(spinDirection === undefined ? {} : { spinDirection }) }); }
  private step(dt: number, input: Controls) {
    if (this.recordReplay && this.mode !== 'practice' && this.replay) {
      const mask = Number(input.left) | (Number(input.right) << 1) | (Number(input.jump) << 2);
      const last = this.replay[this.replay.length - 1];
      if (++this.replayFrames > MAX_REPLAY_FRAMES || (last?.[1] !== mask && this.replay.length >= MAX_REPLAY_SEGMENTS)) this.replay = null;
      else if (last?.[1] === mask) last[0]++;
      else this.replay.push([1, mask]);
    }
    this.time += dt;
    this.wallControlTime = Math.max(0, this.wallControlTime - dt);
    this.doubleJumpTime = Math.max(0, this.doubleJumpTime - dt);
    this.comboTime = Math.max(0, this.comboTime - dt);
    if (this.comboTime === 0) {
      if (this.combo > 0 && this.comboChallengeFloor < 30) this.comboChallengeBroken = true;
      this.combo = 0;
      if (this.rulesVersion >= 6) this.action.frenzyCharge = 0;
    }
    if (this.rulesVersion >= 6) this.advanceAction(dt);
    const jumpPressed = input.jump && !this.jumpWasDown;
    if (jumpPressed) this.jumpBuffer = .16;
    this.jumpWasDown = input.jump;
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.coyote = this.grounded ? .12 : Math.max(0, this.coyote - dt);
    for (const p of this.platforms) {
      if (!p.moving) continue;
      const old = p.x;
      p.x = clamp(p.origin + Math.sin(this.time * .7 + p.phase) * .65, -5.4 + p.width / 2, 5.4 - p.width / 2);
      if (this.grounded && this.standingId === p.id) this.x += p.x - old;
    }
    // Preserve the push away even if the incoming direction is briefly held.
    const requestedDirection = Number(input.right) - Number(input.left);
    const direction = this.wallControlTime > 0 && requestedDirection === -Math.sign(this.vx) ? 0 : requestedDirection;
    if (direction) {
      this.vx += direction * (this.grounded ? 23 : 17) * dt;
      this.facing = direction;
    } else if (this.wallControlTime === 0) this.vx *= Math.exp(-(this.grounded ? 4.5 : .8) * dt);
    this.vx = clamp(this.vx, -8.4, 8.4);
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.vy = (12.6 + Math.abs(this.vx) * .47) * this.jumpMultiplier;
      this.grounded = false; this.coyote = 0; this.jumpBuffer = 0; this.standingId = -1;
      this.walkedOff = null;
      this.emit('jump', this.vx);
    } else if (this.rulesVersion >= 4 && this.jumpBuffer > 0 && !this.grounded && Math.abs(this.x) >= WALL - .28 - .2 && Math.sign(this.x) !== this.lastWallJumpSide) {
      // One boost per wall until landing or jumping from the opposite wall.
      this.lastWallJumpSide = Math.sign(this.x);
      this.vx = -this.lastWallJumpSide * 7;
      this.vy = 15.9 * this.jumpMultiplier; this.facing = -this.lastWallJumpSide;
      this.coyote = this.jumpBuffer = 0; this.standingId = -1; this.wallControlTime = .18;
      this.walkedOff = null;
      this.wallJumps++; this.emit('wall'); this.emit('jump', this.vx, this.facing);
    } else if (jumpPressed && !this.grounded && this.mode === 'party' && this.doubleJumpTime > 0 && !this.doubleJumpUsed) {
      this.vy = (12.6 + Math.abs(this.vx) * .47) * this.jumpMultiplier;
      this.doubleJumpUsed = true; this.jumpBuffer = 0;
      this.walkedOff = null;
      this.emit('jump', this.vx, Math.sign(this.vx) || this.facing);
    }
    const oldY = this.y;
    this.x += this.vx * dt;
    if (Math.abs(this.x) > WALL - .28) {
      this.x = Math.sign(this.x) * (WALL - .28);
      if (Math.abs(this.vx) > 4) {
        this.vx *= -.83; this.emit('wall', undefined, this.grounded ? undefined : Math.sign(this.vx));
        if (!this.grounded) this.wallJumps++;
      }
      else this.vx = 0;
    }
    if (this.grounded) {
      const p = this.platforms.find(p => p.id === this.standingId);
      if (!p || (this.rulesVersion >= 6 && p.crumble?.broken) || Math.abs(this.x - p.x) > p.width / 2 + .15) {
        this.walkedOff = p ? { floor: platformFloor(p), y: p.y } : null;
        this.grounded = false; this.standingId = -1;
      }
    }
    if (!this.grounded) {
      this.vy -= (this.mode === 'party' ? 15 : 23) * dt;
      this.y += this.vy * dt;
      if (this.vy <= 0) {
        let landing: Platform | undefined;
        for (const p of this.platforms) {
          if (this.rulesVersion >= 6 && p.crumble?.broken) continue;
          if (oldY >= p.y - .015 && this.y <= p.y && Math.abs(this.x - p.x) < p.width / 2 + .2 && (!landing || p.y > landing.y)) landing = p;
        }
        if (landing) {
          this.y = landing.y; this.vy = 0; this.grounded = true; this.standingId = landing.id;
          this.walkedOff = null;
          this.doubleJumpUsed = false;
          this.lastWallJumpSide = 0; this.wallControlTime = 0;
          this.emit('land');
          const landedFloor = platformFloor(landing);
          const jumpFloors = landedFloor - this.takeoffFloor;
          this.takeoffFloor = landedFloor;
          if (landedFloor > this.lastFloor) {
            const climbed = landedFloor - this.lastFloor;
            if (this.rulesVersion >= 9 && jumpFloors < COMBO_MIN_JUMP) {
              // A one-floor hop still earns its floors, but ends the chain and
              // the unbroken-ascent challenge, even before a chain has started.
              if (this.comboChallengeFloor < 30) this.comboChallengeBroken = true;
              if (this.combo > 0) this.emit('combo-short', this.combo);
              this.combo = this.comboTime = this.action.frenzyCharge = 0;
              this.score += climbed * 100;
            } else {
              this.combo = this.comboTime > 0 ? this.combo + climbed : climbed;
              this.comboTime = 3.8;
              this.bestCombo = Math.max(this.bestCombo, this.combo);
              const multiplier = Math.max(1, Math.floor(this.combo / 5) + 1);
              this.score += climbed * 100 * (this.rulesVersion >= 9 ? Math.min(COMBO_MULTIPLIER_CAP, multiplier) : multiplier);
              if (this.combo >= 3) this.emit('combo', this.combo);
              if (this.rulesVersion >= 6) this.chargeFrenzy(climbed);
            }
            this.lastFloor = landedFloor;
          }
          const previousTier = this.difficultyTier(this.floor);
          this.floor = Math.max(this.floor, landedFloor);
          if (!this.comboChallengeBroken) this.comboChallengeFloor = Math.min(30, this.floor);
          if (this.rulesVersion >= 6) this.armCrumble(landing);
          const tier = this.difficultyTier(this.floor);
          if (tier > previousTier) this.notice(`FLOOR ${tier * 50} · HARDER AHEAD`, this.mode === 'practice' ? 'Narrower ledges ahead. Line up your landings!' : 'Faster frost and narrower ledges. Keep climbing!', 4);
          if (landing.spring) {
            this.vy = (19 + Math.abs(this.vx) * .25) * this.jumpMultiplier;
            this.grounded = false; this.standingId = -1; this.coyote = 0; this.jumpBuffer = 0;
            this.emit('jump', this.vx);
          }
        }
      }
    }
    if (this.rulesVersion >= 6 || this.raceHazards) this.collideAction(oldY);
    for (const p of this.platforms) {
      if (this.rulesVersion >= 6 && p.crumble?.broken) continue;
      if (p.gem && !p.collected && Math.abs(this.x - p.x) < .85 && Math.abs(this.y + .7 - (p.y + 1.05)) < 1) {
        p.collected = true; this.gems++; this.score += 250; this.emit('gem');
        if (this.mode === 'party') this.doubleJumpTime = DOUBLE_JUMP_DURATION;
      }
    }
    this.maxY = Math.max(this.maxY, this.y);
    if (this.mode !== 'practice' && this.scrollStartedAt === null && this.maxY >= 5 * FLOOR_HEIGHT) this.scrollStartedAt = this.time;
    const scrollStep = this.pace.speed * dt;
    const followY = Math.max(5.2, this.y + 2.2);
    // Let a fall reveal lower ledges, while standing still lets the tower scroll
    // past the player. The frost keeps advancing independently of camera recovery.
    this.cameraY = !this.grounded && this.vy < 0
      ? Math.min(this.cameraY + scrollStep, followY)
      : Math.max(this.cameraY + scrollStep, followY);
    this.stormY = Math.max(this.stormY + scrollStep, this.cameraY - 12.5);
    this.generate(this.cameraY + 23);
    this.platforms = this.platforms.filter(p => p.y > this.cameraY - 22 || p.id === this.standingId);
    if (this.y < this.stormY + .05) {
      // Observations only: do not infer intended targets or blame an ambiguous miss.
      this.failureEvidence = this.grounded ? { kind: 'frost-on-ledge' }
        : this.walkedOff && this.y < this.walkedOff.y - .1
          ? { kind: 'left-ledge', floor: this.walkedOff.floor }
          : this.vy < 0 ? { kind: 'fell' } : { kind: 'frost' };
      this.status = 'over'; this.emit('over');
    }
  }
  private get jumpMultiplier() { return this.rulesVersion >= 6 && this.action.frenzyTime > 0 ? 1.14 : 1; }
  private restFloor(floor: number) { return floor >= 48 && (floor % 50 <= 2 || floor % 50 >= 48); }
  private notice(label: string, detail: string, timeLeft = 3) { this.action.notice = { label, detail, timeLeft }; }
  private introduce(key: string, label: string, detail: string) {
    if (this.introduced.has(key)) return;
    this.introduced.add(key); this.notice(label, detail, 3.6);
  }
  private armCrumble(platform: Platform) {
    if (!platform.crumble || platform.crumble.broken || platform.crumble.remaining !== null) return;
    platform.crumble.remaining = CRUMBLE_DELAY;
    this.events.push({ type: 'crumble', x: platform.x, y: platform.y });
    this.introduce('crumble', 'CRACKED ICE', 'This ledge breaks in a second. Keep jumping!');
  }
  private chargeFrenzy(climbed: number) {
    // A still-large combo cannot retrigger frenzy on every frame. Only fresh
    // higher-floor landings after a frenzy have ended earn another charge.
    if (this.action.frenzyTime > 0) return;
    this.action.frenzyCharge = Math.min(1, this.action.frenzyCharge + climbed / FRENZY_COMBO_TARGET);
    if (this.combo < FRENZY_COMBO_TARGET || this.action.frenzyCharge < 1 - 1e-8) return;
    this.action.frenzyCharge = 0; this.action.frenzyTime = FRENZY_DURATION;
    this.action.frenzies++; this.crystalCooldown = 0;
    this.notice('COMBO FRENZY', 'Six seconds of boosted jumps. Follow the crystal trail!', FRENZY_DURATION);
    this.emit('frenzy');
  }
  private endEncounter() {
    this.action.encounter = null; this.breatherTime = this.rulesVersion >= 8 ? 6 : 12;
    this.action.icicles = []; this.action.bats = [];
    for (const p of this.platforms) {
      if (this.encounterCrumbles.has(p.id) && p.crumble?.remaining === null) delete p.crumble;
    }
    this.encounterCrumbles.clear();
    this.notice('CATCH YOUR BREATH', 'Clear skies ahead. Build your next combo.');
  }
  private advanceAction(dt: number) {
    const action = this.action;
    const intense = this.rulesVersion >= 8;
    const pressure = intense ? 1 + Math.min(5, this.difficultyTier(this.floor)) * .15 : 1;
    action.invulnerableTime = Math.max(0, action.invulnerableTime - dt);
    if (action.notice) {
      action.notice.timeLeft -= dt;
      if (action.notice.timeLeft <= 0) action.notice = null;
    }
    const wasFrenzy = action.frenzyTime > 0;
    action.frenzyTime = Math.max(0, action.frenzyTime - dt);
    if (wasFrenzy && action.frenzyTime === 0) this.emit('frenzy-end');
    for (const p of this.platforms) {
      if (this.grounded && this.standingId === p.id && p.crumble?.remaining === null) { this.armCrumble(p); continue; }
      if (!p.crumble || p.crumble.broken || p.crumble.remaining === null) continue;
      p.crumble.remaining = Math.max(0, p.crumble.remaining - dt);
      if (p.crumble.remaining < 1e-8) {
        p.crumble.remaining = 0; p.crumble.broken = true;
        this.events.push({ type: 'collapse', x: p.x, y: p.y });
      }
    }
    const inRest = this.restFloor(Math.floor(this.y / FLOOR_HEIGHT)) || this.restFloor(this.floor);
    this.breatherTime = Math.max(0, this.breatherTime - dt);
    if (action.encounter) {
      action.encounter.timeLeft -= dt;
      if (action.encounter.timeLeft <= 0 || inRest) this.endEncounter();
    }
    if (!inRest && !action.encounter && this.breatherTime === 0 && this.floor >= this.nextEncounterFloor) {
      const kind = this.encounterCount++ % 2 === 0 ? 'ice-shower' : 'crumble-rush';
      action.encounter = { kind, timeLeft: 6, duration: 6 };
      this.nextEncounterFloor = this.floor + 24;
      action.icicles = []; action.bats = [];
      this.icicleCooldown = .65;
      this.notice(kind === 'ice-shower' ? 'ICE SHOWER' : 'CRUMBLE RUSH', kind === 'ice-shower' ? (intense ? 'Falling ice ahead. Keep moving!' : 'Watch each marked lane. There is always room to dodge.') : 'Cracked stairs ahead. Land, then leap again!', 4);
      this.emit('encounter', kind === 'ice-shower' ? 1 : 2);
    }
    if (action.encounter?.kind === 'crumble-rush') {
      // Keep moving ledges, springboards, rest stages and the broad safe route
      // intact. Only the next four ordinary ledges become temporary cracks.
      for (const p of this.platforms) {
        const floor = platformFloor(p);
        if (this.encounterCrumbles.size >= 4) break;
        if (floor <= this.floor || floor > this.floor + 6 || p.crumble || p.route || p.moving || p.spring || this.restFloor(floor)) continue;
        p.crumble = { remaining: null, broken: false }; this.encounterCrumbles.add(p.id);
      }
    }
    if (inRest) { action.icicles = []; action.bats = []; }
    const standing = this.grounded ? this.platforms.find(p => p.id === this.standingId) : undefined;
    const canThreaten = !inRest && this.breatherTime === 0 && !standing?.crumble && action.invulnerableTime === 0;
    if (this.floor >= 12) this.icicleCooldown = Math.max(0, this.icicleCooldown - dt);
    if (this.floor >= 20) this.batCooldown = Math.max(0, this.batCooldown - dt);
    const shower = action.encounter?.kind === 'ice-shower';
    if (canThreaten && this.floor >= 12 && this.icicleCooldown === 0 && (intense ? action.icicles.length < 2 : !action.bats.length && !action.icicles.length) && action.encounter?.kind !== 'crumble-rush') {
      // Capture the lane once: falling shards never track the player's movement.
      const spawnY = Math.max(this.y + 7, this.cameraY + 5);
      const x = clamp(this.x, -5.6, 5.6);
      action.icicles.push({ id: this.nextActionId++, x, y: spawnY, spawnY, targetY: this.y, state: intense ? 'falling' : 'warning', warningTime: intense ? 0 : ICICLE_WARNING_TIME + dt, vy: intense ? -5 : 0, nearMiss: false });
      this.icicleCooldown = intense ? (shower ? 1.5 : 3.5) / pressure : shower ? 2.5 : 7;
      this.events.push({ type: 'icicle-warning', x, y: spawnY });
      this.introduce('icicle', 'LOOK UP!', intense ? 'Dodge falling ice. Keep moving between landings.' : 'The marked lane will fall. Move aside before it flashes.');
    }
    if (canThreaten && this.floor >= 20 && this.batCooldown === 0 && (intense ? action.bats.length < 2 : !action.icicles.length && !action.bats.length) && (!action.encounter || (intense && shower))) {
      const side = ((this.seed ^ this.nextActionId) & 1) ? 1 : -1;
      const originX = side * (WALL + .7), originY = this.y + 1.8;
      action.bats.push({ id: this.nextActionId++, x: originX, y: originY, originX, originY, phase: 0, alive: true, warningTime: intense ? 0 : .85 + dt });
      this.batCooldown = intense ? 5.5 / pressure : 11;
      this.events.push({ type: 'bat-warning', x: side * 5.5, y: originY });
      this.introduce('bat', 'FROST BAT', 'Dodge its wings or land on top for a bonus bounce.');
    }
    for (const icicle of action.icicles) {
      if (icicle.state === 'warning') {
        icicle.warningTime = Math.max(0, icicle.warningTime - dt);
        if (icicle.warningTime < 1e-8) { icicle.warningTime = 0; icicle.state = 'falling'; icicle.vy = -5; }
      } else { icicle.vy -= 28 * dt; icicle.y += icicle.vy * dt; }
    }
    for (const bat of action.bats) {
      if (bat.warningTime > 0) bat.warningTime = Math.max(0, bat.warningTime - dt);
      else {
        bat.phase += dt;
        bat.x = bat.originX - Math.sign(bat.originX) * bat.phase * 2.8;
        bat.y = bat.originY + Math.sin(bat.phase * 3) * .28;
      }
    }
    if (action.frenzyTime > 0) {
      this.crystalCooldown -= dt;
      if (this.crystalCooldown <= 0 && action.crystals.length < 16) {
        this.crystalCooldown = .6;
        const x = clamp(this.x + Math.sin(this.time * 2.7) * 1.05, -5.6, 5.6);
        action.crystals.push({ id: this.nextActionId++, x, y: this.y + 2.3, collected: false });
      }
    }
    action.icicles = action.icicles.filter(i => i.y > this.cameraY - 14 && i.y > i.targetY - 12).slice(-2);
    action.bats = action.bats.filter(b => b.alive && b.phase < 5.5 && b.y > this.cameraY - 12 && b.y < this.cameraY + 14).slice(intense ? -2 : -1);
    action.crystals = action.crystals.filter(c => !c.collected && c.y > this.cameraY - 12 && c.y < this.cameraY + 18).slice(-16);
  }
  private hurt(sourceX: number) {
    if (this.action.invulnerableTime > 0) return;
    this.action.hits++; this.action.invulnerableTime = 1.65;
    this.vx = (Math.sign(this.x - sourceX) || -this.facing) * 5;
    this.vy = Math.max(9.2, this.vy);
    this.grounded = false; this.standingId = -1; this.coyote = this.jumpBuffer = 0;
    this.wallControlTime = .22; this.walkedOff = null;
    this.combo = this.comboTime = this.action.frenzyCharge = 0;
    if (this.comboChallengeFloor < 30) this.comboChallengeBroken = true;
    this.emit('hurt');
  }
  private collideAction(oldY: number) {
    const action = this.action;
    for (const icicle of action.icicles) {
      if (icicle.state !== 'falling') continue;
      const dx = Math.abs(this.x - icicle.x);
      // Include the previous tip position to avoid tunneling at high velocity.
      const previousY = icicle.y - icicle.vy / 120;
      if (dx < .6 && icicle.y <= this.y + 1.45 && previousY >= this.y) {
        this.hurt(icicle.x); this.raceHazards?.consume(icicle.id); icicle.y = this.cameraY - 20;
      } else if (!icicle.nearMiss && icicle.y < this.y && previousY >= this.y && dx >= .6 && dx < 2.2) {
        icicle.nearMiss = true; action.dodges++; this.score += 75; this.emit('dodge', 75);
      }
    }
    for (const bat of action.bats) {
      if (!bat.alive || bat.warningTime > 0 || Math.abs(this.x - bat.x) >= .75) continue;
      if (this.vy < 0 && oldY >= bat.y + .18 && this.y <= bat.y + .35) {
        bat.alive = false; this.raceHazards?.consume(bat.id); action.stomps++; this.score += 350;
        this.y = bat.y + .35; this.vy = 17.6 * this.jumpMultiplier;
        this.grounded = false; this.standingId = -1; this.coyote = this.jumpBuffer = 0;
        this.doubleJumpUsed = false; this.lastWallJumpSide = 0; this.walkedOff = null;
        this.comboTime = Math.max(this.comboTime, 2);
        this.emit('stomp', 350); this.emit('jump', this.vx);
      } else if (Math.abs(this.y + .7 - bat.y) < .85) this.hurt(bat.x);
    }
    for (const crystal of action.crystals) {
      if (crystal.collected || Math.abs(this.x - crystal.x) >= .8 || Math.abs(this.y + .7 - crystal.y) >= .9) continue;
      crystal.collected = true; this.gems++; this.score += 250; this.emit('gem', 250);
      if (this.mode === 'party') this.doubleJumpTime = DOUBLE_JUMP_DURATION;
    }
  }
  drainEvents() { const e = this.events; this.events = []; return e; }
  getReplay(): RunReplay | null {
    if (this.status !== 'over' || this.mode === 'practice' || !this.replay || this.floor < 1) return null;
    return this.getRecording();
  }
  /** Live race finishes also need an input recording at the goal or time limit. */
  getRecording(): RunReplay | null {
    if (this.mode === 'practice' || !this.replay) return null;
    const recording = { seed: this.seed, moves: this.replay.map(([frames, mask]): [number, number] => [frames, mask]) };
    return this.rulesVersion === 1 || this.rulesVersion === 2 ? { ...recording, version: this.rulesVersion } : { ...recording, version: this.rulesVersion, mode: this.mode };
  }
  snapshot() {
    const challenge = (id: QuickChallenge['id'], title: string, description: string, progress: number, target: number, failed = false): QuickChallenge => ({
      id, title, description, progress: Math.min(progress, target), target,
      status: progress >= target ? 'complete' : failed ? 'failed' : this.status === 'over' ? 'missed' : 'active',
    });
    const challenges = [
      challenge('combo', 'Unbroken ascent', this.rulesVersion >= 9 ? 'Reach floor 30 without breaking your combo. Every landing must climb at least two floors.' : 'Reach floor 30 without breaking your combo. Keep the chain alive from your first higher-floor landing.', this.comboChallengeFloor, 30, this.comboChallengeBroken),
      challenge('crystals', 'Crystal collector', 'Collect 10 crystals in one run.', this.gems, 10),
      challenge('walls', 'Wall jumper', 'Perform 5 wall jumps in one run. Hit a wall at speed or tap jump beside it while airborne.', this.wallJumps, 5),
    ];
    return { status: this.status, mode: this.mode, rulesVersion: this.rulesVersion, score: this.score, floor: this.floor, height: Math.floor(this.maxY * 3), combo: this.combo, comboTime: this.comboTime, bestCombo: this.bestCombo, gems: this.gems, time: this.time, pace: this.pace, speed: Math.abs(this.vx), stormDistance: this.y - this.stormY, wallJumps: this.wallJumps, challenges, doubleJumpTime: this.doubleJumpTime, doubleJumpReady: this.doubleJumpTime > 0 && !this.doubleJumpUsed, failureEvidence: this.failureEvidence, action: { ...this.action, icicles: this.action.icicles.map(i => ({ ...i })), bats: this.action.bats.map(b => ({ ...b })), crystals: this.action.crystals.map(c => ({ ...c })), encounter: this.action.encounter ? { ...this.action.encounter } : null, notice: this.action.notice ? { ...this.action.notice } : null } };
  }
}
export type Snapshot = ReturnType<TowerEngine['snapshot']>;
