import { ArrowUp, Check, Diamond, Target, X } from 'lucide-react';
import type { QuickChallenge } from '@/lib/tower-engine';

export function QuickChallenges({ challenges, compact = false, preview = false }: {
  challenges: QuickChallenge[]; compact?: boolean; preview?: boolean;
}) {
  const completed = challenges.filter(challenge => challenge.status === 'complete');
  return <section className={`quick-challenges${compact ? ' challenges-compact' : ''}`} aria-label="Quick challenges">
    <div className="challenges-heading"><span><Target size={15} /> Quick challenges</span><small>{preview ? 'PER RUN' : `${completed.length} / 3`}</small></div>
    <ul>{challenges.map(challenge => {
      const done = challenge.status === 'complete';
      const failed = challenge.status === 'failed';
      const Icon = done ? Check : failed ? X : challenge.id === 'crystals' ? Diamond : ArrowUp;
      const label = challenge.id === 'combo' ? 'Floor 30 · unbroken combo' : challenge.id === 'crystals' ? 'Collect 10 crystals' : 'Perform 5 wall jumps';
      return <li key={challenge.id} className={`challenge-${challenge.status}`}>
        <Icon size={16} aria-hidden="true" />
        <div className="challenge-detail">
          <div className="challenge-label"><strong>{compact ? label : challenge.title}</strong><span>{done ? 'Done' : failed ? 'Broken' : `${challenge.progress}/${challenge.target}`}</span></div>
          {!compact && <p>{challenge.description}</p>}
          <progress aria-label={label} value={challenge.progress} max={challenge.target} />
          {!compact && failed && <small className="challenge-note">Combo broken — try again next run.</small>}
          {!compact && challenge.status === 'missed' && <small className="challenge-note">Run ended — try again next climb.</small>}
        </div>
      </li>;
    })}</ul>
    {!preview && <output className="sr-only">{completed.length ? `Challenge complete: ${completed.map(challenge => challenge.title).join(', ')}.` : ''}{challenges.some(challenge => challenge.status === 'failed') ? ' Unbroken ascent failed. Try again next run.' : ''}</output>}
    {!compact && <p className="challenges-footnote">Three fresh goals every climb. Available in Arcade and Practice.</p>}
  </section>;
}
