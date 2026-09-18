import { freshControls, type Controls } from './tower-engine.ts';

/** Each finger and physical key owns its hold until that source releases it. */
export class TowerInput {
  readonly controls = freshControls();
  private held = new Map<string, keyof Controls>();
  private pendingJump = new Set<string>();
  private sampledJump = false;

  press(source: string, control: keyof Controls) {
    const jumpWasHeld = this.controls.jump;
    this.held.set(source, control);
    this.sync();
    if (control === 'jump' && !jumpWasHeld) this.pendingJump.add(source);
  }
  release(source: string) { this.held.delete(source); this.sync(); }
  cancel(source: string) { this.pendingJump.delete(source); this.release(source); }
  has(source: string) { return this.held.has(source); }
  reset() { this.held.clear(); this.pendingJump.clear(); this.sampledJump = false; this.sync(); }

  /** Keep one jump tap between frames; re-taps first deliver the missing release. */
  sample(): Controls {
    return { ...this.controls, jump: this.pendingJump.size > 0 ? !this.sampledJump : this.controls.jump };
  }
  /** A high-refresh frame may run no physics; acknowledge only when time advances. */
  acknowledgeSample(sample: Controls) {
    this.sampledJump = sample.jump;
    if (sample.jump) this.pendingJump.clear();
  }

  private sync() {
    Object.assign(this.controls, freshControls());
    for (const control of this.held.values()) this.controls[control] = true;
  }
}
