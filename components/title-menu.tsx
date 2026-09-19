'use client';

import type { ReactNode } from 'react';
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  ChevronRight,
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
      <header className={styles.masthead}>
        <span className={styles.brand}>
          <Snowflake aria-hidden="true" /> ICY TOWER <i /> FROSTBOUND
        </span>
        <span className={styles.edition}>THE ENDLESS ASCENT</span>
      </header>
      <div className={styles.content}>
        <section className={styles.menu} aria-label="Frostbound main menu">
          <div className={styles.heading}>
            <span className={styles.eyebrow}>
              <span /> ONE MORE FLOOR. ONE MORE TRY.
            </span>
            <h1>
              Frostbound<span aria-hidden="true">.</span>
            </h1>
            <p>
              The tower is endless. <br />
              Make your ascent matter.
            </p>
          </div>
          {props.context && (
            <div className={styles.context}>{props.context}</div>
          )}
          <div className={styles.actions}>
            <div className={styles.modeLine}>
              <span>
                {props.invited
                  ? 'YOUR NEXT CHALLENGE'
                  : `${MODE_LABELS[props.mode].toUpperCase()} · SOLO CLIMB`}
              </span>
              {!props.invited && (
                <button onClick={props.onModes} aria-haspopup="dialog">
                  Change mode <ChevronRight size={13} />
                </button>
              )}
            </div>
            <button
              className={styles.play}
              disabled={!props.ready || props.failed}
              onClick={props.onPlay}
            >
              <Play size={20} fill="currentColor" aria-hidden="true" />
              <span>
                {props.failed
                  ? 'Tower unavailable'
                  : props.ready
                    ? props.playLabel
                    : 'Entering the tower…'}
              </span>
              <ArrowRight size={22} aria-hidden="true" />
            </button>
            <nav className={styles.links} aria-label="Play and progression">
              {/* Full navigation is required for the static export. */}
              {/* oxlint-disable-next-line next/no-html-link-for-pages */}
              <a href="/race">
                <Users aria-hidden="true" />
                <span>
                  Multiplayer<small>Find your rivals. Climb together.</small>
                </span>
                <span className={styles.badge}>2–4</span>
                <ChevronRight aria-hidden="true" />
              </a>
              <button onClick={props.onDaily} aria-haspopup="dialog">
                <CalendarDays aria-hidden="true" />
                <span>
                  Daily tower
                  <small>One shared route. A new climb every day.</small>
                </span>
                <ChevronRight aria-hidden="true" />
              </button>
              <button onClick={props.onProgress} aria-haspopup="dialog">
                <Mountain aria-hidden="true" />
                <span>
                  Your ascent
                  <small>Goals, milestones & personal progress</small>
                </span>
                <ChevronRight aria-hidden="true" />
              </button>
            </nav>
            <nav className={styles.secondary} aria-label="Climber options">
              <button onClick={props.onOutfits} aria-haspopup="dialog">
                <Shirt aria-hidden="true" />
                Outfits
                {props.newOutfits > 0 && (
                  <span
                    className={styles.new}
                    aria-label="New outfits available"
                  />
                )}
              </button>
              <button onClick={props.onLeaderboard} aria-haspopup="dialog">
                <Trophy aria-hidden="true" />
                Rankings
              </button>
              <button onClick={props.onHelp} aria-haspopup="dialog">
                <BookOpen aria-hidden="true" />
                How to play
              </button>
            </nav>
          </div>
        </section>
        <aside className={styles.worldNote} aria-label="Your next milestone">
          <div className={styles.location}>
            <span /> THE FROZEN CATHEDRAL
          </div>
          <div className={styles.milestone}>
            <div className={styles.milestoneTop}>
              <Mountain size={18} aria-hidden="true" />
              <span>{goal ? 'NEXT MILESTONE' : 'THE ASCENT CONTINUES'}</span>
              <span>
                {String(props.skills.completed.length).padStart(2, '0')} /{' '}
                {SKILL_GOALS.length}
              </span>
            </div>
            <h2>{goal?.title ?? 'Every milestone, mastered.'}</h2>
            <p>
              {goal?.description ??
                'A new daily tower awaits. How high will you go?'}
            </p>
            <button onClick={props.onProgress}>
              Explore your ascent <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </aside>
      </div>
      <footer className={styles.footer}>
        <div className={styles.record}>
          <Trophy size={16} aria-hidden="true" />
          <span>
            {MODE_LABELS[props.mode]} best{' '}
            <strong>
              {props.best.floor > 0
                ? `${props.best.floor} floors`
                : 'Your story starts here'}
            </strong>
          </span>
        </div>
        <p className={styles.hint}>
          {props.touch ? (
            'Hold to move · Tap to jump'
          ) : (
            <>
              <kbd>←</kbd>
              <kbd>→</kbd> Move <i />
              <kbd>SPACE</kbd> Jump <i />
              <kbd>ENTER</kbd> Play
            </>
          )}
        </p>
        <div className={styles.utilities}>
          <button
            aria-label={props.sound ? 'Mute sound' : 'Unmute sound'}
            aria-pressed={!props.sound}
            onClick={props.onSound}
          >
            {props.sound ? (
              <Volume2 aria-hidden="true" />
            ) : (
              <VolumeX aria-hidden="true" />
            )}
          </button>
          <button onClick={props.onSettings} aria-haspopup="dialog">
            <Settings2 aria-hidden="true" />
            <span>Settings</span>
          </button>
        </div>
      </footer>
    </div>
  );
}
