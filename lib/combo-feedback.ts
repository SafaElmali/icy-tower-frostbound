export const COMBO_MILESTONES = [3, 5, 10, 15] as const;
export type ComboMilestone = typeof COMBO_MILESTONES[number];

const LABELS: Record<ComboMilestone, string> = {
  3: 'Finding rhythm',
  5: 'On a roll',
  10: 'Flying',
  15: 'Unstoppable',
};

export function comboMilestoneLabel(milestone: ComboMilestone): string {
  return LABELS[milestone];
}

/** Observe simulation state even while muted so enabling audio never replays old cues. */
export class ComboFeedbackTracker {
  private previousCombo = 0;
  private announced = 0;

  reset() {
    this.previousCombo = 0;
    this.announced = 0;
  }

  observe(combo: number, comboTime: number): ComboMilestone | null {
    if (!Number.isFinite(combo) || !Number.isFinite(comboTime) || combo <= 0 || comboTime <= 0) {
      this.reset();
      return null;
    }
    // A decrease also identifies a new chain if an intermediate empty frame was missed.
    if (combo < this.previousCombo) this.reset();
    this.previousCombo = combo;
    let milestone: ComboMilestone | null = null;
    for (const target of COMBO_MILESTONES) {
      if (combo >= target && target > this.announced) milestone = target;
    }
    // Large jumps celebrate only the highest crossing rather than stacking musical cues.
    if (milestone !== null) this.announced = milestone;
    return milestone;
  }
}
