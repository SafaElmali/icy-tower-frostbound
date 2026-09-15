import { X } from 'lucide-react';
import type { GuidanceCue } from '@/lib/climb-guidance';
import type { Snapshot } from '@/lib/tower-engine';
import styles from './mobile-game-hud.module.css';

const tips: Record<GuidanceCue['id'], string> = {
  move: 'Hold ← or → to run',
  jump: 'Tap JUMP to reach the next ledge',
  momentum: 'Run, then jump to go higher',
  frost: 'Frost is rising · keep climbing',
};

function currentCue(game: Snapshot, guidance: GuidanceCue | null) {
  if (game.stormDistance < 4) {
    return { text: 'Frost is close · keep climbing', danger: true };
  }
  if (game.rulesVersion >= 6) {
    const { action } = game;
    if (action.icicles.some((ice) => ice.state === 'warning')) {
      return { text: 'Ice ahead · dodge the amber lane', danger: true };
    }
    if (action.bats.some((bat) => bat.alive && bat.warningTime > 0)) {
      return { text: 'Bat incoming · dodge or stomp', danger: true };
    }
    if (action.notice?.label === 'CRACKED ICE') {
      return { text: 'Cracked ice · jump again', danger: true };
    }
    if (action.encounter) {
      return {
        text:
          action.encounter.kind === 'ice-shower'
            ? 'Ice shower · dodge marked lanes'
            : 'Crumbling stairs · keep jumping',
        danger: true,
        seconds: action.encounter.timeLeft,
      };
    }
    if (action.frenzyTime > 0) {
      return { text: 'Frenzy · boosted jumps', seconds: action.frenzyTime };
    }
  }
  if (guidance) {
    return { text: tips[guidance.id], dismissible: guidance.skippable };
  }
  return null;
}

/** Mobile has one cue slot: an immediate hazard takes priority over a tip. */
export function MobileGameHud({
  game,
  guidance,
  onSkip,
}: {
  game: Snapshot;
  guidance: GuidanceCue | null;
  onSkip: () => void;
}) {
  const cue = currentCue(game, guidance);
  return (
    <aside className={styles.hud} aria-label="Climb status">
      <div className={styles.readout}>
        <span className={styles.floor}>
          Floor <strong>{game.floor}</strong>
        </span>
        {game.combo >= 3 && (
          <span className={styles.combo}>
            {game.combo}× <small>combo</small>
          </span>
        )}
      </div>
      {cue && (
        <div className={`${styles.cue} ${cue.danger ? styles.danger : ''}`}>
          <output aria-live="polite" aria-atomic="true">
            {cue.text}
          </output>
          {cue.seconds != null && (
            <span className={styles.timer}>{Math.ceil(cue.seconds)}s</span>
          )}
          {cue.dismissible && (
            <button
              type="button"
              onClick={onSkip}
              aria-label="Skip climbing guidance"
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
