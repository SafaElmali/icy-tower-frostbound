import { ClimberMotion } from './climber-motion.ts';
import type { GameStatus } from './tower-engine.ts';
import type { RacePose } from './race-protocol.ts';
import { validPeerPose } from './race-peer.ts';
import { DEFAULT_OUTFIT, type Outfit } from './outfits.ts';

type Snapshot = { pose: RacePose; received: number };
const lerp = (a: number, b: number, amount: number) => a + (b - a) * amount;
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

/** Buffer on receipt time: lobby waits and suspended simulation clocks cannot skew playback. */
export class RaceRival {
  readonly appearance = 'player' as const;
  outfit: Outfit = { ...DEFAULT_OUTFIT };
  name = '';
  protected = false;
  engine = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    time: 0,
    facing: 1,
    grounded: true,
    status: 'playing' as GameStatus,
  };
  motion = new ClimberMotion();
  finished = true;
  private snapshots: Snapshot[] = [];
  private delay = 100;
  private lastSource: 'http' | 'peer' | null = null;
  private protectionExpiresAt = 0;

  receive(
    pose: RacePose | null,
    now: number,
    hidden = false,
    source: 'http' | 'peer' = 'http',
  ) {
    // A missing heartbeat or completed result must not flash an existing rival off.
    if (!pose || !validPeerPose(pose)) return;
    const previous = this.snapshots.at(-1);
    if (previous && pose.time < previous.pose.time) return;
    // A stalled connection must not leave a shield on a rival indefinitely.
    // Duplicate HTTP poses do not renew the lifetime of an old shield.
    if (
      !previous ||
      pose.time > previous.pose.time ||
      pose.protected !== previous.pose.protected
    ) {
      this.protected = pose.protected && !hidden;
      // Maximum hit immunity, plus recovery time while visibly falling.
      this.protectionExpiresAt = now + (pose.respawning ? 2_550 : 1_650);
    }
    if (hidden) this.protected = false;
    if (previous && pose.time === previous.pose.time) {
      // Settlement can rest a climber without advancing its input clock.
      previous.pose = { ...pose };
      return;
    }
    this.finished = hidden;
    const interval = previous ? now - previous.received : 0;
    if (source === 'peer') this.delay = 100;
    else if (this.lastSource !== 'peer' || interval > 500)
      this.delay = interval > 0 ? clamp(interval * 1.15, 500, 1_500) : 750;
    this.lastSource = source;
    if (!previous) Object.assign(this.engine, pose);
    this.snapshots.push({ pose: { ...pose }, received: now });
    if (this.snapshots.length > 90) this.snapshots.shift();
  }

  advance(now: number, dt: number) {
    if (now >= this.protectionExpiresAt || this.finished) this.protected = false;
    if (!this.snapshots.length || this.finished) return;
    const newest = this.snapshots.at(-1)!;
    const at = now - this.delay;
    while (this.snapshots.length > 2 && this.snapshots[1].received <= at)
      this.snapshots.shift();
    const a = this.snapshots[0];
    const b = this.snapshots.find((sample) => sample.received >= at);
    let x: number, y: number, vx: number, vy: number, time: number;
    let pose = newest.pose;
    if (b && b.received > a.received && at >= a.received) {
      const mix = clamp((at - a.received) / (b.received - a.received), 0, 1);
      const respawn =
        a.pose.respawning &&
        !b.pose.respawning &&
        Math.abs(b.pose.y - a.pose.y) > 2;
      pose = mix < 1 ? a.pose : b.pose;
      x = respawn ? pose.x : lerp(a.pose.x, b.pose.x, mix);
      y = respawn ? pose.y : lerp(a.pose.y, b.pose.y, mix);
      vx = lerp(a.pose.vx, b.pose.vx, mix);
      vy = lerp(a.pose.vy, b.pose.vy, mix);
      time = lerp(a.pose.time, b.pose.time, mix);
    } else if (at <= a.received) {
      pose = a.pose;
      ({ x, y, vx, vy, time } = pose);
    } else {
      const ahead = clamp((at - newest.received) / 1_000, 0, 0.2);
      x = pose.x + pose.vx * ahead;
      y =
        pose.y +
        (pose.grounded || pose.respawning
          ? 0
          : pose.vy * ahead - 11.5 * ahead * ahead);
      vx = pose.vx;
      vy = pose.vy;
      time = pose.time + ahead;
    }
    if (this.engine.grounded && !pose.grounded && !pose.respawning)
      this.motion.jump(vx, time);
    const teleport =
      pose.protected && pose.grounded && Math.abs(y - this.engine.y) > 2;
    const mix = teleport
      ? 1
      : 1 - Math.exp(-24 * Math.min(0.1, Math.max(0, dt)));
    this.engine.x = lerp(this.engine.x, clamp(x, -6.12, 6.12), mix);
    this.engine.y = lerp(this.engine.y, y, mix);
    this.engine.vx = vx;
    this.engine.vy = vy;
    this.engine.grounded = pose.grounded;
    this.engine.facing = pose.facing;
    this.engine.time = time;
  }
}
