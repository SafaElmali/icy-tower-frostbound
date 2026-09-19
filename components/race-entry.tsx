'use client';

import { useRef, useState, useSyncExternalStore } from 'react';
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { CharacterPreview } from './wardrobe-preview';
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

const portraitQuery = '(min-width: 801px)';
function subscribePortrait(onChange: () => void) {
  const query = window.matchMedia(portraitQuery);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
const getPortraitSnapshot = () => window.matchMedia(portraitQuery).matches;
const getServerPortraitSnapshot = () => false;

export function RaceEntry(props: Props) {
  const [view, setView] = useState('join');
  const [editing, setEditing] = useState(false);
  const hostTab = useRef<HTMLButtonElement>(null);
  const showPortrait = useSyncExternalStore(
    subscribePortrait,
    getPortraitSnapshot,
    getServerPortraitSnapshot,
  );
  const profile = normalizeRaceProfile(props.profile);
  const disabled = !props.loaded || props.busy || props.failed;
  function showHost() {
    setView('host');
    hostTab.current?.focus();
  }

  return (
    <>
      <section className={styles.entry} aria-labelledby="race-heading">
        <header className={styles.heading}>
          <p className={styles.kicker}>
            <span /> MULTIPLAYER · 2–4 CLIMBERS
          </p>
          <h1 id="race-heading">
            {props.invited ? 'Your rivals await.' : 'Better together.'}
          </h1>
          <p>
            {props.invited
              ? 'Your invitation is ready. Meet the others at the tower.'
              : 'One frozen tower. A little friendly competition.'}
          </p>
        </header>
        <div className={styles.layout}>
          <aside className={styles.climber} aria-label="Your race profile">
            <div className={styles.portrait}>
              {showPortrait && !editing && (
                <CharacterPreview outfit={profile.outfit} />
              )}
            </div>
            <div className={styles.identity}>
              <span className={styles.identityIcon}>
                <Snowflake aria-hidden="true" />
              </span>
              <div>
                <span className={styles.kicker}>YOUR CLIMBER</span>
                <strong>{profile.name}</strong>
                <OutfitBadges outfit={profile.outfit} />
              </div>
              <button
                className={styles.edit}
                disabled={props.busy}
                onClick={() => setEditing(true)}
                aria-haspopup="dialog"
                aria-label="Edit your name and outfit"
              >
                <Pencil size={15} aria-hidden="true" />
                <span>Edit</span>
              </button>
            </div>
            <p className={styles.profileNote}>
              Your name is visible to other climbers.
            </p>
          </aside>
          <div className={styles.matchmaking}>
            {props.invited ? (
              <div className={styles.invitation}>
                <span className={styles.seal}>
                  <Users size={28} aria-hidden="true" />
                </span>
                <p className={styles.kicker}>YOU’RE INVITED</p>
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
              <Tabs
                value={view}
                onValueChange={(value) => setView(String(value))}
                className={styles.tabs}
              >
                <TabsList
                  className={styles.tabList}
                  aria-label="Multiplayer activity"
                >
                  <TabsTrigger value="join" disabled={props.busy}>
                    <Users aria-hidden="true" />
                    Join a lobby
                  </TabsTrigger>
                  <TabsTrigger value="host" ref={hostTab} disabled={props.busy}>
                    <Flag aria-hidden="true" />
                    Host a lobby
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="join" className={styles.panel}>
                  <RaceLobbyBrowser
                    disabled={disabled}
                    onJoin={props.onJoin}
                    onHost={showHost}
                  />
                </TabsContent>
                <TabsContent value="host" className={styles.panel}>
                  <div className={styles.hostHeading}>
                    <p className={styles.kicker}>SET THE INVITATION</p>
                    <h2>Your tower. Your rivals.</h2>
                    <p>
                      Pick your mode and who can join. Fine-tune rules in your
                      lobby.
                    </p>
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
                          title: 'Open to everyone',
                          description:
                            'Listed in open lobbies. Meet new rivals.',
                          Icon: Globe2,
                        },
                        {
                          value: 'private',
                          title: 'Just your friends',
                          description:
                            'Unlisted. Join only through your invite link.',
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
                      : 'You’ll get a link to invite up to three friends.'}
                  </p>
                </TabsContent>
              </Tabs>
            )}
            <footer className={styles.rulesNote}>
              <span>
                <ShieldCheck size={15} aria-hidden="true" />
                Checkpoint recoveries
              </span>
              <span>
                <Users size={15} aria-hidden="true" />
                Everyone ready to start
              </span>
            </footer>
          </div>
        </div>
      </section>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className={styles.profileDialog}>
          <p className={styles.kicker}>MAKE AN ENTRANCE</p>
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
            Done
            <Check size={17} aria-hidden="true" />
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}
