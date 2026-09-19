'use client';

import { Check } from 'lucide-react';
import { CharacterPreview } from '@/components/wardrobe-preview';
import { COSMETICS, cssColor } from '@/lib/outfits';
import { RACE_NAME_MAX_LENGTH } from '@/lib/race-profile';
import type { RaceProfile } from '@/lib/race-protocol';
import styles from './race-profile-editor.module.css';

export function RaceProfileEditor({
  profile,
  onChange,
  disabled = false,
  compact = false,
}: {
  profile: RaceProfile;
  onChange: (profile: RaceProfile) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const KitContainer = compact ? 'details' : 'div';
  return (
    <div className={styles.editor}>
      <label className={styles.name} htmlFor="race-player-name">
        Your name
        <input
          id="race-player-name"
          value={profile.name}
          disabled={disabled}
          autoComplete="off"
          placeholder="Choose a name"
          onChange={(event) =>
            onChange({
              ...profile,
              name: Array.from(event.target.value)
                .slice(0, RACE_NAME_MAX_LENGTH)
                .join(''),
            })
          }
          aria-describedby="race-name-hint"
        />
      </label>
      <small id="race-name-hint" className={styles.hint}>
        Up to {RACE_NAME_MAX_LENGTH} characters. Visible to everyone in your
        race.
      </small>
      <KitContainer className={compact ? styles.kitDetails : undefined}>
        {compact && <summary>Customize your climber</summary>}
        <div className={styles.customize}>
          <div className={styles.preview}>
            <CharacterPreview outfit={profile.outfit} />
          </div>
          <div className={styles.choices}>
            {(['hat', 'sweater'] as const).map((slot) => (
              <fieldset key={slot} disabled={disabled}>
                <legend>{slot === 'hat' ? 'Beanie' : 'Sweater'}</legend>
                <div className={styles.swatches}>
                  {COSMETICS.filter((item) => item.slot === slot).map(
                    (item) => (
                      <button
                        key={item.id}
                        type="button"
                        title={item.name}
                        aria-label={item.name}
                        aria-pressed={profile.outfit[slot] === item.id}
                        onClick={() =>
                          onChange({
                            ...profile,
                            outfit: { ...profile.outfit, [slot]: item.id },
                          })
                        }
                      >
                        <span
                          style={{ backgroundColor: cssColor(item.colors[0]) }}
                        >
                          {profile.outfit[slot] === item.id && (
                            <Check size={15} />
                          )}
                        </span>
                      </button>
                    ),
                  )}
                </div>
              </fieldset>
            ))}
          </div>
        </div>
        <small className={styles.hint}>
          Every color is available in multiplayer races.
        </small>
      </KitContainer>
    </div>
  );
}
