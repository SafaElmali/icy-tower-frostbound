import type { GameStatus } from './tower-engine';

/** Harold's fast-jump somersault uses simulation time, so pausing freezes the pose. */
export class ClimberMotion {
  private takeoff: { time: number; direction: number } | null = null;

  jump(velocityX: number, time: number) {
    this.takeoff = Math.abs(velocityX) >= 6 ? { time, direction: Math.sign(velocityX) } : null;
  }

  pose(state: { time: number; grounded: boolean; status: GameStatus }) {
    if (state.grounded || state.status === 'ready' || state.status === 'over' || (this.takeoff && state.time < this.takeoff.time)) this.takeoff = null;
    if (!this.takeoff) return { roll: 0, tuck: 0 };
    // Finish before descending onto a two-floor ledge. Extra airtime stays upright.
    const progress = Math.min(1, Math.max(0, (state.time - this.takeoff.time) / .68));
    if (progress >= 1) { this.takeoff = null; return { roll: 0, tuck: 0 }; }
    const eased = progress * progress * (3 - 2 * progress);
    return { roll: -this.takeoff.direction * Math.PI * 2 * eased, tuck: Math.sin(progress * Math.PI) };
  }
}
