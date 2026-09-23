'use client';

import { useSyncExternalStore } from 'react';
import { Maximize2, Minimize2, Volume2, Wind } from 'lucide-react';
import { Switch } from './ui/switch';
import styles from './game-settings.module.css';

type Props = {
  sound: boolean;
  music: boolean;
  reducedMotion: boolean;
  quality: boolean;
  onSound: (enabled: boolean) => void;
  onMusic: (enabled: boolean) => void;
  onMotion: (enabled: boolean) => void;
  onQuality: (enabled: boolean) => void;
  onFullscreen: () => void;
};

function subscribeFullscreen(change: () => void) {
  document.addEventListener('fullscreenchange', change);
  return () => document.removeEventListener('fullscreenchange', change);
}
const readFullscreen = () => !!document.fullscreenElement;
const serverFullscreen = () => false;

function Setting({
  id,
  title,
  description,
  checked,
  status,
  onChange,
}: {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  status?: string;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <div className={styles.setting}>
      <label className={styles.copy} htmlFor={id}>
        <strong id={`${id}-label`}>{title}</strong>
        <span id={`${id}-description`}>{description}</span>
      </label>
      <div className={styles.control}>
        <Switch
          className={styles.switch}
          id={id}
          aria-labelledby={`${id}-label`}
          aria-describedby={`${id}-description`}
          checked={checked}
          onCheckedChange={onChange}
        />
        <span className={styles.state} data-on={checked} aria-hidden="true">
          {status ?? (checked ? 'On' : 'Off')}
        </span>
      </div>
    </div>
  );
}

export function GameSettings(props: Props) {
  const fullscreen = useSyncExternalStore(
    subscribeFullscreen,
    readFullscreen,
    serverFullscreen,
  );
  return (
    <div className={styles.settings}>
      <div className={styles.groups}>
        <section
          className={styles.group}
          aria-labelledby="settings-audio-heading"
        >
          <header>
            <Volume2 aria-hidden="true" />
            <h3 id="settings-audio-heading">Audio</h3>
          </header>
          <p>Set the sound of your climb.</p>
          <Setting
            id="setting-sound"
            title="Game sound"
            description="All audio, including music."
            checked={props.sound}
            onChange={props.onSound}
          />
          <Setting
            id="setting-music"
            title="Background music"
            description={
              props.sound
                ? 'A soundtrack for your ascent.'
                : 'Turn on game sound to hear music.'
            }
            checked={props.music}
            status={!props.sound && props.music ? 'Muted' : undefined}
            onChange={props.onMusic}
          />
          <div className={styles.groupNote} data-muted={!props.sound}>
            <span aria-hidden="true" />
            {props.sound
              ? 'Sound is on. Music is your choice.'
              : 'All audio is muted. Your music choice is kept.'}
          </div>
        </section>
        <section
          className={styles.group}
          aria-labelledby="settings-comfort-heading"
        >
          <header>
            <Wind aria-hidden="true" />
            <h3 id="settings-comfort-heading">Feel & detail</h3>
          </header>
          <p>Make the tower comfortable.</p>
          <Setting
            id="setting-motion"
            title="Reduce motion"
            description="Less camera shake and movement."
            checked={props.reducedMotion}
            onChange={props.onMotion}
          />
          <Setting
            id="setting-quality"
            title="High quality effects"
            description="Richer lighting. Turn off for smoother play."
            checked={props.quality}
            onChange={props.onQuality}
          />
          <div className={styles.groupNote}>
            <span aria-hidden="true" />
            Changes apply to your current climb.
          </div>
        </section>
      </div>
      <section
        className={styles.fullscreen}
        aria-labelledby="settings-fullscreen-heading"
      >
        {fullscreen ? (
          <Minimize2 aria-hidden="true" />
        ) : (
          <Maximize2 aria-hidden="true" />
        )}
        <div>
          <h3 id="settings-fullscreen-heading">Room to climb.</h3>
          <p>
            {fullscreen
              ? 'The tower is filling your screen.'
              : 'Fill your screen with the tower.'}
          </p>
        </div>
        <button onClick={props.onFullscreen}>
          {fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          {fullscreen ? (
            <Minimize2 size={16} aria-hidden="true" />
          ) : (
            <Maximize2 size={16} aria-hidden="true" />
          )}
        </button>
      </section>
    </div>
  );
}
