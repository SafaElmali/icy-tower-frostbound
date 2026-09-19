import { Ghost, Sparkles, X } from 'lucide-react';
import type { GuidanceCue } from '@/lib/climb-guidance';
import {
  firstJumpInstruction,
  type FirstJumpGuidance,
} from '@/lib/first-jump-guidance';
import type { SkillProgress } from '@/lib/skill-goals';
import type { Snapshot } from '@/lib/tower-engine';
import type { TowerGhost } from '@/lib/tower-ghost';
import { FeaturedSkillGoal } from './skill-goals';
import styles from './game-hud.module.css';

const keyboardTips = {
  move: 'Hold ← or → to run',
  jump: 'Hold a direction + tap Space to jump',
  release: 'Release Space, then press again to jump',
  stuck: 'Turn back, build speed, then jump higher',
  momentum: 'Run, then jump to go higher',
  frost: 'Frost is rising — keep climbing',
};
const touchTips = {
  move: 'Hold an arrow with your left thumb',
  jump: 'Hold an arrow + tap JUMP with your right thumb',
  release: 'Lift your right thumb, then tap JUMP again',
  stuck: 'Switch arrows, build speed, then tap JUMP',
  momentum: 'Build speed, then tap JUMP to go higher',
  frost: keyboardTips.frost,
};

/** One small status group for desktop and touch; hazards stay in the playfield. */
export function GameHud({
  game,
  skills,
  guidance,
  firstJump = null,
  ghost,
  onSkip,
  touch = false,
}: {
  game: Snapshot;
  skills: SkillProgress;
  guidance: GuidanceCue | null;
  firstJump?: FirstJumpGuidance | null;
  ghost: ReturnType<TowerGhost['snapshot']> | null;
  onSkip: () => void;
  touch?: boolean;
}) {
  const tip = firstJump
    ? firstJumpInstruction(firstJump, touch)
    : guidance
      ? (touch ? touchTips : keyboardTips)[guidance.id]
      : null;
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
      {!guidance && !firstJump && (
        <div className={styles.goal}>
          <FeaturedSkillGoal profile={skills} snapshot={game} compact />
        </div>
      )}
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
          <div className={styles.tipCopy}>
            {firstJump && (
              <div
                className={styles.demonstration}
                aria-hidden="true"
                data-phase={firstJump.phase}
              >
                <kbd className={styles.directionKey}>
                  {firstJump.direction === 'left'
                    ? '←'
                    : firstJump.direction === 'right'
                      ? '→'
                      : '↔'}{' '}
                  <small>HOLD</small>
                </kbd>
                <span className={styles.sequenceArrow}>›</span>
                <kbd className={styles.jumpKey}>
                  {touch ? 'JUMP' : 'Space'}{' '}
                  <small>
                    {firstJump.phase === 'release' ? 'RELEASE' : 'TAP'}
                  </small>
                </kbd>
                <span className={styles.sequenceArrow}>›</span>
                <span className={styles.landingKey}>
                  ⌄ <small>LAND</small>
                </span>
              </div>
            )}
            <output aria-live="polite" aria-atomic="true">
              {tip}
            </output>
          </div>
          {(guidance?.skippable || firstJump) && (
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
