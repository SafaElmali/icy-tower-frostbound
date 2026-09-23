import type { Object3D } from 'three';
import type { GameEvent, GameStatus } from './tower-engine';

/** Whole-body squash, stretch, hop and screen-plane lean, applied around the climber's feet. */
export type ClimberBody = { scaleX: number; scaleY: number; scaleZ: number; lift: number; lean: number };
type BodyState = { time: number; grounded: boolean; vx: number; vy: number; status: GameStatus; facing?: number };
type LimbState = { time: number; grounded: boolean; vx: number };
const REST: ClimberBody = { scaleX: 1, scaleY: 1, scaleZ: 1, lift: 0, lean: 0 };
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
/** Rises over `attack` seconds, holds, then fades out by `length`. */
const envelope = (age: number, attack: number, length: number) => age < 0 || age >= length ? 0 : Math.min(1, age / attack, (length - age) / (length * .45));

/**
 * Harold's spread-limb spin, squash and stretch, and reaction poses (wall kick, hurt flinch, combo cheer). Everything
 * uses simulation time, so pausing freezes the pose. Landings are detected from the grounded flag as well as events,
 * so replay ghosts and race rivals (which only report jumps) squash the same way.
 */
export class ClimberMotion {
  private takeoff: { time: number; direction: number } | null = null;
  private launchAt: number | null = null;
  private landing: { time: number; strength: number } | null = null;
  private hurtAt: number | null = null;
  private wallKick: { time: number; side: number } | null = null;
  private cheerAt: number | null = null;
  private combo = 0;
  private wasGrounded: boolean | null = null;
  private peakFall = 0;
  private lastTime = 0;

  event(event: GameEvent, time: number) {
    if (event.type === 'jump' || (event.type === 'wall' && event.spinDirection !== undefined))
      this.jump(event.value ?? 0, time, event.spinDirection);
    if (event.type === 'hurt') { this.hurtAt = time; this.combo = 0; }
    else if (event.type === 'wall') this.wallKick = { time, side: Math.sign(event.x) || 1 };
    else if (event.type === 'combo-short') this.combo = 0;
    else if (event.type === 'combo') {
      const value = event.value ?? 0;
      if (value < this.combo) this.combo = 0;
      // Celebrate each new multiple of five (5×, 10×, 15×…), even when a big jump skips past it.
      if (Math.floor(value / 5) > Math.floor(this.combo / 5)) this.cheerAt = time;
      this.combo = value;
    }
  }

  jump(velocityX: number, time: number, spinDirection?: number) {
    this.takeoff = spinDirection || Math.abs(velocityX) >= 6 ? { time, direction: spinDirection || Math.sign(velocityX) } : null;
    this.launchAt = time; this.landing = null;
  }

  pose(state: { time: number; grounded: boolean; status: GameStatus }) {
    if (state.grounded || state.status === 'ready' || state.status === 'over' || (this.takeoff && state.time < this.takeoff.time)) this.takeoff = null;
    if (!this.takeoff) return { roll: 0, spread: 0 };
    // Open quickly, hold the star silhouette through the spin, then land upright.
    const progress = Math.min(1, Math.max(0, (state.time - this.takeoff.time) / .68));
    if (progress >= 1) { this.takeoff = null; return { roll: 0, spread: 0 }; }
    const eased = progress * progress * (3 - 2 * progress);
    const extension = Math.min(1, progress / .14, (1 - progress) / .16);
    return { roll: -this.takeoff.direction * Math.PI * 2 * eased, spread: extension * extension * (3 - 2 * extension) };
  }

