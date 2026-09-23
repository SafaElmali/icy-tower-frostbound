'use client';

import { useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  Flag,
  Globe2,
  LockKeyhole,
  Pencil,
  ShieldCheck,
  Snowflake,
  Users,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { RaceProfileEditor } from './race-profile-editor';
import { RaceLobbyBrowser } from './race-lobby-browser';
import { RaceModePicker } from './race-mode-picker';
import { OutfitBadges } from './wardrobe';
import { normalizeRaceProfile } from '@/lib/race-profile';
import type {
  RaceMode,
  RaceProfile,
  RaceVisibility,
} from '@/lib/race-protocol';
import styles from './race-entry.module.css';

type Props = {
  profile: RaceProfile;
  onProfileChange: (profile: RaceProfile) => void;
  visibility: RaceVisibility;
  onVisibilityChange: (visibility: RaceVisibility) => void;
  mode: RaceMode;
  onModeChange: (mode: RaceMode) => void;
  invited: boolean;
  busy: boolean;
  loaded: boolean;
  failed: boolean;
  onConnect: () => void;
  onJoin: (id: string) => void;
  onBrowse: () => void;
};

export function RaceEntry(props: Props) {
  const [editing, setEditing] = useState(false);
  const hostHeading = useRef<HTMLHeadingElement>(null);
  const profile = normalizeRaceProfile(props.profile);
  const disabled = !props.loaded || props.busy || props.failed;
  function showHost() {
    const reduced =
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      document.documentElement.dataset.reducedMotion === 'true';
    hostHeading.current?.focus({ preventScroll: true });
    hostHeading.current?.scrollIntoView({
      block: 'start',
      behavior: reduced ? 'auto' : 'smooth',
    });
  }
  return (
    <>
      <section className={styles.entry} aria-labelledby="race-heading">
        <div className={styles.content}>
          <header className={styles.heading}>
            <div>
              <h1 id="race-heading">
                {props.invited ? 'Your rivals await.' : 'Race together.'}
              </h1>
              <p>
                {props.invited
                  ? 'Your invitation is ready. Meet the others at the tower.'
                  : 'Two to four climbers. One frozen tower.'}
              </p>
            </div>
            {!props.invited && (
              <button
                className={styles.hostShortcut}
                onClick={showHost}
                disabled={props.busy}
              >
                <Flag size={17} aria-hidden="true" /> Host a lobby{' '}
                <ArrowRight size={17} aria-hidden="true" />
              </button>
            )}
          </header>
          <aside className={styles.climber} aria-label="Your race profile">
            <span className={styles.identityIcon}>
              <Snowflake aria-hidden="true" />
            </span>
            <div className={styles.identity}>
              <span>Racing as</span>
              <strong>{profile.name}</strong>
            </div>
            <OutfitBadges outfit={profile.outfit} />
            <p className={styles.profileNote}>
              Your name and kit are visible to other climbers.
            </p>
            <button
              className={styles.edit}
              disabled={props.busy}
              onClick={() => setEditing(true)}
              aria-haspopup="dialog"
              aria-label="Edit your name and outfit"
            >
              <Pencil size={16} aria-hidden="true" />
              <span>Edit climber</span>
            </button>
          </aside>
          {props.invited ? (
            <div className={styles.invitation}>
              <Users size={36} aria-hidden="true" />
              <h2>A place in the race.</h2>
              <p>
                Join with your climber, check the race rules, then ready up
                together.
              </p>
              <button
                className={styles.primary}
                disabled={disabled}
                onClick={props.onConnect}
              >
                {props.busy
                  ? 'Joining…'
                  : props.failed
                    ? 'Tower unavailable'
                    : !props.loaded
                      ? 'Loading tower…'
                      : 'Join race'}
                <ArrowRight size={18} aria-hidden="true" />
              </button>
              <button
                className={styles.back}
                disabled={props.busy}
                onClick={props.onBrowse}
              >
                Browse other lobbies
              </button>
            </div>
          ) : (
            <div className={styles.layout}>
              <div className={styles.matchmaking}>
                <RaceLobbyBrowser
                  disabled={disabled}
                  onJoin={props.onJoin}
                  onHost={showHost}
                />
                <footer className={styles.rulesNote}>
                  <span>
                    <ShieldCheck size={16} aria-hidden="true" /> Checkpoint
                    recoveries
                  </span>
                  <span>
                    <Users size={16} aria-hidden="true" /> Everyone ready to
                    start
                  </span>
                </footer>
              </div>
              <section
                className={styles.host}
                aria-labelledby="host-lobby-heading"
              >
                <div className={styles.hostHeading}>
                  <h2 id="host-lobby-heading" ref={hostHeading} tabIndex={-1}>
                    Make it your race.
                  </h2>
                  <p>Choose a mode, invite your rivals, and ready up.</p>
                </div>
                <RaceModePicker
                  value={props.mode}
                  onChange={props.onModeChange}
                  disabled={props.busy}
                />
                <fieldset className={styles.visibility} disabled={props.busy}>
                  <legend>Who can join?</legend>
                  {(
                    [
                      {
                        value: 'public',
                        title: 'Everyone',
                        description: 'Listed in open lobbies.',
                        Icon: Globe2,
                      },
                      {
                        value: 'private',
                        title: 'Just friends',
                        description: 'Only through your invite link.',
                        Icon: LockKeyhole,
                      },
                    ] as const
                  ).map(({ value, title, description, Icon }) => (
                    <label key={value}>
                      <input
                        type="radio"
                        name="race-visibility"
                        value={value}
                        checked={props.visibility === value}
                        onChange={() => props.onVisibilityChange(value)}
                      />
                      <Icon
                        className={styles.visibilityIcon}
                        aria-hidden="true"
                      />
                      <span>
                        <strong>{title}</strong>
                        <small>{description}</small>
                      </span>
                      <Check
                        className={styles.selectedIcon}
                        size={17}
                        aria-hidden="true"
                      />
                    </label>
                  ))}
                </fieldset>
                <button
                  className={styles.primary}
                  disabled={disabled}
                  onClick={props.onConnect}
                >
                  {props.busy
                    ? 'Creating lobby…'
                    : props.failed
                      ? 'Tower unavailable'
                      : !props.loaded
                        ? 'Loading tower…'
                        : props.visibility === 'public'
                          ? 'Create public lobby'
                          : 'Create private lobby'}
                  <ArrowRight size={18} aria-hidden="true" />
                </button>
                <p className={styles.hostNote}>
                  {props.visibility === 'public'
                    ? 'Your name and race rules will be visible in the lobby list.'
                    : 'You’ll get a link to invite up to three friends.'}{' '}
                  Fine-tune rules in your lobby.
                </p>
              </section>
            </div>
          )}
        </div>
      </section>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className={styles.profileDialog}>
          <DialogTitle>Your race identity.</DialogTitle>
          <DialogDescription>
            Choose the name and colors your rivals will see.
          </DialogDescription>
          <RaceProfileEditor
            profile={props.profile}
            onChange={props.onProfileChange}
            disabled={props.busy}
          />
          <button className={styles.primary} onClick={() => setEditing(false)}>
            Done <Check size={17} aria-hidden="true" />
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}
