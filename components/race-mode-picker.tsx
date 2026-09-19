'use client';

import {
  RACE_MODE_LABELS,
  RACE_MODE_DESCRIPTIONS,
  type RaceMode,
} from '@/lib/race-protocol';
import styles from './race-mode-picker.module.css';

export function RaceModePicker({
  value,
  onChange,
  disabled,
}: {
  value: RaceMode;
  onChange: (mode: RaceMode) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className={styles.picker} disabled={disabled}>
      <legend>Race mode</legend>
      <div>
        {(['arcade', 'party'] as const).map((mode) => (
          <label
            key={mode}
            aria-label={`${RACE_MODE_LABELS[mode]}: ${RACE_MODE_DESCRIPTIONS[mode]}`}
          >
            <input
              type="radio"
              name="race-mode"
              value={mode}
              checked={value === mode}
              onChange={() => onChange(mode)}
            />
            <span>
              <strong>{RACE_MODE_LABELS[mode]}</strong>
              <small>{RACE_MODE_DESCRIPTIONS[mode]}</small>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
