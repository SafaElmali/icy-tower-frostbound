'use client';

import { useRef } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  CornerUpRight,
  Diamond,
  Layers3,
  Link2,
  LockKeyhole,
  Mountain,
  Target,
  Trophy,
} from 'lucide-react';
import {
  getFeaturedSkillGoal,
  getSkillGoals,
  SKILL_GOALS,
  type SkillGoalView,
  type SkillProgress,
  type SkillRun,
} from '@/lib/skill-goals';
import styles from './skill-goals.module.css';

function GoalProgress({ goal }: { goal: SkillGoalView }) {
  return (
    <div className={styles.progress}>
      {goal.progress.map((item) => (
        <div key={item.label}>
          <span>
            {item.label}
            <strong>
              {item.value}/{item.target}
            </strong>
          </span>
          <progress
            aria-label={`${goal.title}: ${item.label}`}
            value={item.value}
            max={item.target}
          />
        </div>
      ))}
    </div>
  );
}

export function FeaturedSkillGoal({
  profile,
  snapshot,
  compact = false,
}: {
  profile: SkillProgress;
  snapshot?: SkillRun;
  compact?: boolean;
}) {
  const goal = getFeaturedSkillGoal(profile, snapshot);
  if (compact) {
    if (!goal) return null;
    const progress =
      goal.progress.reduce(
        (total, item) => total + item.value / item.target,
        0,
      ) / goal.progress.length;
    const detail = goal.progress
      .map((item) => `${item.label}: ${item.value}/${item.target}`)
      .join(', ');
    const count =
      goal.progress.length === 1
        ? `${goal.progress[0].value}/${goal.progress[0].target}`
        : `${Math.round(progress * 100)}%`;
    return (
      <section
        className={styles.compact}
        aria-label="Featured skill goal"
        title={`${goal.title} · ${detail}`}
      >
        <Target size={12} aria-hidden="true" />
        <span>{goal.title}</span>
        <small>{count}</small>
        <progress
          aria-label={goal.title}
          aria-valuetext={detail}
          value={progress}
          max={1}
        />
      </section>
    );
  }
  return (
    <section className={styles.featured} aria-label="Featured skill goal">
      <div className={styles.heading}>
        <Target size={15} aria-hidden="true" />
        <span>{goal ? 'Next goal' : 'Skill goals complete'}</span>
      </div>
      <strong>{goal?.title ?? 'You mastered the climbing milestones'}</strong>
      {goal ? (
        <GoalProgress goal={goal} />
      ) : (
        <p>Choose a daily tower or chase your personal best.</p>
      )}
    </section>
  );
}

function GoalIcon({ goal }: { goal: SkillGoalView }) {
  const Icon =
    goal.targets.length > 1
      ? Layers3
      : goal.targets[0].metric === 'floor'
        ? Mountain
        : goal.targets[0].metric === 'gems'
          ? Diamond
          : goal.targets[0].metric === 'wallJumps'
            ? CornerUpRight
            : Link2;
  return <Icon aria-hidden="true" />;
}

export function SkillGoalProgression({
  profile,
  snapshot,
  onSelect,
}: {
  profile: SkillProgress;
  snapshot?: SkillRun;
  onSelect: (id: string) => void;
}) {
  const focusTitle = useRef<HTMLHeadingElement>(null);
  const goals = getSkillGoals(profile, snapshot);
  const completed = goals.filter((goal) => goal.status === 'complete');
  const locked = goals.filter((goal) => goal.status === 'locked');
  const selected =
    goals.find((goal) => goal.featured && goal.status === 'available') ??
    goals.find((goal) => goal.status === 'available');
  const alternatives = goals.filter(
    (goal) => goal.status === 'available' && goal.id !== selected?.id,
  );
  const allDone = completed.length === goals.length;

  return (
    <section className={styles.progression} aria-label="Skill progression">
      <div className={styles.overview}>
        <span>YOUR PROGRESS</span>
        <strong>
          {completed.length}
          <span> / {goals.length} milestones</span>
        </strong>
        <progress
          aria-label="Completed skill milestones"
          value={completed.length}
          max={goals.length}
        />
      </div>

      {selected ? (
        <section className={styles.focus} aria-label="Current goal">
          <div className={styles.focusLabel}>
            <Target aria-hidden="true" />
            YOUR NEXT GOAL
          </div>
          <div className={styles.focusHeading}>
            <span className={styles.goalIcon}>
              <GoalIcon goal={selected} />
            </span>
            <h3 ref={focusTitle} tabIndex={-1}>
              {selected.title}
            </h3>
          </div>
          <p>{selected.description}</p>
          <GoalProgress goal={selected} />
          <small>Tracked automatically as you climb.</small>
        </section>
      ) : allDone ? (
        <section
          className={styles.mastered}
          aria-label="All skill goals complete"
        >
          <span className={styles.trophy}>
            <Trophy aria-hidden="true" />
          </span>
          <h3>Every milestone, mastered.</h3>
          <p>
            All {goals.length} climbing goals complete.
            <br />
            Take on a daily tower or beat your personal best.
          </p>
        </section>
      ) : null}

      {!allDone && (
        <p className={styles.explanation}>
          Play in any mode, including Practice. Finish a goal in one run;
          completed milestones stay with you.
        </p>
      )}

      {alternatives.length > 0 && (
        <details className={styles.collection}>
          <summary>
            <span>Choose a different goal</span>
            <small>{alternatives.length} available</small>
            <ChevronDown aria-hidden="true" />
          </summary>
          <ul className={styles.choices}>
            {alternatives.map((goal) => (
              <li key={goal.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(goal.id);
                    focusTitle.current?.focus({ preventScroll: false });
                  }}
                  aria-label={'Track goal: ' + goal.title}
                >
                  <GoalIcon goal={goal} />
                  <span>
                    <strong>{goal.title}</strong>
                    <small>{goal.description}</small>
                  </span>
                  <ChevronRight aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {locked.length > 0 && (
        <details className={styles.collection}>
          <summary>
            <span>Coming next</span>
            <small>{locked.length} to unlock</small>
            <ChevronDown aria-hidden="true" />
          </summary>
          <ul className={styles.locked}>
            {locked.map((goal) => (
              <li key={goal.id}>
                <LockKeyhole aria-hidden="true" />
                <span>
                  <strong>{goal.title}</strong>
                  <small>
                    First:{' '}
                    {goal.requires
                      .filter((id) => !profile.completed.includes(id))
                      .map(
                        (id) =>
                          SKILL_GOALS.find((item) => item.id === id)?.title,
                      )
                      .join(' · ')}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {completed.length > 0 && (
        <details className={styles.collection}>
          <summary>
            <span>Completed milestones</span>
            <small>{completed.length} earned</small>
            <ChevronDown aria-hidden="true" />
          </summary>
          <ul className={styles.completed}>
            {completed.map((goal) => (
              <li key={goal.id}>
                <Check aria-hidden="true" />
                <span>{goal.title}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <output className="sr-only" aria-live="polite">
        {selected
          ? 'Tracking: ' + selected.title
          : allDone
            ? 'All skill milestones complete.'
            : ''}
      </output>
    </section>
  );
}
