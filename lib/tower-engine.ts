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
export type Platform = { floor?: number; route?: 'approach' | 'safe' | 'shortcut' | 'merge'; id: number; x: number; y: number; width: number; gem: boolean; collected: boolean; moving: boolean; spring: boolean; origin: number; phase: number };
export type GameEvent = { type: 'jump' | 'land' | 'gem' | 'combo' | 'wall' | 'over'; x: number; y: number; value?: number };
export type FailureEvidence = { kind: 'left-ledge'; floor: number } | { kind: 'frost-on-ledge' | 'fell' | 'frost' };
export const FLOOR_HEIGHT = 2.35;
export const WALL = 6.4;
export const STAGE_WIDTH = 13.6;
export const isStageFloor = (id: number) => id > 0 && id % 50 === 0;
export const CURRENT_RULES_VERSION = 5;
export const PACE_INTERVAL = 30;
export const platformFloor = (platform: Platform) => platform.floor ?? platform.id;
export const MAX_REPLAY_FRAMES = 216000;
export const MAX_REPLAY_SEGMENTS = 12000;
export type RunReplay = { seed: number; moves: [number, number][] } & ({ version: 1 | 2; mode?: never } | { version: 3 | 4 | 5; mode: RankedMode });
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
  seed: number;
  private state = 1;
  private nextId = 0;
  private lastPrimary!: Platform;
  private jumpBuffer = 0;
  private coyote = .12;
  private jumpWasDown = false;
  private accumulator = 0;
  private lastFloor = 0;
  private scrollStartedAt: number | null = null;
  private wallControlTime = 0;
  private lastWallJumpSide = 0;
  private replay: [number, number][] | null = [];
  private replayFrames = 0;
  private recordReplay: boolean;
  private _rulesVersion: RunReplay['version'];
  get rulesVersion() { return this._rulesVersion; }
  constructor(seed = 73091, recordReplay = true, rulesVersion: RunReplay['version'] = CURRENT_RULES_VERSION) { this.seed = seed; this.recordReplay = recordReplay; this._rulesVersion = rulesVersion; this.resetWorld(); }
  get version() { return this.rulesVersion; }
  get pace() {
    const elapsed = this.scrollStartedAt === null ? 0 : Math.max(0, this.time - this.scrollStartedAt);
    const increases = Math.floor((elapsed + (this.rulesVersion >= 4 ? 1e-8 : 0)) / PACE_INTERVAL);
    const level = this.scrollStartedAt === null ? 0 : 1 + (this.rulesVersion >= 4 ? increases : Math.min(5, increases));
    return { level, speed: level === 0 ? 0 : .65 + (level - 1) * .4,
      nextIn: level === 0 || (this.rulesVersion < 4 && level === 6) ? null : clamp((increases + 1) * PACE_INTERVAL - elapsed, 0, PACE_INTERVAL) };
  }
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
      const normalWidth = id < 8 ? 3.7 : Math.max(2.45, 3.7 - id * .007) + this.random() * .5;
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
      this.platforms.push({ id, x, y: id * FLOOR_HEIGHT, width, gem: routeSection ? false : id % 3 === 0, collected: false, moving: !stage && !routeSection && id > 24 && id % 7 === 0, spring: this.mode === 'party' && !stage && !routeSection && id % 5 === 0, origin: x, phase: this.random() * Math.PI * 2,
        ...(routeSection ? { route: routeStep === 0 ? 'approach' as const : routeStep === 3 ? 'merge' as const : 'safe' as const } : {}) });
      this.lastPrimary = this.platforms[this.platforms.length - 1];
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
    this.x = this.y = this.vx = this.vy = this.time = this.maxY = this.floor = this.score = this.gems = this.combo = this.bestCombo = this.comboTime = this.lastFloor = 0;
    this.cameraY = 5.2; this.stormY = -8; this.facing = 1; this.grounded = true; this.standingId = 0;
    this.wallJumps = this.comboChallengeFloor = 0; this.comboChallengeBroken = false;
    this.failureEvidence = null; this.walkedOff = null;
    this.accumulator = this.jumpBuffer = 0; this.coyote = .12; this.jumpWasDown = false; this.events = []; this.scrollStartedAt = null;
    this.doubleJumpTime = 0; this.doubleJumpUsed = false;
    this.wallControlTime = 0; this.lastWallJumpSide = 0;
    this.resetWorld();
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
  menu() { this.status = 'ready'; this.start(this.mode); this.status = 'ready'; }
  tick(dt: number, input: Controls) {
    if (this.status !== 'playing') return;
    this.accumulator += clamp(dt, 0, .1);
    const step = 1 / 120;
    while (this.accumulator >= step && this.status === 'playing') { this.step(step, input); this.accumulator -= step; }
  }
  private emit(type: GameEvent['type'], value?: number) { this.events.push({ type, x: this.x, y: this.y, value }); }
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
    }
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
      this.vy = 12.6 + Math.abs(this.vx) * .47;
      this.grounded = false; this.coyote = 0; this.jumpBuffer = 0; this.standingId = -1;
      this.walkedOff = null;
      this.emit('jump', this.vx);
    } else if (this.rulesVersion >= 4 && this.jumpBuffer > 0 && !this.grounded && Math.abs(this.x) >= WALL - .28 - .2 && Math.sign(this.x) !== this.lastWallJumpSide) {
      // One boost per wall until landing or jumping from the opposite wall.
      this.lastWallJumpSide = Math.sign(this.x);
      this.vx = -this.lastWallJumpSide * 7;
      this.vy = 15.9; this.facing = -this.lastWallJumpSide;
      this.coyote = this.jumpBuffer = 0; this.standingId = -1; this.wallControlTime = .18;
      this.walkedOff = null;
      this.wallJumps++; this.emit('wall'); this.emit('jump', this.vx);
    } else if (jumpPressed && !this.grounded && this.mode === 'party' && this.doubleJumpTime > 0 && !this.doubleJumpUsed) {
      this.vy = 12.6 + Math.abs(this.vx) * .47;
      this.doubleJumpUsed = true; this.jumpBuffer = 0;
      this.walkedOff = null;
      this.emit('jump', this.vx);
    }
    const oldY = this.y;
    this.x += this.vx * dt;
    if (Math.abs(this.x) > WALL - .28) {
      this.x = Math.sign(this.x) * (WALL - .28);
      if (Math.abs(this.vx) > 4) {
        this.vx *= -.83; this.emit('wall');
        if (!this.grounded) this.wallJumps++;
      }
      else this.vx = 0;
    }
    if (this.grounded) {
      const p = this.platforms.find(p => p.id === this.standingId);
      if (!p || Math.abs(this.x - p.x) > p.width / 2 + .15) {
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
          if (oldY >= p.y - .015 && this.y <= p.y && Math.abs(this.x - p.x) < p.width / 2 + .2 && (!landing || p.y > landing.y)) landing = p;
        }
        if (landing) {
          this.y = landing.y; this.vy = 0; this.grounded = true; this.standingId = landing.id;
          this.walkedOff = null;
          this.doubleJumpUsed = false;
          this.lastWallJumpSide = 0; this.wallControlTime = 0;
          this.emit('land');
          const landedFloor = platformFloor(landing);
          if (landedFloor > this.lastFloor) {
            const climbed = landedFloor - this.lastFloor;
            this.combo = this.comboTime > 0 ? this.combo + climbed : climbed;
            this.comboTime = 3.8;
            this.bestCombo = Math.max(this.bestCombo, this.combo);
            this.score += climbed * 100 * Math.max(1, Math.floor(this.combo / 5) + 1);
            if (this.combo >= 3) this.emit('combo', this.combo);
            this.lastFloor = landedFloor;
          }
          this.floor = Math.max(this.floor, landedFloor);
          if (!this.comboChallengeBroken) this.comboChallengeFloor = Math.min(30, this.floor);
          if (landing.spring) {
            this.vy = 19 + Math.abs(this.vx) * .25;
            this.grounded = false; this.standingId = -1; this.coyote = 0; this.jumpBuffer = 0;
            this.emit('jump', this.vx);
          }
        }
      }
    }
    for (const p of this.platforms) {
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
  drainEvents() { const e = this.events; this.events = []; return e; }
  getReplay(): RunReplay | null {
    if (this.status !== 'over' || this.mode === 'practice' || !this.replay || this.floor < 1) return null;
    const recording = { seed: this.seed, moves: this.replay.map(([frames, mask]): [number, number] => [frames, mask]) };
    return this.rulesVersion === 3 || this.rulesVersion === 4 || this.rulesVersion === 5 ? { ...recording, version: this.rulesVersion, mode: this.mode } : { ...recording, version: this.rulesVersion };
  }
  snapshot() {
    const challenge = (id: QuickChallenge['id'], title: string, description: string, progress: number, target: number, failed = false): QuickChallenge => ({
      id, title, description, progress: Math.min(progress, target), target,
      status: progress >= target ? 'complete' : failed ? 'failed' : this.status === 'over' ? 'missed' : 'active',
    });
    const challenges = [
      challenge('combo', 'Unbroken ascent', 'Reach floor 30 without breaking your combo. Keep the chain alive from your first higher-floor landing.', this.comboChallengeFloor, 30, this.comboChallengeBroken),
      challenge('crystals', 'Crystal collector', 'Collect 10 crystals in one run.', this.gems, 10),
      challenge('walls', 'Wall jumper', 'Perform 5 wall jumps in one run. Hit a wall at speed or tap jump beside it while airborne.', this.wallJumps, 5),
    ];
    return { status: this.status, mode: this.mode, score: this.score, floor: this.floor, height: Math.floor(this.maxY * 3), combo: this.combo, comboTime: this.comboTime, bestCombo: this.bestCombo, gems: this.gems, time: this.time, pace: this.pace, speed: Math.abs(this.vx), stormDistance: this.y - this.stormY, wallJumps: this.wallJumps, challenges, doubleJumpTime: this.doubleJumpTime, doubleJumpReady: this.doubleJumpTime > 0 && !this.doubleJumpUsed, failureEvidence: this.failureEvidence };
  }
}
export type Snapshot = ReturnType<TowerEngine['snapshot']>;
