import { freshControls, type Controls } from './tower-engine.ts';

/** Each finger and physical key owns its hold until that source releases it. */
export class TowerInput {
  readonly controls = freshControls();
  private held = new Map<string, keyof Controls>();

  press(source: string, control: keyof Controls) { this.held.set(source, control); this.sync(); }
  release(source: string) { this.held.delete(source); this.sync(); }
  has(source: string) { return this.held.has(source); }
  reset() { this.held.clear(); this.sync(); }

  private sync() {
    Object.assign(this.controls, freshControls());
    for (const control of this.held.values()) this.controls[control] = true;
  }
}
