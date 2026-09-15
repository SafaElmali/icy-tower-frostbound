'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Copy,
  Flag,
  Hand,
  RotateCcw,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  RaceConnection,
  RaceRequestError,
  newRaceSession,
  readRaceSession,
} from '@/lib/race-client';
import { RaceRival, RaceRunner } from '@/lib/race-runner';
import { RacePeer } from '@/lib/race-peer';
import {
  DEFAULT_RACE_SETTINGS,
  RACE_API,
  RACE_DISCONNECT_MS,
  RACE_POLL_MS,
  otherSlot,
  raceInvite,
  validRaceId,
  type RacePose,
  type RaceSession,
  type RaceSettings,
  type RaceView,
} from '@/lib/race-protocol';
import { TowerEngine, type Controls } from '@/lib/tower-engine';
import { TowerInput } from '@/lib/tower-input';
import { TowerAudio } from '@/lib/tower-audio';
import { readProfile, OUTFIT_STORAGE_KEY } from '@/lib/outfits';
import type { TowerWorld } from '@/lib/tower-world';
import styles from './race-game.module.css';

const sessionKey = (room: string) => `frostbound-race:${room}`;
const seconds = (value: number) =>
  `${Math.floor(value / 60)}:${Math.floor(value % 60)
    .toString()
    .padStart(2, '0')}`;
const sameSettings = (a: RaceSettings, b: RaceSettings) =>
  a.targetFloor === b.targetFloor &&
  a.durationMs === b.durationMs &&
  a.bumping === b.bumping;

