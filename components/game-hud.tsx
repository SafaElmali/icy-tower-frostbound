import { Ghost, Sparkles, X } from 'lucide-react';
import type { GuidanceCue } from '@/lib/climb-guidance';
import type { SkillProgress } from '@/lib/skill-goals';
import type { Snapshot } from '@/lib/tower-engine';
import type { TowerGhost } from '@/lib/tower-ghost';
import { FeaturedSkillGoal } from './skill-goals';
import styles from './game-hud.module.css';

const keyboardTips = {
  move: 'Hold ← or → to run',
  jump: 'Space / JUMP to reach the next ledge',
  momentum: 'Run, then jump to go higher',
  frost: 'Frost is rising — keep climbing',
};
const touchTips = {
  move: 'Hold an arrow with your left thumb',
  jump: 'Hold an arrow + tap JUMP. Let go between jumps.',
  momentum: 'Hold an arrow to build speed, then tap JUMP again.',
  frost: keyboardTips.frost,
};

/** One small status group for desktop and touch; hazards stay in the playfield. */
export function GameHud({
  game,
  skills,
  guidance,
  ghost,
  onSkip,
  touch = false,
}: {
  game: Snapshot;
  skills: SkillProgress;
  guidance: GuidanceCue | null;
  ghost: ReturnType<TowerGhost['snapshot']> | null;
  onSkip: () => void;
  touch?: boolean;
}) {
  const tip = guidance ? (touch ? touchTips : keyboardTips)[guidance.id] : null;
  const frenzy = game.rulesVersion >= 6 && game.action.frenzyTime > 0;
  const ghostText = ghost
    ? ghost.beaten
      ? 'Best floor beaten'
      : ghost.finished
        ? 'Ghost finished'
        : ghost.lead === 0
          ? 'Neck and neck'
          : `${Math.abs(ghost.lead)} m ${ghost.lead > 0 ? 'ahead' : 'behind'}`
    : null;

  return (
    <aside className={styles.hud} aria-label="Climb status">
      <div className={styles.readout}>
        <span className={styles.floor}>
          Floor <strong>{game.floor}</strong>
        </span>
        <span
          className={styles.score}
          aria-label={`${game.score.toLocaleString()} points`}
        >
          {game.score.toLocaleString()} <small>pts</small>
        </span>
        {game.combo >= 3 && (
          <span className={styles.combo}>
            {game.combo}× <small>combo</small>
          </span>
        )}
        <progress
          className={styles.momentum}
          aria-label="Momentum"
          value={Math.min(game.speed, 8.4)}
          max={8.4}
        />
      </div>
      <div className={styles.goal}>
        <FeaturedSkillGoal profile={skills} snapshot={game} compact />
      </div>
      {frenzy ? (
        <span className={styles.context}>
          <Sparkles size={12} /> Frenzy · {Math.ceil(game.action.frenzyTime)}s
        </span>
      ) : game.doubleJumpTime > 0 ? (
        <span className={styles.context}>
          Double jump · {Math.ceil(game.doubleJumpTime)}s
        </span>
      ) : ghostText ? (
        <span className={styles.context}>
          <Ghost size={12} /> {ghostText}
        </span>
      ) : null}
      {tip && (
        <div className={styles.tip}>
          <output aria-live="polite" aria-atomic="true">
            {tip}
          </output>
          {guidance?.skippable && (
            <button
              type="button"
              onClick={onSkip}
              aria-label="Skip climbing guidance"
            >
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
