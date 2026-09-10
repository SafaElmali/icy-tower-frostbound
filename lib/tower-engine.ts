export type GameStatus = 'ready' | 'playing' | 'paused' | 'over';
export type GameMode = 'arcade' | 'practice';
export type Controls = { left: boolean; right: boolean; jump: boolean };
export type Platform = { id: number; x: number; y: number; width: number; gem: boolean; collected: boolean; moving: boolean; origin: number; phase: number };
export type GameEvent = { type: 'jump' | 'land' | 'gem' | 'combo' | 'wall' | 'over'; x: number; y: number; value?: number };
export const FLOOR_HEIGHT = 2.35;
export const WALL = 6.4;
export const MAX_REPLAY_FRAMES = 216000;
export const MAX_REPLAY_SEGMENTS = 12000;
export type RunReplay = { version: 1; seed: number; moves: [number, number][] };
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
  platforms: Platform[] = [];
  events: GameEvent[] = [];
  seed: number;
  private state = 1;
  private nextId = 0;
  private jumpBuffer = 0;
  private coyote = .12;
  private jumpWasDown = false;
  private accumulator = 0;
  private lastFloor = 0;
  private scrollStartedAt: number | null = null;
  private replay: [number, number][] | null = [];
  private replayFrames = 0;
  private recordReplay: boolean;
  constructor(seed = 73091, recordReplay = true) { this.seed = seed; this.recordReplay = recordReplay; this.resetWorld(); }
  private random() { this.state = (Math.imul(1664525, this.state) + 1013904223) >>> 0; return this.state / 4294967296; }
  private resetWorld() {
    this.state = this.seed; this.nextId = 0; this.platforms = [];
    this.platforms.push({ id: 0, x: 0, y: 0, width: 13.6, gem: false, collected: false, moving: false, origin: 0, phase: 0 });
    this.nextId = 1;
    this.generate(42);
  }
  private generate(top: number) {
    while (this.nextId * FLOOR_HEIGHT <= top) {
      const id = this.nextId++;
      const previous = this.platforms[this.platforms.length - 1];
      const width = id < 8 ? 3.7 : Math.max(2.45, 3.7 - id * .007) + this.random() * .5;
      // Neighboring ledges always overlap the base jump's reachable horizontal range.
      const offset = (this.random() > .5 ? 1 : -1) * (1.5 + this.random() * 2.3);
      const x = clamp(previous.x + offset, -5.9 + width / 2, 5.9 - width / 2);
      this.platforms.push({ id, x, y: id * FLOOR_HEIGHT, width, gem: id % 3 === 0, collected: false, moving: id > 24 && id % 7 === 0, origin: x, phase: this.random() * Math.PI * 2 });
    }
  }
  start(mode: GameMode = 'arcade', seed = this.seed) {
    this.replay = []; this.replayFrames = 0;
    this.seed = seed; this.mode = mode; this.status = 'playing';
    this.x = this.y = this.vx = this.vy = this.time = this.maxY = this.floor = this.score = this.gems = this.combo = this.bestCombo = this.comboTime = this.lastFloor = 0;
    this.cameraY = 5.2; this.stormY = -8; this.facing = 1; this.grounded = true; this.standingId = 0;
    this.accumulator = this.jumpBuffer = 0; this.coyote = .12; this.jumpWasDown = false; this.events = []; this.scrollStartedAt = null;
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
    if (this.recordReplay && this.mode === 'arcade' && this.replay) {
      const mask = Number(input.left) | (Number(input.right) << 1) | (Number(input.jump) << 2);
      const last = this.replay[this.replay.length - 1];
      if (++this.replayFrames > MAX_REPLAY_FRAMES || (last?.[1] !== mask && this.replay.length >= MAX_REPLAY_SEGMENTS)) this.replay = null;
      else if (last?.[1] === mask) last[0]++;
      else this.replay.push([1, mask]);
    }
    this.time += dt;
    this.comboTime = Math.max(0, this.comboTime - dt);
    if (this.comboTime === 0) this.combo = 0;
    if (input.jump && !this.jumpWasDown) this.jumpBuffer = .16;
    this.jumpWasDown = input.jump;
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.coyote = this.grounded ? .12 : Math.max(0, this.coyote - dt);
    for (const p of this.platforms) {
      if (!p.moving) continue;
      const old = p.x;
      p.x = clamp(p.origin + Math.sin(this.time * .7 + p.phase) * .65, -5.4 + p.width / 2, 5.4 - p.width / 2);
      if (this.grounded && this.standingId === p.id) this.x += p.x - old;
    }
    const direction = Number(input.right) - Number(input.left);
    if (direction) {
      this.vx += direction * (this.grounded ? 23 : 17) * dt;
      this.facing = direction;
    } else this.vx *= Math.exp(-(this.grounded ? 4.5 : .8) * dt);
    this.vx = clamp(this.vx, -8.4, 8.4);
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.vy = 12.6 + Math.abs(this.vx) * .47;
      this.grounded = false; this.coyote = 0; this.jumpBuffer = 0; this.standingId = -1;
      this.emit('jump', this.vx);
    }
    const oldY = this.y;
    this.x += this.vx * dt;
    if (Math.abs(this.x) > WALL - .28) {
      this.x = Math.sign(this.x) * (WALL - .28);
      if (Math.abs(this.vx) > 4) { this.vx *= -.83; this.emit('wall'); }
      else this.vx = 0;
    }
    if (this.grounded) {
      const p = this.platforms.find(p => p.id === this.standingId);
      if (!p || Math.abs(this.x - p.x) > p.width / 2 + .15) { this.grounded = false; this.standingId = -1; }
    }
    if (!this.grounded) {
      this.vy -= 23 * dt;
      this.y += this.vy * dt;
      if (this.vy <= 0) {
        let landing: Platform | undefined;
        for (const p of this.platforms) {
          if (oldY >= p.y - .015 && this.y <= p.y && Math.abs(this.x - p.x) < p.width / 2 + .2 && (!landing || p.y > landing.y)) landing = p;
        }
        if (landing) {
          this.y = landing.y; this.vy = 0; this.grounded = true; this.standingId = landing.id;
          this.emit('land');
          if (landing.id > this.lastFloor) {
            const climbed = landing.id - this.lastFloor;
            this.combo = this.comboTime > 0 ? this.combo + climbed : climbed;
            this.comboTime = 3.8;
            this.bestCombo = Math.max(this.bestCombo, this.combo);
            this.score += climbed * 100 * Math.max(1, Math.floor(this.combo / 5) + 1);
            if (this.combo >= 3) this.emit('combo', this.combo);
            this.lastFloor = landing.id;
          }
          this.floor = Math.max(this.floor, landing.id);
        }
      }
    }
    for (const p of this.platforms) {
      if (p.gem && !p.collected && Math.abs(this.x - p.x) < .85 && Math.abs(this.y + .7 - (p.y + 1.05)) < 1) {
        p.collected = true; this.gems++; this.score += 250; this.emit('gem');
      }
    }
    this.maxY = Math.max(this.maxY, this.y);
    if (this.mode === 'arcade' && this.scrollStartedAt === null && this.maxY >= 5 * FLOOR_HEIGHT) this.scrollStartedAt = this.time;
    const scrollStep = this.scrollStartedAt === null ? 0 : (.65 + Math.min(5, Math.floor((this.time - this.scrollStartedAt) / 30)) * .4) * dt;
    const followY = Math.max(5.2, this.y + 2.2);
    // Let a fall reveal lower ledges, while standing still lets the tower scroll
    // past the player. The frost keeps advancing independently of camera recovery.
    this.cameraY = !this.grounded && this.vy < 0
      ? Math.min(this.cameraY + scrollStep, followY)
      : Math.max(this.cameraY + scrollStep, followY);
    this.stormY = Math.max(this.stormY + scrollStep, this.cameraY - 12.5);
    this.generate(this.cameraY + 23);
    this.platforms = this.platforms.filter(p => p.y > this.cameraY - 22 || p.id === this.standingId);
    if (this.y < this.stormY + .05) { this.status = 'over'; this.emit('over'); }
  }
  drainEvents() { const e = this.events; this.events = []; return e; }
  getReplay(): RunReplay | null {
    if (this.status !== 'over' || this.mode !== 'arcade' || !this.replay || this.floor < 1) return null;
    return { version: 1, seed: this.seed, moves: this.replay.map(([frames, mask]) => [frames, mask]) };
  }
  snapshot() {
    return { status: this.status, mode: this.mode, score: this.score, floor: this.floor, height: Math.floor(this.maxY * 3), combo: this.combo, comboTime: this.comboTime, bestCombo: this.bestCombo, gems: this.gems, time: this.time, speed: Math.abs(this.vx), stormDistance: this.y - this.stormY };
  }
}
export type Snapshot = ReturnType<TowerEngine['snapshot']>;
