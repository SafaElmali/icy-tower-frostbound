/** A simulation clock: one beat per crossing, with no timers or queued catch-up. */
export class FrenzyRhythm {
  private beat: number | null = null;

  observe(time: number, active: boolean): number | null {
    if (!active || !Number.isFinite(time) || time < 0) {
      this.beat = null;
      return null;
    }
    const beat = Math.floor((time + 1e-8) / 0.3);
    const previous = this.beat;
    this.beat = beat;
    if (previous === null || beat <= previous) return null;
    return beat % 8;
  }
}