  /** Squash and stretch for the whole body. Reduced motion keeps the climber at rest. */
  body(state: BodyState, reduced = false): ClimberBody {
    if (state.time < this.lastTime - 1e-6 || state.status === 'ready') this.reset();
    this.lastTime = state.time;
    if (!state.grounded) this.peakFall = Math.max(this.peakFall, -state.vy);
    else if (this.wasGrounded === false) {
      // Harder falls squash deeper.
      this.landing = { time: state.time, strength: clamp(.4 + this.peakFall / 26, .4, 1) };
      this.peakFall = 0;
    }
    this.wasGrounded = state.grounded;
    if (reduced || state.status === 'ready') return REST;
    const t = state.time;
    let stretch = 0, squeeze = 0, lift = 0, lean = 0;
    // Takeoff: a quick crouch as the feet push off, then a springy stretch.
    const launch = this.launchAt === null ? -1 : t - this.launchAt;
    if (launch >= 0 && launch < .5) stretch += launch < .06 ? -.26 + .4 * launch / .06 : .14 * Math.exp(-(launch - .06) * 7);
    if (!state.grounded) stretch += .05 * clamp(Math.abs(state.vy) / 16, 0, 1);
    // Landing: a deep squash that rebounds past upright once before settling.
    const land = this.landing ? t - this.landing.time : -1;
    if (land >= 0 && land < .6) stretch -= .34 * this.landing!.strength * Math.exp(-8 * land) * Math.cos(17 * land);
    const running = state.grounded && Math.abs(state.vx) > .3;
    if (running) lift = .045 * Math.abs(Math.sin(t * (10 + Math.abs(state.vx) * 1.8)));
    // Idle breathing once the landing has settled.
    else if (state.grounded && (land < 0 || land > .6)) stretch += .016 * Math.sin(t * 2.6);
    // Wall kick: flatten against the wall and tip away from it.
    const wall = this.wallKick ? t - this.wallKick.time : -1;
    if (wall >= 0 && wall < .4) {
      const fade = Math.exp(-9 * wall);
      squeeze += .16 * fade; stretch += .08 * fade; lean += this.wallKick!.side * .32 * fade;
    }
    // Hurt: recoil backwards with a quick shudder.
    const hurt = this.hurtAt === null ? -1 : t - this.hurtAt;
    if (hurt >= 0 && hurt < .6) {
      const fade = Math.exp(-5 * hurt);
      squeeze += .1 * Math.sin(hurt * 58) * fade; stretch -= .07 * fade; lean += (state.facing ?? 1) * .5 * fade;
    }
    // Combo milestone: a little celebratory hop.
    const cheer = this.cheerAt === null ? -1 : t - this.cheerAt;
    if (cheer >= 0 && cheer < .45 && state.grounded) lift += .16 * Math.sin(Math.PI * cheer / .45);
    const scaleY = clamp(1 + stretch, .62, 1.3), girth = 1 / Math.sqrt(scaleY);
    return { scaleX: girth * (1 - squeeze), scaleY, scaleZ: girth, lift, lean };
  }

  applyLimbs(state: LimbState, spread: number, arms: Object3D[], legs: Object3D[], reduced = false) {
    const running = state.grounded && Math.abs(state.vx) > .3;
    const stride = Math.sin(state.time * (10 + Math.abs(state.vx) * 1.8));
    const t = state.time, calm = reduced ? 0 : 1 - spread;
    const hurt = calm * envelope(this.hurtAt === null ? -1 : t - this.hurtAt, .05, .6);
    const kick = calm * envelope(this.wallKick ? t - this.wallKick.time : -1, .04, .38);
    const cheer = calm * envelope(this.cheerAt === null ? -1 : t - this.cheerAt, .08, .9);
    const land = this.landing ? t - this.landing.time : -1, fling = calm * (land >= 0 && land < .4 ? Math.exp(-9 * land) : 0);
    const mix = (from: number, to: number, amount: number) => from + (to - from) * amount;
    legs.forEach((leg, i) => {
      const side = i === 0 ? -1 : 1;
      let x = running ? stride * -side * .65 : state.grounded ? 0 : (i === 0 ? -.55 : .36);
      // Push off the wall with one leg while the other tucks.
      x = mix(x, i === 0 ? .95 : -.5, kick);
      x = mix(x, i === 0 ? -.75 : .45, hurt);
      leg.rotation.x = x * (1 - spread);
      leg.rotation.z = side * (.68 * spread + .12 * fling);
    });
    arms.forEach((arm, i) => {
      const side = i === 0 ? -1 : 1;
      let x = running ? stride * side * .55 : state.grounded ? Math.sin(t * 1.6) * .025 : -.5;
      let z = side * ((state.grounded ? .08 : .65) * (1 - spread) + 2.05 * spread) + side * .55 * fling;
      x = mix(x, -1.1, kick); z = mix(z, side * 1.05, kick);
      // Guard the face, then shake it off.
      x = mix(x, -2.35, hurt); z = mix(z, side * .35, hurt);
      // Fists up in a V, pumping.
      x = mix(x, -.25, cheer); z = mix(z, side * (2.6 + .22 * Math.sin((t - (this.cheerAt ?? 0)) * 20)), cheer);
      arm.rotation.x = x * (1 - spread);
      arm.rotation.z = z;
    });
  }

  private reset() {
    this.launchAt = this.hurtAt = this.cheerAt = null;
    this.landing = this.wallKick = null;
    this.combo = this.peakFall = 0; this.wasGrounded = null;
  }
}
