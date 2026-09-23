import type { GameMode } from '@/lib/tower-engine';
import styles from '@/app/game-menu.module.css';

const previews = {
  arcade: {
    title: 'Beat the frost.',
    description: 'Keep your momentum. Every floor buys a little more time.',
    traits: ['Rising frost', 'Ranked runs'],
  },
  party: {
    title: 'Catch more air.',
    description:
      'Spring higher, float longer, and turn crystals into double jumps.',
    traits: ['Low gravity', 'Spring platforms'],
  },
  practice: {
    title: 'Find your rhythm.',
    description: 'Take your time. Build confidence one landing at a time.',
    traits: ['No rising frost', 'Unranked runs'],
  },
};

export function ModePreview({ mode }: { mode: GameMode }) {
  const preview = previews[mode];
  return (
    <div className={styles.preview} data-mode={mode}>
      <svg
        className={styles.routeArt}
        viewBox="0 0 320 160"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M22 137H102M129 97H206M224 48H296"
          stroke="currentColor"
          strokeWidth="7"
        />
        <path
          d="M22 143H102M129 103H206M224 54H296"
          stroke="currentColor"
          strokeOpacity=".2"
          strokeWidth="5"
        />
        <path
          d={
            mode === 'party'
              ? 'M58 128Q97 0 159 88Q203 -35 260 39'
              : 'M58 128Q108 40 159 88Q202 -2 260 39'
          }
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="4 6"
          opacity=".65"
        />
        <circle cx="58" cy="128" r="5" fill="currentColor" />
        <circle cx="159" cy="88" r="5" fill="currentColor" />
        <circle cx="260" cy="39" r="5" fill="currentColor" />
        {mode === 'arcade' && (
          <path
            d="M0 157L24 149L49 155L78 148L110 156L140 149L175 155L202 148L235 156L264 149L298 156L320 150"
            stroke="currentColor"
            opacity=".3"
          />
        )}
        {mode === 'party' && (
          <path
            d="M162 114l8 5-8 5 8 5-8 5M263 65l8 5-8 5 8 5-8 5"
            stroke="currentColor"
            strokeWidth="2"
          />
        )}
      </svg>
      <div className={styles.previewCopy} key={mode}>
        <h3>{preview.title}</h3>
        <p>{preview.description}</p>
        <ul>
          {preview.traits.map((trait) => (
            <li key={trait}>{trait}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
