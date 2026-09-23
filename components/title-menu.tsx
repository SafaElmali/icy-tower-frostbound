'use client';

import type { ReactNode } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  ChevronDown,
  Mountain,
  Play,
  Settings2,
  Shirt,
  Snowflake,
  Trophy,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { MODE_LABELS, type GameMode } from '@/lib/tower-engine';
import {
  getFeaturedSkillGoal,
  SKILL_GOALS,
  type SkillProgress,
} from '@/lib/skill-goals';
import styles from '@/app/title-menu.module.css';

type Props = {
  mode: GameMode;
  ready: boolean;
  failed: boolean;
  sound: boolean;
  touch: boolean;
  best: { floor: number; score: number };
  skills: SkillProgress;
  newOutfits: number;
  context: ReactNode;
  invited: boolean;
  playLabel: string;
  onPlay: () => void;
  onModes: () => void;
  onDaily: () => void;
  onProgress: () => void;
  onOutfits: () => void;
  onLeaderboard: () => void;
  onHelp: () => void;
  onSettings: () => void;
  onSound: () => void;
};

export function TitleMenu(props: Props) {
  const goal = getFeaturedSkillGoal(props.skills);
  return (
    <div className={styles.shell}>
      <div className={styles.backdrop} aria-hidden="true" />
      <header className={styles.header}>
        <span className={styles.brand}>
          <Snowflake aria-hidden="true" /> Icy Tower
        </span>
        <nav className={styles.utilities} aria-label="Climber options">
          <button
            onClick={props.onOutfits}
            aria-haspopup="dialog"
            aria-label={
              props.newOutfits > 0
                ? `Outfits, ${props.newOutfits} new`
                : 'Outfits'
            }
          >
            <Shirt aria-hidden="true" />
            <span>Outfits</span>
            {props.newOutfits > 0 && (
              <i className={styles.new} aria-hidden="true" />
            )}
          </button>
          <button
            onClick={props.onLeaderboard}
            aria-haspopup="dialog"
            aria-label="Rankings"
          >
            <Trophy aria-hidden="true" />
            <span>Rankings</span>
          </button>
          <button
            onClick={props.onHelp}
            aria-haspopup="dialog"
            aria-label="How to play"
          >
            <BookOpen aria-hidden="true" />
            <span>How to play</span>
          </button>
          <span className={styles.utilityDivider} aria-hidden="true" />
          <button
            onClick={props.onSound}
            aria-label={props.sound ? 'Mute sound' : 'Unmute sound'}
            aria-pressed={!props.sound}
          >
            {props.sound ? (
              <Volume2 aria-hidden="true" />
            ) : (
              <VolumeX aria-hidden="true" />
            )}
          </button>
          <button
            onClick={props.onSettings}
            aria-label="Settings"
            aria-haspopup="dialog"
          >
            <Settings2 aria-hidden="true" />
          </button>
        </nav>
      </header>

      <section className={styles.hero} aria-label="Frostbound main menu">
        <div className={styles.title}>
          <h1>Frostbound</h1>
          <p>
            One more floor. <span>One more try.</span>
          </p>
        </div>
        {props.context && <div className={styles.context}>{props.context}</div>}
        <div className={styles.launch}>
          <button
            className={styles.play}
            data-start-climb
            aria-describedby="title-play-hint"
            aria-busy={!props.ready && !props.failed}
            disabled={!props.ready || props.failed}
            onClick={props.onPlay}
          >
            <Play aria-hidden="true" fill="currentColor" />
            <span aria-live="polite">
              {props.failed
                ? 'Tower unavailable'
                : props.ready
                  ? props.playLabel
                  : 'Entering the tower…'}
            </span>
            <ArrowRight aria-hidden="true" />
          </button>
          <div className={styles.mode}>
            {props.invited ? (
              <span>Your next challenge</span>
            ) : (
              <button
                onClick={props.onModes}
                aria-haspopup="dialog"
                aria-label={`Change mode, currently ${MODE_LABELS[props.mode]}`}
              >
                <span className={styles.modeDot} aria-hidden="true" />
                {MODE_LABELS[props.mode]}{' '}
                <span className={styles.modeDetail}>· Solo climb</span>
                <ChevronDown size={15} aria-hidden="true" />
              </button>
            )}
          </div>
          <p className={styles.hint} id="title-play-hint">
            {props.touch ? (
              'Hold an arrow to run. Tap JUMP to climb.'
            ) : (
              <>
                <kbd>Enter</kbd> to begin <span aria-hidden="true">/</span>{' '}
                <kbd>← →</kbd> run <span aria-hidden="true">/</span>{' '}
                <kbd>Space</kbd> jump
              </>
            )}
          </p>
        </div>
      </section>

      <nav className={styles.activities} aria-label="Play and progression">
        {/* Full navigation is required for the static export. */}
        {/* oxlint-disable-next-line next/no-html-link-for-pages */}
        <a href="/race" className={styles.multiplayer}>
          <Users className={styles.activityIcon} aria-hidden="true" />
          <span className={styles.activityCopy}>
            <strong>
              Multiplayer <small>2–4</small>
            </strong>
            <span>A little friendly competition.</span>
          </span>
          <ArrowUpRight className={styles.activityArrow} aria-hidden="true" />
        </a>
        <button onClick={props.onDaily} aria-haspopup="dialog">
          <CalendarDays className={styles.activityIcon} aria-hidden="true" />
          <span className={styles.activityCopy}>
            <strong>Daily tower</strong>
            <span>New day. Same tower for everyone.</span>
          </span>
          <ArrowUpRight className={styles.activityArrow} aria-hidden="true" />
        </button>
        <button onClick={props.onProgress} aria-haspopup="dialog">
          <Mountain className={styles.activityIcon} aria-hidden="true" />
          <span className={styles.activityCopy}>
            <strong>Your ascent</strong>
            <span>Small steps. New milestones.</span>
          </span>
          <ArrowUpRight className={styles.activityArrow} aria-hidden="true" />
        </button>
      </nav>

      <footer className={styles.footer}>
        <div className={styles.record}>
          <Trophy aria-hidden="true" />
          <span>
            <small>{MODE_LABELS[props.mode]} personal best</small>
            <strong>
              {props.best.floor > 0
                ? `${props.best.floor} floors`
                : 'Your first climb awaits'}
              {props.best.floor > 0 && (
                <span> · {props.best.score.toLocaleString()} pts</span>
              )}
            </strong>
          </span>
        </div>
        <button
          className={styles.milestone}
          onClick={props.onProgress}
          aria-haspopup="dialog"
        >
          <span className={styles.milestoneCopy}>
            <small>{goal ? 'Next milestone' : 'All milestones complete'}</small>
            <strong>{goal?.title ?? 'Keep the ascent going'}</strong>
          </span>
          <span className={styles.milestoneProgress}>
            <span>
              {props.skills.completed.length} / {SKILL_GOALS.length}
            </span>
            <progress
              aria-label="Milestones completed"
              value={props.skills.completed.length}
              max={SKILL_GOALS.length}
            />
          </span>
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </footer>
    </div>
  );
}
