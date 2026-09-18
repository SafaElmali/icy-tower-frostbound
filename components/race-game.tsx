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
  Music2,
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
import { ComboFeedbackTracker } from '@/lib/combo-feedback';
import { GraphicsRecovery } from '@/lib/graphics-recovery';
import { graphicsFailureCode } from '@/lib/graphics-diagnostics';
import { readProfile, OUTFIT_STORAGE_KEY } from '@/lib/outfits';
import type { TowerWorld } from '@/lib/tower-world';
import { trackEvent, analyticsId } from '@/lib/analytics';
import { RaceAnalyticsTransitions } from '@/lib/race-analytics';
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
  const analytics = useRef(new RaceAnalyticsTransitions());
  const analyticsRoom = useRef('');
  const respawnOrdinal = useRef(0);
  const shoveCounts = useRef({ attempts: 0, accepted: 0 });
  const inputType = useRef('keyboard');
  const left = useRef(false);
  function capture(
    name: string,
    properties: Record<
      string,
      string | number | boolean | null | undefined
    > = {},
    current = roomRef.current,
  ) {
    trackEvent(name, {
      surface: 'race',
      run_context: 'multiplayer',
      analytics_room_id: analyticsRoom.current || undefined,
      role: current?.you,
      round: current?.round,
      phase: current?.phase,
      target_floor: current?.settings.targetFloor,
      duration_ms: current?.settings.durationMs,
      bumping: current?.settings.bumping,
      ...properties,
    });
  }
  function failure(error: unknown) {
    return error instanceof RaceRequestError
      ? `http_${error.status}`
      : 'network_error';
  }
  function trackLeave(reason: string) {
    if (left.current || !roomRef.current) return;
    left.current = true;
    capture('race_left', { reason });
  }
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
  const comboFeedback = useRef(new ComboFeedbackTracker());
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
  const [music, setMusic] = useState(true);
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
    for (const event of analytics.current.receive(next))
      capture(
        event.name,
        {
          ...event.properties,
          ...(event.name === 'race_results_viewed'
            ? {
                shove_attempts: shoveCounts.current.attempts,
                shove_accepted: shoveCounts.current.accepted,
                respawn_count: respawnOrdinal.current,
              }
            : {}),
        },
        next,
      );
    if (
      runner.current?.round !== next.round ||
      previous?.id !== next.id ||
      (previous && !sameSettings(previous.settings, next.settings))
    ) {
      runner.current = new RaceRunner(next.round, next.seed, next.settings);
      respawnOrdinal.current = 0;
      shoveCounts.current = { attempts: 0, accepted: 0 };
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
          if (connection.current === client) {
            if (analytics.current.transport(state))
              capture('race_transport_changed', {
                state,
                transport: state === 'live' ? 'peer' : 'http',
              });
            setPeerState(state);
          }
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
    const attemptId = analyticsId();
    const startedAt = performance.now();
    const operation = restored ? 'restore' : join ? 'join' : 'create';
    trackLeave('replaced');
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
    analyticsRoom.current = analyticsId();
    analytics.current = new RaceAnalyticsTransitions();
    left.current = false;
    capture(
      'race_connection_attempted',
      { attempt_id: attemptId, operation },
      null,
    );
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
      capture(
        join ? 'race_room_joined' : 'race_room_created',
        {
          attempt_id: attemptId,
          operation,
          restored: !!restored,
          latency_ms: Math.round(performance.now() - startedAt),
        },
        view,
      );
    } catch (error) {
      capture('race_connection_failed', {
        attempt_id: attemptId,
        operation,
        error_code: failure(error),
        latency_ms: Math.round(performance.now() - startedAt),
      });
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
    audio.current.setPaused(true);
    audio.current.setEnabled(soundRef.current);
    try {
      const updated = await client.send({
        action,
        round: current.round,
        ready: !current.players.find((p) => p.slot === current.you)?.ready,
      });
      if (action === 'rematch' && analytics.current.rematch(current.round))
        capture(
          'race_rematch_requested',
          { prior_round: current.round, next_round: updated.round },
          current,
        );
    } catch (error) {
      capture('race_action_failed', { action, error_code: failure(error) });
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
      const updated = await client.send({
        action: 'configure',
        round: current.round,
        settings: draftSettings,
      });
      if (!sameSettings(current.settings, updated.settings))
        capture(
          'race_settings_changed',
          {
            previous_target_floor: current.settings.targetFloor,
            previous_duration_ms: current.settings.durationMs,
            previous_bumping: current.settings.bumping,
          },
          updated,
        );
    } catch (error) {
      capture('race_action_failed', {
        action: 'configure',
        error_code: failure(error),
      });
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
    shoveCounts.current.attempts++;
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
      shoveCounts.current.accepted++;
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
    trackLeave('button');
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
      capture('shared_link_opened', {
        link_type: 'race',
        result: validRaceId(value) ? 'valid' : 'invalid',
      });
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
        if (!stopped) {
          const restored = analytics.current.restored(performance.now());
          if (restored) capture('race_connection_restored', restored);
          setNetworkError('');
        }
        if (client.view?.phase === 'finishing') delay = 100;
      } catch (error) {
        if (stopped) return;
        // Concurrent ready/rematch responses can supersede an in-flight poll.
        // A rejected old-round request is not a transport outage.
        if (
          !(error instanceof RaceRequestError && error.status === 409) &&
          analytics.current.lost(performance.now())
        )
          capture('race_connection_lost', { error_code: failure(error) });
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
      trackLeave('page_exit');
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
    const loadId = analyticsId();
    const loadStarted = performance.now();
    let loadStage = 'import';
    let graphicsLostAt = 0;
    let readyTracked = false;
    const ready = () => {
      if (readyTracked || !modelLoaded || graphics?.blocked) return;
      readyTracked = true;
      capture('game_ready', {
        load_id: loadId,
        load_duration_ms: Math.round(performance.now() - loadStarted),
      });
    };
    capture('game_load_started', { load_id: loadId });
    let disposed = false,
      frame = 0,
      previous = 0,
      synced = 0;
    const controls = input.current;
    let graphics: GraphicsRecovery | undefined;
    let modelLoaded = false;
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
      if (graphics?.blocked) return;
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
      inputType.current = 'keyboard';
      input.current.press(`key:${event.code}`, control);
    };
    const keyUp = (event: KeyboardEvent) => {
      input.current.release(`key:${event.code}`);
    };
    const blur = () => {
      resetInput();
      audio.current?.setPaused(true);
    };
    const focus = () =>
      audio.current?.setPaused(
        !!graphics?.blocked ||
          !runner.current?.started ||
          !!runner.current.recording ||
          roomRef.current?.phase === 'finished',
      );
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', blur);
    window.addEventListener('focus', focus);
    import('@/lib/tower-world')
      .then(async ({ TowerWorld }) => {
        if (disposed || !canvas.current) return;
        loadStage = 'world_initialize';
        const scene = new TowerWorld(canvas.current);
        world.current = scene;
        const stopGraphics = (message: string) => {
          resetInput();
          audio.current?.setPaused(true);
          setLoaded(false);
          setRenderError(message);
        };
        graphics = new GraphicsRecovery(canvas.current, {
          lost: () => {
            graphicsLostAt = performance.now();
            capture('graphics_context_lost', { load_id: loadId });
            stopGraphics(
              'Graphics were interrupted. The shared race clock continues while they reconnect.',
            );
          },
          restored: () => {
            capture('graphics_context_restored', {
              load_id: loadId,
              recovery_duration_ms: Math.round(
                performance.now() - graphicsLostAt,
              ),
              quality_fallback: true,
            });
            scene.setQuality(false);
            setRenderError('');
            setLoaded(modelLoaded);
          },
          failed: (error) => {
            capture('graphics_failed', {
              load_id: loadId,
              error_code: graphicsFailureCode(error, 'render_failed'),
            });
            console.error('Frostbound race rendering stopped.', error);
            stopGraphics('The graphics stopped working. Reload to reconnect.');
          },
        });
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
        loadStage = 'world_assets';
        await scene.load();
        if (disposed) {
          scene.dispose();
          return;
        }
        loadStage = 'world_ready';
        try {
          scene.setOutfit(
            readProfile(localStorage.getItem(OUTFIT_STORAGE_KEY)).equipped,
          );
        } catch {
          /* Use the starter outfit. */
        }
        modelLoaded = true;
        setLoaded(!graphics.blocked);
        ready();
        const animate = (now: number) => {
          if (disposed) return;
          const dt = Math.min(0.1, (now - (previous || now)) / 1000);
          previous = now;
          graphics?.frame(() => {
            ready();
            const local = runner.current,
              current = roomRef.current;
            const serverNow = connection.current?.now() ?? Date.now();
            if (local && current) {
              const wasStarted = local.started;
              const wasRecorded = !!local.recording;
              const wasRespawning = local.respawning;
              const previousFrame = local.frame;
              const frameControls = input.current.sample();
              local.advance(
                serverNow,
                current.startAt,
                frameControls,
                current.phase === 'finished',
              );
              if (local.frame > previousFrame)
                input.current.acknowledgeSample(frameControls);
              if (wasRespawning && !local.respawning && !local.recording)
                capture('race_respawned', {
                  checkpoint_floor: local.checkpointFloor,
                  respawn_ordinal: ++respawnOrdinal.current,
                });
              if (!wasRecorded && local.recording) wakePoll.current?.();
              if (!wasStarted && local.started) {
                if (analytics.current.started(current.round))
                  capture('race_started', {
                    input_type: inputType.current,
                    rules_version: local.engine.rulesVersion,
                  });
                resetInput();
                comboFeedback.current.reset();
                audio.current?.resetRun();
                canvas.current?.focus({ preventScroll: true });
                audio.current?.play('jump');
              }
              peer.current?.sendPose(current.round, local.pose);
              audio.current?.setPaused(
                !local.started ||
                  !!local.recording ||
                  current.phase === 'finished' ||
                  !document.hasFocus(),
              );
              const events = local.engine.drainEvents();
              const milestone = comboFeedback.current.observe(
                local.engine.combo,
                local.engine.comboTime,
              );
              if (
                milestone !== null &&
                !events.some((event) => event.type === 'frenzy')
              )
                audio.current?.play('combo', milestone);
              for (const event of events) {
                scene.effect(event, local.engine.time);
                if (event.type !== 'combo') audio.current?.play(event.type);
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
          });
          frame = requestAnimationFrame(animate);
        };
        frame = requestAnimationFrame(animate);
      })
      .catch((error) => {
        console.error('Frostbound race could not load.', error);
        if (!disposed) {
          capture('game_load_failed', {
            load_id: loadId,
            stage: loadStage,
            error_code: graphicsFailureCode(error, 'load_failed'),
            load_duration_ms: Math.round(performance.now() - loadStarted),
          });
          graphics?.dispose();
          world.current?.dispose();
          world.current = null;
          setRenderError('The tower could not load. Try reloading this page.');
        }
      });
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      graphics?.dispose();
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
      disabled={!loaded || !!renderError}
      onPointerDown={(event) => {
        event.preventDefault();
        inputType.current = 'touch';
        event.currentTarget.setPointerCapture(event.pointerId);
        input.current.press(`touch:${event.pointerId}`, control);
        setPressed({ ...input.current.controls });
      }}
      onPointerUp={(event) => {
        input.current.release(`touch:${event.pointerId}`);
        setPressed({ ...input.current.controls });
      }}
      onPointerCancel={(event) => {
        input.current.cancel(`touch:${event.pointerId}`);
        setPressed({ ...input.current.controls });
      }}
      onLostPointerCapture={(event) => {
        const source = `touch:${event.pointerId}`;
        if (input.current.has(source)) input.current.cancel(source);
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
            capture('setting_changed', {
              setting: 'sound',
              previous_value: sound,
              value: enabled,
              source: 'user',
            });
            setSound(enabled);
            soundRef.current = enabled;
            audio.current ??= new TowerAudio();
            audio.current.setPaused(
              !runner.current?.started || !!runner.current.recording,
            );
            audio.current.setEnabled(enabled);
          }}
        >
          {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
        <button
          type="button"
          aria-label={music ? 'Mute music' : 'Enable music'}
          aria-pressed={music}
          onClick={() => {
            const enabled = !music;
            capture('setting_changed', {
              setting: 'music',
              previous_value: music,
              value: enabled,
              source: 'user',
            });
            setMusic(enabled);
            audio.current ??= new TowerAudio();
            audio.current.setMusicEnabled(enabled);
          }}
        >
          <Music2 size={18} />
        </button>
      </header>
      {(networkError || renderError) && (
        <div className={styles.error} role="alert">
          {renderError || networkError}
          {renderError && (
            <button onClick={() => location.reload()}>Reload game</button>
          )}
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
                    const operationId = analyticsId();
                    const properties = {
                      share_type: 'race',
                      method: 'clipboard',
                      operation_id: operationId,
                    };
                    capture('share_attempted', properties);
                    try {
                      await navigator.clipboard.writeText(invite);
                      setCopied(true);
                      capture('share_completed', properties);
                    } catch {
                      capture('share_failed', {
                        ...properties,
                        error_code: 'clipboard_failed',
                      });
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
                      disabled={
                        !loaded ||
                        !!renderError ||
                        !shoveReady ||
                        respawnFloor !== null
                      }
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
