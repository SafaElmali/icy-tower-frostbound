import { ClimberMotion } from './climber-motion.ts';
import type { GameStatus } from './tower-engine.ts';
import type { RacePose } from './race-protocol.ts';
import { validPeerPose } from './race-peer.ts';

type Snapshot = { pose: RacePose; received: number };
const lerp = (a: number, b: number, amount: number) => a + (b - a) * amount;
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

/** Buffered positions stay visible between packets, with a short delay to smooth jitter. */
export class RaceRival {
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
  private offset = Infinity;
  private delay = 100;
  private lastSource: 'http' | 'peer' | null = null;
  private renderedTime = -Infinity;

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
    if (previous && pose.time === previous.pose.time) {
      // Settlement can rest a climber on a ledge without advancing its input clock.
      previous.pose = { ...pose };
      return;
    }
    this.finished = hidden;
    this.offset = Math.min(this.offset, now - pose.time * 1_000);
    const interval = previous ? now - previous.received : 0;
    if (source === 'peer') this.delay = 100;
    else if (this.lastSource !== 'peer')
      this.delay = interval > 0 ? clamp(interval * 1.15, 500, 1_500) : 750;
    else if (interval > 500) {
      this.delay = clamp(interval * 1.15, 500, 1_500);
      this.lastSource = 'http';
    }
    this.lastSource = source;
    if (!previous) {
      Object.assign(this.engine, pose);
      this.renderedTime = pose.time;
    }
    this.snapshots.push({ pose: { ...pose }, received: now });
    if (this.snapshots.length > 90) this.snapshots.shift();
  }

  advance(now: number, dt: number) {
    if (!this.snapshots.length || this.finished) return;
    const newest = this.snapshots.at(-1)!.pose;
    // Switching transports can increase the buffer. Hold time rather than rewind.
    const at = Math.max(
      this.renderedTime,
      (now - this.offset - this.delay) / 1_000,
    );
    this.renderedTime = at;
    while (this.snapshots.length > 2 && this.snapshots[1].pose.time <= at)
      this.snapshots.shift();
    const a = this.snapshots[0].pose;
    const b = this.snapshots.find((sample) => sample.pose.time >= at)?.pose;
    let x: number,
      y: number,
      vx: number,
      vy: number,
      pose = newest;
    if (b && b.time > a.time && at >= a.time) {
      const mix = clamp((at - a.time) / (b.time - a.time), 0, 1);
      const respawn = a.respawning !== b.respawning && Math.abs(b.y - a.y) > 1;
      pose = mix < 1 ? a : b;
      x = respawn ? pose.x : lerp(a.x, b.x, mix);
      y = respawn ? pose.y : lerp(a.y, b.y, mix);
      vx = lerp(a.vx, b.vx, mix);
      vy = lerp(a.vy, b.vy, mix);
    } else if (at <= a.time) {
      pose = a;
      ({ x, y, vx, vy } = a);
    } else {
      const ahead = clamp(at - newest.time, 0, 0.2);
      x = newest.x + newest.vx * ahead;
      y =
        newest.y +
        (newest.grounded || newest.respawning
          ? 0
          : newest.vy * ahead - 11.5 * ahead * ahead);
      vx = newest.vx;
      vy = newest.vy;
    }
    if (this.engine.grounded && !pose.grounded && !pose.respawning)
      this.motion.jump(vx, at);
    const teleport = pose.respawning && Math.abs(y - this.engine.y) > 2;
    const mix = teleport
      ? 1
      : 1 - Math.exp(-24 * Math.min(0.1, Math.max(0, dt)));
    this.engine.x = lerp(this.engine.x, clamp(x, -6.12, 6.12), mix);
    this.engine.y = lerp(this.engine.y, y, mix);
    this.engine.vx = vx;
    this.engine.vy = vy;
    this.engine.grounded = pose.grounded;
    this.engine.facing = pose.facing;
    this.engine.time = Math.min(at, newest.time + 0.2);
  }
}
