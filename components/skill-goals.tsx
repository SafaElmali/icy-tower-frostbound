import { Check, LockKeyhole, Target } from 'lucide-react';
import { getFeaturedSkillGoal, getSkillGoals, SKILL_GOALS, type SkillGoalView, type SkillProgress, type SkillRun } from '@/lib/skill-goals';
import styles from './skill-goals.module.css';

function GoalProgress({ goal }: { goal: SkillGoalView }) {
  return <div className={styles.progress}>{goal.progress.map(item => <div key={item.label}>
    <span>{item.label}<strong>{item.value}/{item.target}</strong></span>
    <progress aria-label={`${goal.title}: ${item.label}`} value={item.value} max={item.target} />
  </div>)}</div>;
}

export function FeaturedSkillGoal({ profile, snapshot }: { profile: SkillProgress; snapshot?: SkillRun }) {
  const goal = getFeaturedSkillGoal(profile, snapshot);
  return <section className={styles.featured} aria-label="Featured skill goal">
    <div className={styles.heading}><Target size={15} aria-hidden="true" /><span>{goal ? 'Next goal' : 'Skill goals complete'}</span></div>
    <strong>{goal?.title ?? 'You mastered the climbing milestones'}</strong>
    {goal ? <GoalProgress goal={goal} /> : <p>Choose a daily tower or chase your personal best.</p>}
  </section>;
}

export function SkillGoalProgression({ profile, snapshot, onSelect }: { profile: SkillProgress; snapshot?: SkillRun; onSelect: (id: string) => void }) {
  const goals = getSkillGoals(profile, snapshot);
  return <section className={styles.progression} aria-label="Skill progression">
    <div className={styles.heading}><Target size={17} aria-hidden="true" /><strong>Climbing skills</strong><small>{profile.completed.length} / {goals.length}</small></div>
    <p>Learn in any mode, including Practice. Completed milestones stay with you. Each goal’s counters start fresh every run.</p>
    <ul>{goals.map(goal => <li key={goal.id} className={`${styles.goal} ${goal.featured ? styles.selected : ''}`}>
      <div className={styles.goalHeading}>
        {goal.status === 'complete' ? <Check size={17} aria-hidden="true" /> : goal.status === 'locked' ? <LockKeyhole size={16} aria-hidden="true" /> : <Target size={16} aria-hidden="true" />}
        <strong>{goal.title}</strong><span>{goal.status === 'complete' ? 'Complete' : goal.status === 'locked' ? 'Locked' : goal.featured ? 'Featured' : 'Available'}</span>
      </div>
      <p>{goal.description}</p>
      {goal.status === 'locked' ? <small>First complete: {goal.requires.filter(id => !profile.completed.includes(id)).map(id => SKILL_GOALS.find(item => item.id === id)?.title).join(' · ')}.</small> : <GoalProgress goal={goal} />}
      {goal.status === 'available' && <button type="button" className={styles.select} aria-pressed={goal.featured} onClick={() => onSelect(goal.id)}>{goal.featured ? 'Featured during your climb' : 'Choose this goal'}</button>}
    </li>)}</ul>
  </section>;
}
