import type { Object3D } from 'three';
import type { GameStatus } from './tower-engine';

/** Harold's spread-limb spin uses simulation time, so pausing freezes the pose. */
export class ClimberMotion {
  private takeoff: { time: number; direction: number } | null = null;

  jump(velocityX: number, time: number) {
    this.takeoff = Math.abs(velocityX) >= 6 ? { time, direction: Math.sign(velocityX) } : null;
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

  applyLimbs(state: { time: number; grounded: boolean; vx: number }, spread: number, arms: Object3D[], legs: Object3D[]) {
    const running = state.grounded && Math.abs(state.vx) > .3;
    const stride = Math.sin(state.time * (10 + Math.abs(state.vx) * 1.8));
    legs.forEach((leg, i) => {
      const side = i === 0 ? -1 : 1;
      const normal = running ? stride * -side * .65 : state.grounded ? 0 : (i === 0 ? -.55 : .36);
      leg.rotation.x = normal * (1 - spread);
      leg.rotation.z = side * .68 * spread;
    });
    arms.forEach((arm, i) => {
      const side = i === 0 ? -1 : 1;
      const normal = running ? stride * side * .55 : state.grounded ? Math.sin(state.time * 1.6) * .025 : -.5;
      arm.rotation.x = normal * (1 - spread);
      arm.rotation.z = side * ((state.grounded ? .08 : .65) * (1 - spread) + 2.05 * spread);
    });
  }
}