export function RaceGame() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const world = useRef<TowerWorld | null>(null);
  const connection = useRef<RaceConnection | null>(null);
  const runner = useRef<RaceRunner | null>(null);
  const peer = useRef<RacePeer | null>(null);
  const friendPoseRef = useRef<RacePose | null>(null);
  const shovePending = useRef(false);
  const nextShoveAt = useRef(0);
  const sendSequence = useRef(0);
  const wakePoll = useRef<(() => void) | null>(null);
  const rival = useRef(new RaceRival());
  const input = useRef(new TowerInput());
  const audio = useRef<TowerAudio | null>(null);
  const soundRef = useRef(true);
  const roomRef = useRef<RaceView | null>(null);
  const [room, setRoom] = useState<RaceView | null>(null);
  const [session, setSession] = useState<RaceSession | null>(null);
  const [inviteRoom, setInviteRoom] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [renderError, setRenderError] = useState('');
  const [networkError, setNetworkError] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [invite, setInvite] = useState('');
  const [sound, setSound] = useState(true);
  const [clock, setClock] = useState(0);
  const [floor, setFloor] = useState(0);
  const [climbEnded, setClimbEnded] = useState(false);
  const [finishKind, setFinishKind] = useState<'goal' | 'time' | null>(null);
  const [respawnFloor, setRespawnFloor] = useState<number | null>(null);
  const [friendPose, setFriendPose] = useState<RacePose | null>(null);
  const [peerState, setPeerState] = useState<
    'connecting' | 'live' | 'fallback'
  >('connecting');
  const [shoveReady, setShoveReady] = useState(true);
  const [draftSettings, setDraftSettings] = useState<RaceSettings>({
    ...DEFAULT_RACE_SETTINGS,
  });
  const [pressed, setPressed] = useState<Controls>({
    left: false,
    right: false,
    jump: false,
  });

  const resetInput = () => {
    input.current.reset();
    setPressed({ ...input.current.controls });
  };
  function closePeer() {
    peer.current?.close();
    peer.current = null;
  }

  function receivePose(pose: RacePose, round: number, source: 'peer' | 'http') {
    if (round !== roomRef.current?.round) return;
    if (friendPoseRef.current && pose.time < friendPoseRef.current.time) return;
    friendPoseRef.current = pose;
    rival.current.receive(pose, performance.now(), false, source);
  }

  function receive(next: RaceView) {
    const previous = roomRef.current;
    if (
      runner.current?.round !== next.round ||
      previous?.id !== next.id ||
      (previous && !sameSettings(previous.settings, next.settings))
    ) {
      runner.current = new RaceRunner(next.round, next.seed, next.settings);
      rival.current = new RaceRival();
      friendPoseRef.current = null;
      nextShoveAt.current = 0;
      sendSequence.current = 0;
      resetInput();
      setFloor(0);
      setFriendPose(null);
      setClimbEnded(false);
      setFinishKind(null);
      setRespawnFloor(null);
      setDraftSettings({ ...next.settings });
    }
    roomRef.current = next;
    setRoom(next);
    runner.current?.applyBumps(next.bumps, next.you);
    const friend = next.players.find((p) => p.slot !== next.you);
    if (friend?.pose) receivePose(friend.pose, next.round, 'http');
    const client = connection.current;
    if (!peer.current && client) {
      const stream = new RacePeer({
        roomId: next.id,
        slot: next.you,
        onPose: (pose, round) => {
          if (connection.current === client) receivePose(pose, round, 'peer');
        },
        onState: (state) => {
          if (connection.current === client) setPeerState(state);
        },
        onRoomUpdate: () => {
          if (connection.current === client) wakePoll.current?.();
        },
        onSignal: async (signal) => {
          const current = roomRef.current;
          if (connection.current !== client || !current) return;
          await client.send({ action: 'signal', round: current.round, signal });
        },
      });
      peer.current = stream;
    }
    peer.current?.sync(next);
    peer.current?.notifyBumps(next.bumps);
    if (
      (next.phase === 'finishing' || next.phase === 'finished') &&
      runner.current &&
      !runner.current.recording
    ) {
      runner.current.finish();
      if (next.phase === 'finishing') wakePoll.current?.();
    }
  }

  async function connect(join: boolean, restored?: RaceSession | null) {
    if (busy) return;
    setBusy(true);
    setNetworkError('');
    setBlocked(false);
    setSession(null);
    setCopied(false);
    const next =
      restored ?? newRaceSession(join && inviteRoom ? inviteRoom : undefined);
    closePeer();
    setPeerState('connecting');
    const previous = connection.current;
    if (previous?.view && previous.view.phase !== 'finished') {
      try {
        await previous.send({ action: 'leave', round: previous.view.round });
      } catch {
        /* A lost connection expires on the server. */
      }
    }
    previous?.close();
    closePeer();
    const client = new RaceConnection(next, receive);
    connection.current = client;
    runner.current = null;
    roomRef.current = null;
    setRoom(null);
    try {
      const view = await client.send({ action: join ? 'join' : 'create' });
      try {
        sessionStorage.setItem(sessionKey(next.room), JSON.stringify(next));
      } catch {
        /* The current tab still owns its session. */
      }
      const link = raceInvite(window.location.href, next.room);
      window.history.replaceState(window.history.state, '', link);
      setInvite(link);
      // A reload must not give one player a fresh attempt in an active round.
      if (restored && (view.phase === 'racing' || view.phase === 'finishing'))
        await client.send({ action: 'leave', round: view.round });
      else if (restored && view.phase === 'countdown')
        await client.send({ action: 'ready', round: view.round, ready: false });
      setSession(next);
    } catch (error) {
      setNetworkError(
        error instanceof Error ? error.message : 'Could not open the race.',
      );
      client.close();
      closePeer();
      connection.current = null;
      roomRef.current = null;
      setRoom(null);
      setSession(null);
    } finally {
      setBusy(false);
    }
  }

  async function act(action: 'ready' | 'rematch') {
    const client = connection.current,
      current = roomRef.current;
    if (!client || !current || busy) return;
    setBusy(true);
    setNetworkError('');
    audio.current ??= new TowerAudio();
    audio.current.setEnabled(soundRef.current);
    try {
      await client.send({
        action,
        round: current.round,
        ready: !current.players.find((p) => p.slot === current.you)?.ready,
      });
    } catch (error) {
      setNetworkError(
        error instanceof Error ? error.message : 'Could not update this race.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function configure() {
    const client = connection.current,
      current = roomRef.current;
    if (
      !client ||
      !current ||
      current.you !== 'host' ||
      current.phase !== 'waiting' ||
      current.players.find((player) => player.slot === current.you)?.ready ||
      busy
    )
      return;
    setBusy(true);
    setNetworkError('');
    try {
      await client.send({
        action: 'configure',
        round: current.round,
        settings: draftSettings,
      });
    } catch (error) {
      setNetworkError(
        error instanceof Error ? error.message : 'Could not save race rules.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function shove() {
    const client = connection.current,
      current = roomRef.current,
      local = runner.current;
    if (
      !client ||
      !current?.settings.bumping ||
      !local?.started ||
      local.recording ||
      local.respawning ||
      local.protected ||
      current.phase !== 'racing' ||
      shovePending.current ||
      client.now() < nextShoveAt.current
    )
      return;
    shovePending.current = true;
    nextShoveAt.current = client.now() + 1_500;
    setShoveReady(false);
    try {
      await client.send({
        action: 'bump',
        round: current.round,
        direction: local.engine.facing < 0 ? -1 : 1,
        pose: local.pose,
        seq: sendSequence.current++,
      });
    } catch (error) {
      if (
        connection.current === client &&
        !(error instanceof RaceRequestError && error.status === 409)
      ) {
        setNetworkError(
          error instanceof Error
            ? error.message
            : 'Could not shove. Try again.',
        );
      }
    } finally {
      shovePending.current = false;
    }
  }

  async function leave() {
    resetInput();
    setBusy(true);
    const client = connection.current;
    try {
      if (client?.view)
        await client.send({ action: 'leave', round: client.view.round });
    } catch {
      /* The server also detects missing heartbeats. */
    }
    peer.current?.close();
    client?.close();
    window.location.assign('/');
  }

  useEffect(() => {
    let disposed = false;
    void Promise.resolve().then(() => {
      if (disposed) return;
      const value = new URLSearchParams(window.location.search).get('room');
      if (value === null) return;
      if (!validRaceId(value)) {
        setNetworkError(
          'This invite link is invalid. Create a new race below.',
        );
        return;
      }
      setInviteRoom(value);
    });
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    const client = connection.current!;
    let stopped = false,
      inFlight = false,
      wakeRequested = false,
      timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (stopped) return;
      if (inFlight) {
        wakeRequested = true;
        return;
      }
      const current = client.view,
        local = runner.current;
      if (!current || !local) return;
      inFlight = true;
      let delay =
        current.phase === 'finishing'
          ? 100
          : current.phase === 'waiting' ||
              current.phase === 'finished' ||
              peer.current?.connected
            ? 1_000
            : RACE_POLL_MS;
      let fatal = false;
      try {
        const me = current.players.find((p) => p.slot === current.you)!;
        await client.send(
          local.recording && !me.result && current.phase !== 'finished'
            ? {
                action: 'finish',
                round: current.round,
                replay: local.recording,
                pose: local.pose,
                seq: sendSequence.current++,
              }
            : {
                action: 'poll',
                round: current.round,
                seq: sendSequence.current++,
                ...(local.started ? { pose: local.pose } : {}),
              },
        );
        if (!stopped) setNetworkError('');
        if (client.view?.phase === 'finishing') delay = 100;
      } catch (error) {
        if (stopped) return;
        fatal =
          error instanceof RaceRequestError &&
          [400, 401, 403, 404, 410].includes(error.status);
        setNetworkError(
          error instanceof RaceRequestError
            ? error.message
            : 'Connection interrupted. Reconnecting…',
        );
        if (fatal) {
          stopped = true;
          setBlocked(true);
        }
        delay = 1_000;
      } finally {
        inFlight = false;
        if (!stopped && !fatal) {
          timer = setTimeout(() => void poll(), wakeRequested ? 0 : delay);
          wakeRequested = false;
        }
      }
    };
    const wake = () => {
      if (stopped) return;
      if (inFlight) {
        wakeRequested = true;
        return;
      }
      clearTimeout(timer);
      void poll();
    };
    wakePoll.current = wake;
    void poll();
    const onPageHide = () => {
      if (!client.view || client.view.phase === 'finished') return;
      void fetch(RACE_API, {
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          action: 'leave',
          room: session.room,
          round: client.view.round,
        }),
      }).catch(() => {});
    };
    window.addEventListener('pagehide', onPageHide);
    return () => {
      stopped = true;
      clearTimeout(timer);
      if (wakePoll.current === wake) wakePoll.current = null;
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [session]);

  useEffect(() => {
    let disposed = false,
      frame = 0,
      previous = 0,
      synced = 0;
    const controls = input.current;
    const idle = new TowerEngine();
    const keyControl = (key: string): keyof Controls | null =>
      key === 'ArrowLeft' || key.toLowerCase() === 'a'
        ? 'left'
        : key === 'ArrowRight' || key.toLowerCase() === 'd'
          ? 'right'
          : key === ' ' || key === 'ArrowUp' || key.toLowerCase() === 'w'
            ? 'jump'
            : null;
    const keyDown = (event: KeyboardEvent) => {
      const local = runner.current,
        current = roomRef.current;
      if (
        !local?.started ||
        local.recording ||
        current?.phase === 'finished' ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return;
      if (event.key.toLowerCase() === 'e' && !event.repeat) {
        event.preventDefault();
        void shove();
        return;
      }
      const control = keyControl(event.key);
      if (!control) return;
      event.preventDefault();
      input.current.press(`key:${event.code}`, control);
    };
    const keyUp = (event: KeyboardEvent) => {
      input.current.release(`key:${event.code}`);
    };
    const blur = () => {
      resetInput();
      audio.current?.setPaused(true);
    };
    const focus = () => audio.current?.setPaused(false);
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', blur);
    window.addEventListener('focus', focus);
    import('@/lib/tower-world')
      .then(async ({ TowerWorld }) => {
        if (disposed || !canvas.current) return;
        const scene = new TowerWorld(canvas.current);
        world.current = scene;
        scene.setQuality(!window.matchMedia('(pointer: coarse)').matches);
        let reduced = window.matchMedia(
          '(prefers-reduced-motion: reduce)',
        ).matches;
        try {
          const preference = localStorage.getItem('frostbound-reduced-motion');
          if (preference !== null) reduced = preference === 'true';
        } catch {
          /* Respect the system preference. */
        }
        scene.setReducedMotion(reduced);
        await scene.load();
        if (disposed) {
          scene.dispose();
          return;
        }
        try {
          scene.setOutfit(
            readProfile(localStorage.getItem(OUTFIT_STORAGE_KEY)).equipped,
          );
        } catch {
          /* Use the starter outfit. */
        }
        setLoaded(true);
        const animate = (now: number) => {
          if (disposed) return;
          const dt = Math.min(0.1, (now - (previous || now)) / 1000);
          previous = now;
          const local = runner.current,
            current = roomRef.current;
          const serverNow = connection.current?.now() ?? Date.now();
          if (local && current) {
            const wasStarted = local.started;
            const wasRecorded = !!local.recording;
            local.advance(
              serverNow,
              current.startAt,
              input.current.controls,
              current.phase === 'finished',
            );
            if (!wasRecorded && local.recording) wakePoll.current?.();
            if (!wasStarted && local.started) {
              resetInput();
              canvas.current?.focus({ preventScroll: true });
              audio.current?.play('jump');
            }
            peer.current?.sendPose(current.round, local.pose);
            for (const event of local.engine.drainEvents()) {
              scene.effect(event, local.engine.time);
              audio.current?.play(event.type);
            }
          }
          rival.current.advance(now, dt);
          scene.render(
            local?.engine ?? idle,
            dt,
            now / 1000,
            current?.phase === 'racing' ||
              current?.phase === 'finishing' ||
              current?.phase === 'finished'
              ? rival.current
              : null,
          );
          if (now - synced > 100) {
            synced = now;
            setClock(serverNow);
            setFloor(
              Math.min(
                current?.settings.targetFloor ??
                  DEFAULT_RACE_SETTINGS.targetFloor,
                local?.engine.floor ?? 0,
              ),
            );
            setFriendPose(friendPoseRef.current);
            setRespawnFloor(local?.respawning ? local.checkpointFloor : null);
            setShoveReady(
              !shovePending.current &&
                !local?.protected &&
                serverNow >= nextShoveAt.current,
            );
            setClimbEnded(!!local?.recording);
            setFinishKind(local?.finished ?? null);
          }
          frame = requestAnimationFrame(animate);
        };
        frame = requestAnimationFrame(animate);
      })
      .catch((error) => {
        if (!disposed)
          setRenderError(
            error instanceof Error
              ? error.message
              : 'The tower could not load.',
          );
      });
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      world.current?.dispose();
      world.current = null;
      peer.current?.close();
      connection.current?.close();
      audio.current?.dispose();
      controls.reset();
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', blur);
      window.removeEventListener('focus', focus);
    };
  }, []);

  const me = room?.players.find((p) => p.slot === room.you);
  const friend = room?.players.find((p) => p.slot === otherSlot(room.you));
  const settings = room?.settings ?? DEFAULT_RACE_SETTINGS;
  const settingsDirty = !sameSettings(draftSettings, settings);
  const settingsValid =
    Number.isInteger(draftSettings.targetFloor) &&
    draftSettings.targetFloor >= 5 &&
    draftSettings.targetFloor <= 100;
  const friendFloor =
    friend?.result?.floor ??
    Math.min(settings.targetFloor, friendPose?.floor ?? 0);
  const countdown = room?.startAt
    ? Math.ceil(Math.max(0, room.startAt - clock) / 1000)
    : 0;
  const active =
    !!room?.startAt && clock >= room.startAt && room.phase !== 'finished';
  const waiting = room?.phase === 'waiting';
  const finished = room?.phase === 'finished';
  const friendOnline = !!friend && clock - friend.lastSeen < RACE_DISCONNECT_MS;
  const verifiedDraw =
    !!me?.result &&
    !!friend?.result &&
    me.result.kind !== 'forfeit' &&
    friend.result.kind !== 'forfeit' &&
    me.result.floor === friend.result.floor;
  const missingResult = !me?.result || !friend?.result;
  const resultTitle = verifiedDraw
    ? 'A close draw.'
    : room?.winner === room?.you
      ? 'You won.'
      : room?.winner
        ? 'Your friend won.'
        : missingResult
          ? 'Race complete.'
          : 'A close draw.';
  const resultText = verifiedDraw
    ? 'Same height. Another climb?'
    : room?.reason === 'forfeit'
      ? 'A player left or lost connection.'
      : missingResult
        ? 'Only verified climbs count. One result was not received.'
        : room?.reason === 'goal'
          ? `Floor ${settings.targetFloor} reached.`
          : room?.reason === 'height'
            ? 'Time’s up. The higher climb takes it.'
            : 'Same height. Another climb?';
  const touch = (
    control: keyof Controls,
    label: string,
    icon: React.ReactNode,
  ) => (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed[control]}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        input.current.press(`touch:${event.pointerId}`, control);
        setPressed({ ...input.current.controls });
      }}
      onPointerUp={(event) => {
        input.current.release(`touch:${event.pointerId}`);
        setPressed({ ...input.current.controls });
      }}
      onPointerCancel={(event) => {
        input.current.release(`touch:${event.pointerId}`);
        setPressed({ ...input.current.controls });
      }}
      onLostPointerCapture={(event) => {
        input.current.release(`touch:${event.pointerId}`);
        setPressed({ ...input.current.controls });
      }}
    >
      {icon}
    </button>
  );

  return (
    <main className={styles.screen}>
      <canvas
        ref={canvas}
        className={styles.canvas}
        tabIndex={-1}
        aria-label="Two-player tower race. A and D to move, Space to jump."
      />
      <header className={styles.topbar}>
        <button type="button" onClick={() => void leave()} disabled={busy}>
          <ArrowLeft size={16} /> {active ? 'Leave race' : 'Back to tower'}
        </button>
        <span>
          <Users size={16} /> TWO PLAYER RACE
        </span>
        <button
          type="button"
          aria-label={sound ? 'Mute sound' : 'Enable sound'}
          onClick={() => {
            const enabled = !sound;
            setSound(enabled);
            soundRef.current = enabled;
            audio.current ??= new TowerAudio();
            audio.current.setEnabled(enabled);
          }}
        >
          {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
      </header>
      {(networkError || renderError) && (
        <div className={styles.error} role="alert">
          {renderError
            ? 'The tower could not load. Try reloading this page.'
            : networkError}
          {blocked && (
            <button onClick={() => void leave()}>Back to tower</button>
          )}
        </div>
      )}

      {!room && (
        <section className={styles.card} aria-labelledby="race-heading">
          <Flag className={styles.emblem} size={30} />
          <p className={styles.kicker}>ONE TOWER. TWO CLIMBERS.</p>
          <h1 id="race-heading">Race a friend.</h1>
          <p>
            Choose the finish line. Climb together.
            <br />
            Fall? Return to a checkpoint and keep going.
          </p>
          <button
            className={styles.primary}
            disabled={!loaded || busy || !!renderError}
            onClick={() => {
              let saved: RaceSession | null = null;
              try {
                if (inviteRoom)
                  saved = readRaceSession(
                    sessionStorage.getItem(sessionKey(inviteRoom)),
                  );
              } catch {
                /* Start a fresh guest session. */
              }
              void connect(!!inviteRoom, saved);
            }}
          >
            {busy
              ? 'Connecting…'
              : !loaded
                ? 'Loading tower…'
                : inviteRoom
                  ? 'Join race'
                  : 'Create a race'}
            <ArrowRight size={18} />
          </button>
          {inviteRoom && (
            <button
              className={styles.textButton}
              disabled={busy || !loaded}
              onClick={() => void connect(false)}
            >
              Create your own race
            </button>
          )}
          <small>A private invite. No account needed.</small>
        </section>
      )}

      {waiting && (
        <section className={styles.card} aria-labelledby="lobby-heading">
          <p className={styles.kicker}>RACE TO FLOOR {settings.targetFloor}</p>
          <h1 id="lobby-heading">
            {friend ? 'Ready to climb?' : 'Bring a friend.'}
          </h1>
          {room.you === 'host' ? (
            <form
              className={styles.rules}
              onSubmit={(event) => {
                event.preventDefault();
                void configure();
              }}
            >
              <div className={styles.ruleFields}>
                <label htmlFor="target-floor">
                  Finish floor
                  <input
                    id="target-floor"
                    type="number"
                    min={5}
                    max={100}
                    step={1}
                    inputMode="numeric"
                    value={
                      Number.isNaN(draftSettings.targetFloor)
                        ? ''
                        : draftSettings.targetFloor
                    }
                    disabled={busy || me?.ready}
                    onChange={(event) =>
                      setDraftSettings({
                        ...draftSettings,
                        targetFloor: event.target.valueAsNumber,
                      })
                    }
                  />
                </label>
                <label htmlFor="race-duration">
                  Time limit
                  <select
                    id="race-duration"
                    value={draftSettings.durationMs}
                    disabled={busy || me?.ready}
                    onChange={(event) =>
                      setDraftSettings({
                        ...draftSettings,
                        durationMs: Number(event.target.value),
                      })
                    }
                  >
                    <option value={60_000}>1 minute</option>
                    <option value={120_000}>2 minutes</option>
                    <option value={180_000}>3 minutes</option>
                    <option value={300_000}>5 minutes</option>
                  </select>
                </label>
              </div>
              <label className={styles.bumpRule}>
                <span>
                  <Hand size={15} /> Allow shoves{' '}
                  <small>Push a nearby friend · E</small>
                </span>
                <input
                  type="checkbox"
                  checked={draftSettings.bumping}
                  disabled={busy || me?.ready}
                  onChange={(event) =>
                    setDraftSettings({
                      ...draftSettings,
                      bumping: event.target.checked,
                    })
                  }
                />
              </label>
              {settingsDirty && (
                <button
                  className={styles.saveRules}
                  disabled={busy || me?.ready || !settingsValid}
                  type="submit"
                >
                  {busy ? 'Saving…' : 'Save rules'}
                </button>
              )}
              <small>
                {me?.ready
                  ? 'Choose Not ready to edit the rules.'
                  : 'Checkpoints every 5 floors. Equal heights draw.'}
              </small>
            </form>
          ) : (
            <div className={styles.agreedRules}>
              <span>
                <Flag size={14} /> Floor {settings.targetFloor}
              </span>
              <span>{settings.durationMs / 60_000} min</span>
              <span>{settings.bumping ? 'Shoves on' : 'Shoves off'}</span>
              <small>
                Your host sets the rules. Checkpoints every 5 floors.
              </small>
            </div>
          )}
          <div className={styles.players}>
            <div>
              <i className={styles.youDot} />
              <span>You</span>
              <small>{me?.ready ? 'Ready' : 'Getting ready'}</small>
              {me?.ready && <Check size={16} />}
            </div>
            <div>
              <i className={styles.friendDot} />
              <span>Friend</span>
              <small>
                {!friend
                  ? 'Waiting to join'
                  : !friendOnline
                    ? 'Disconnected'
                    : friend.ready
                      ? 'Ready'
                      : 'Getting ready'}
              </small>
              {friend?.ready && <Check size={16} />}
            </div>
          </div>
          {!friend && (
            <div className={styles.invite}>
              <label htmlFor="race-invite">Invite link</label>
              <div>
                <input
                  id="race-invite"
                  readOnly
                  value={invite}
                  onFocus={(event) => event.target.select()}
                />
                <button
                  type="button"
                  aria-label="Copy invite link"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(invite);
                      setCopied(true);
                    } catch {
                      setNetworkError(
                        'Select the invite link and copy it to share.',
                      );
                    }
                  }}
                >
                  {copied ? <Check size={17} /> : <Copy size={17} />}
                </button>
              </div>
              <output>
                {copied
                  ? 'Link copied. Send it to your friend.'
                  : 'Open this link on your friend’s device.'}
              </output>
            </div>
          )}
          <button
            className={styles.primary}
            disabled={
              busy ||
              (!friendOnline && !me?.ready) ||
              !loaded ||
              blocked ||
              (room.you === 'host' && settingsDirty && !me?.ready)
            }
            onClick={() => void act('ready')}
          >
            {me?.ready ? 'Not ready' : 'I’m ready'}
            <Check size={18} />
          </button>
          <small>
            {me?.ready
              ? 'Waiting for your friend to ready up.'
              : settingsDirty && room.you === 'host'
                ? 'Save your rules before getting ready.'
                : 'Both players start together.'}
          </small>
        </section>
      )}

      {room?.startAt && !finished && countdown > 0 && (
        <section
          className={styles.countdown}
          aria-live="polite"
          aria-atomic="true"
        >
          <span>RACE TO FLOOR {settings.targetFloor}</span>
          <strong>{countdown}</strong>
          <p>
            {settings.bumping
              ? 'Jump, dodge, and shove.'
              : 'Fall. Respawn. Keep climbing.'}
          </p>
        </section>
      )}
      {active && (
        <>
          <section className={styles.hud} aria-label="Race progress">
            <div>
              <span>
                <i className={styles.youDot} /> YOU
              </span>
              <strong>
                {me?.result?.floor ?? floor}
                <small> / {settings.targetFloor}</small>
              </strong>
              <progress
                aria-label="Your progress"
                value={me?.result?.floor ?? floor}
                max={settings.targetFloor}
              />
            </div>
            <span className={styles.goal}>
              <Flag size={18} />
              <small>
                {seconds(
                  Math.max(0, ((room.deadline ?? clock) - clock) / 1000),
                )}
              </small>
            </span>
            <div>
              <span>
                <i className={styles.friendDot} /> FRIEND
              </span>
              <strong>
                {friendFloor}
                <small> / {settings.targetFloor}</small>
              </strong>
              <progress
                aria-label="Friend progress"
                value={friendFloor}
                max={settings.targetFloor}
              />
            </div>
          </section>
          <div className={styles.raceStatus}>
            <output aria-live="polite">
              {respawnFloor !== null
                ? `Back to floor ${respawnFloor}…`
                : room.phase === 'finishing'
                  ? 'Checking the finish…'
                  : climbEnded
                    ? finishKind === 'goal'
                      ? 'Finish reached. Checking the result…'
                      : 'Time’s up. Checking the result…'
                    : friendPose?.respawning
                      ? 'Your friend is returning to a checkpoint.'
                      : friend?.result?.kind === 'goal'
                        ? 'Your friend reached the finish.'
                        : friend &&
                            clock - friend.lastSeen > 3_000 &&
                            peerState !== 'live'
                          ? 'Friend reconnecting…'
                          : ''}
            </output>
            <span className={styles.linkState} data-live={peerState === 'live'}>
              {peerState === 'live' ? 'Live' : 'Connecting'}
            </span>
          </div>
          {!climbEnded && (
            <>
              <p className={styles.controlsHint}>
                <kbd>A</kbd>
                <kbd>D</kbd> move <span>·</span> <kbd>SPACE</kbd> jump
                {settings.bumping && (
                  <>
                    <span>·</span>
                    <kbd>E</kbd> shove
                  </>
                )}
              </p>
              <div className={styles.touchControls} aria-label="Race controls">
                <div>
                  {touch('left', 'Move left', <ArrowLeft />)}
                  {touch('right', 'Move right', <ArrowRight />)}
                </div>
                <div>
                  {settings.bumping && (
                    <button
                      type="button"
                      className={styles.shoveButton}
                      aria-label="Shove your friend"
                      disabled={!shoveReady || respawnFloor !== null}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        void shove();
                      }}
                    >
                      <Hand size={22} />
                      <small>{shoveReady ? 'Shove' : 'Wait'}</small>
                    </button>
                  )}
                  {touch('jump', 'Jump', <ArrowUp />)}
                </div>
              </div>
            </>
          )}
        </>
      )}
      {finished && (
        <section className={styles.card} aria-labelledby="race-result-heading">
          <Flag className={styles.emblem} size={30} />
          <p className={styles.kicker}>ROUND {room.round}</p>
          <h1 id="race-result-heading">{resultTitle}</h1>
          <p>{resultText}</p>
          <div className={styles.results}>
            <div>
              <span>You</span>
              <strong>
                {me?.result?.kind === 'forfeit'
                  ? 'Left'
                  : (me?.result?.floor ?? '—')}
              </strong>
              <small>
                {me?.result?.kind === 'forfeit'
                  ? 'the race'
                  : me?.result
                    ? 'floors'
                    : 'No result'}
              </small>
            </div>
            <span>—</span>
            <div>
              <span>Friend</span>
              <strong>
                {friend?.result?.kind === 'forfeit'
                  ? 'Left'
                  : (friend?.result?.floor ?? '—')}
              </strong>
              <small>
                {friend?.result?.kind === 'forfeit'
                  ? 'the race'
                  : friend?.result
                    ? 'floors'
                    : 'No result'}
              </small>
            </div>
          </div>
          {friendOnline ? (
            <button
              className={styles.primary}
              disabled={busy || me?.rematch || blocked}
              onClick={() => void act('rematch')}
            >
              <RotateCcw size={18} />
              {me?.rematch
                ? 'Waiting for friend…'
                : friend?.rematch
                  ? 'Accept rematch'
                  : 'Race again'}
            </button>
          ) : (
            <button
              className={styles.primary}
              disabled={busy || !loaded}
              onClick={() => void connect(false)}
            >
              Create a new race
              <ArrowRight size={18} />
            </button>
          )}
          <button
            className={styles.textButton}
            disabled={busy}
            onClick={() => void leave()}
          >
            Back to tower
          </button>
        </section>
      )}
    </main>
  );
}
