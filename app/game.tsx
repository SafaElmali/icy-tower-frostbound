'use client';

import { useEffect, useRef, useState } from 'react';
import { trackEvent, analyticsId } from '@/lib/analytics';
import { SoloAnalytics } from '@/lib/solo-analytics';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CalendarDays,
  ChevronRight,
  CircleHelp,
  Footprints,
  Settings2,
  Sparkles,
  Ghost,
  Menu,
  Play,
  RotateCcw,
  Share2,
  Snowflake,
  Shirt,
  Target,
  Trophy,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HowToPlayDialog } from '@/components/how-to-play-dialog';
import { GameSettings } from '@/components/game-settings';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import menuStyles from './game-menu.module.css';
import resultStyles from '@/components/run-result.module.css';
import { TitleMenu } from '@/components/title-menu';
import { ModePreview } from '@/components/mode-preview';
import { preventTouchContextMenu } from '@/lib/game-touch';
import skillGoalStyles from '@/components/skill-goals.module.css';
import hudStyles from '@/components/game-hud.module.css';
import {
  GameHud,
  HudCallout,
  type HudCalloutData,
} from '@/components/game-hud';
import { getTowerSection } from '@/lib/tower-sections';
import { RunSummaryDialog } from '@/components/run-summary-dialog';
import { useGameControlKeys } from '@/hooks/use-game-control-keys';
import { WardrobeDialog } from '@/components/wardrobe';
import {
  COSMETICS,
  OUTFIT_STORAGE_KEY,
  ACHIEVEMENT_METRICS,
  advanceProgress,
  isUnlocked,
  normalizeOutfit,
  readProfile,
  type OutfitSlot,
  type WardrobeProfile,
} from '@/lib/outfits';
import { QuickChallenges } from '@/components/quick-challenges';
import {
  FeaturedSkillGoal,
  SkillGoalProgression,
} from '@/components/skill-goals';
import {
  readSkillProgress,
  advanceSkillProgress,
  selectSkillGoal,
  SKILL_GOALS_STORAGE_KEY,
  SKILL_GOALS,
  type SkillProgress,
} from '@/lib/skill-goals';
import { LeaderboardDialog } from '@/components/leaderboard';
import { FriendChallengeDialog } from '@/components/friend-challenge';
import {
  challengeFromRun,
  challengeUrl,
  decodeChallenge,
  startChallengeRun,
  type FriendChallenge,
} from '@/lib/friend-challenge';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { JevInspector } from '@/components/jev-inspector';
import type { JevDebugRecord, JevLiveState } from '@/lib/jev-debug';
import { JevPlayer } from '@/lib/jev-player';
import { TowerInput } from '@/lib/tower-input';
import { TowerAudio } from '@/lib/tower-audio';
import { registerGameTools } from '@/lib/game-tools';
import {
  TowerEngine,
  CURRENT_RULES_VERSION,
  freshControls,
  MODE_LABELS,
  type GameMode,
  type Snapshot,
  type RunReplay,
} from '@/lib/tower-engine';
import {
  bestGhost,
  GHOST_STORAGE_KEY,
  readGhost,
  startGhostRun,
  type TowerGhost,
  type GhostRecord,
} from '@/lib/tower-ghost';
import type { TowerWorld } from '@/lib/tower-world';
import {
  createPlaytestAnalytics,
  type PlaytestAnalytics,
} from '@/lib/playtest-analytics';
import { PlaytestReport } from '@/components/playtest-report';
import { RunFeedback } from '@/components/run-feedback';
import { GraphicsRecovery } from '@/lib/graphics-recovery';
import { graphicsFailureCode } from '@/lib/graphics-diagnostics';
import {
  graphicsFailureMessage,
  graphicsRetryUrl,
  usesPerformanceGraphics,
} from '@/lib/graphics-retry';
import { PersonalProgressResults } from '@/components/personal-progress';
import { NextClimb } from '@/components/next-climb';
import { DailyReturn } from '@/components/daily-return';
import {
  getFirstJumpGuidance,
  shouldStartFirstJumpGuidance,
  type FirstJumpGuidance,
} from '@/lib/first-jump-guidance';
import {
  readPersonalProgress,
  personalRunBaseline,
  recordPersonalProgress,
  PERSONAL_PROGRESS_STORAGE_KEY,
} from '@/lib/personal-progress';
import {
  ComboFeedbackTracker,
  type ComboMilestone,
} from '@/lib/combo-feedback';
import { DailyTowerCard, DailyTowerBanner } from '@/components/daily-tower';
import dailyStyles from '@/components/daily-tower.module.css';
import {
  todayDailyTower,
  decodeDailyTower,
  dailyTowerUrl,
  startDailyRun,
  readDailyProgress,
  updateDailyProgress,
  getDailyBest,
  DAILY_PROGRESS_STORAGE_KEY,
  type DailyTower,
} from '@/lib/daily-tower';
import { TowerActionResults } from '@/components/tower-action-hud';
import {
  readGuidanceProfile,
  freshGuidanceRun,
  advanceGuidance,
  getGuidanceCue,
  skipGuidance,
  replayGuidance,
  GUIDANCE_STORAGE_KEY,
  type GuidanceProfile,
  type GuidanceCue,
} from '@/lib/climb-guidance';

type PersonalBest = { floor: number; score: number };
const emptyBests = (): Record<GameMode, PersonalBest> => ({
  arcade: { floor: 0, score: 0 },
  party: { floor: 0, score: 0 },
  practice: { floor: 0, score: 0 },
});
const bestKey = (mode: GameMode) =>
  mode === 'arcade' ? 'frostbound-best' : `frostbound-best-${mode}`;
const initial = new TowerEngine().snapshot();
const JEV_ENABLED = import.meta.env.JEV_ENABLED;
const formatTime = (t: number) =>
  `${Math.floor(t / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(t % 60)
    .toString()
    .padStart(2, '0')}`;

export default function Home() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<TowerEngine | null>(null);
  const world = useRef<TowerWorld | null>(null);
  const input = useRef(new TowerInput());
  const jev = useRef<JevPlayer | null>(null);
  const aiRun = useRef(false);
  const [jevMessage, setJevMessage] = useState('');
  const [jevTrace, setJevTrace] = useState<JevDebugRecord[]>([]);
  const [jevLive, setJevLive] = useState<JevLiveState | null>(null);
  const [touchPressed, setTouchPressed] = useState(freshControls());
  const [touchGuidance, setTouchGuidance] = useState(false);
  const [game, setGame] = useState<Snapshot>(initial);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [graphicsReconnecting, setGraphicsReconnecting] = useState(false);
  const [performanceRetry, setPerformanceRetry] = useState(false);
  const [mode, setMode] = useState<GameMode>('arcade');
  const [sound, setSound] = useState(true);
  const [music, setMusic] = useState(true);
  const [quality, setQuality] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const reducedMotionRef = useRef(false);
  const [help, setHelp] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuTab, setMenuTab] = useState('play');
  const returnToMenu = useRef(false);
  const [runDetailsOpen, setRunDetailsOpen] = useState(false);
  const [pendingActivity, setPendingActivity] = useState<{
    label: string;
    run: () => void;
    restore: () => void;
  } | null>(null);
  const [challengesOpen, setChallengesOpen] = useState(false);
  const goalsTitle = useRef<HTMLHeadingElement>(null);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [submissionRun, setSubmissionRun] = useState<RunReplay | null>(null);
  const [wardrobeOpen, setWardrobeOpen] = useState(false);
  const [profile, setProfile] = useState<WardrobeProfile>(() =>
    readProfile(null),
  );
  const profileRef = useRef(profile);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [newOutfits, setNewOutfits] = useState<string[]>([]);
  const [bests, setBests] = useState(emptyBests);
  const best = bests[mode];
  const [toast, setToast] = useState('');
  const [challenge, setChallenge] = useState<FriendChallenge | null>(null);
  const challengeRef = useRef<FriendChallenge | null>(null);
  const [sharedRun, setSharedRun] = useState<{
    challenge: FriendChallenge;
    url: string;
  } | null>(null);
  const [challengeError, setChallengeError] = useState('');
  const bestRef = useRef(emptyBests());
  const soundRef = useRef(true);
  const audio = useRef<TowerAudio | null>(null);
  const ghostBest = useRef<GhostRecord | null>(null);
  const ghost = useRef<TowerGhost | null>(null);
  const [ghostFloor, setGhostFloor] = useState<number | null>(null);
  const [race, setRace] = useState<ReturnType<TowerGhost['snapshot']> | null>(
    null,
  );
  const [newGhost, setNewGhost] = useState(false);
  const [ghostUnavailable, setGhostUnavailable] = useState(false);
  const [skills, setSkills] = useState(() => readSkillProgress(null));
  const skillsRef = useRef(skills);
  const analytics = useRef<PlaytestAnalytics | null>(null);
  const measuredRun = useRef<string | null>(null);
  const [measurementsOpen, setMeasurementsOpen] = useState(false);
  const guidanceProfile = useRef(readGuidanceProfile(null));
  const guidanceRun = useRef(freshGuidanceRun());
  const guidanceCueId = useRef<string | null>(null);
  const [guidanceCue, setGuidanceCue] = useState<GuidanceCue | null>(null);
  const firstJumpEnabled = useRef(false);
  const firstJumpRef = useRef<FirstJumpGuidance | null>(null);
  const [firstJump, setFirstJump] = useState<FirstJumpGuidance | null>(null);
  const [daily, setDaily] = useState<DailyTower | null>(null);
  const dailyRef = useRef<DailyTower | null>(null);
  const [dailyChoice, setDailyChoice] = useState(todayDailyTower);
  const [dailyOpen, setDailyOpen] = useState(false);
  const [dailyProgress, setDailyProgress] = useState(() =>
    readDailyProgress(null),
  );
  const dailyProgressRef = useRef(dailyProgress);
  const [dailyShare, setDailyShare] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const personalProgress = useRef(readPersonalProgress(null));
  const [runBaseline, setRunBaseline] = useState(() =>
    personalRunBaseline(readPersonalProgress(null), 'arcade'),
  );
  const comboFeedback = useRef(new ComboFeedbackTracker());
  const [callout, setCallout] = useState<HudCalloutData | null>(null);
  const calloutTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const sectionShown = useRef(getTowerSection(0).id);
  function showCallout(data: Omit<HudCalloutData, 'key'>, seconds: number) {
    clearTimeout(calloutTimer.current);
    setCallout({ ...data, key: performance.now() });
    calloutTimer.current = setTimeout(() => setCallout(null), seconds * 1000);
  }
  const telemetry = useRef(new SoloAnalytics(trackEvent, analyticsId));
  const [remoteRunId, setRemoteRunId] = useState<string | undefined>();
  const lastInput = useRef('unknown');
  const guidanceShownAt = useRef<Record<string, number>>({});
  const startBest = useRef<PersonalBest>({ floor: 0, score: 0 });
  const startGhostFloor = useRef<number | null>(null);
  const startGoalCount = useRef(0);
  const panelHistory = useRef<Record<string, boolean>>({});
  useEffect(() => {
    const panels = {
      menu: menuOpen,
      help,
      goals: challengesOpen,
      outfits: wardrobeOpen,
      daily: dailyOpen,
      playtest: measurementsOpen,
      run_details: runDetailsOpen,
    };
    for (const [panel, open] of Object.entries(panels)) {
      if (open && !panelHistory.current[panel]) {
        telemetry.current.event('feature_panel_opened', { panel });
        if (panel === 'run_details')
          telemetry.current.event('run_results_viewed', { view: 'details' });
      }
    }
    panelHistory.current = panels;
  }, [
    menuOpen,
    help,
    challengesOpen,
    wardrobeOpen,
    dailyOpen,
    measurementsOpen,
    runDetailsOpen,
  ]);

  function saveGuidance(next: GuidanceProfile) {
    if (guidanceProfile.current === next) return;
    for (const step of next.completed) {
      if (!guidanceProfile.current.completed.includes(step))
        telemetry.current.event('guidance_step_completed', {
          step_id: step,
          guidance_attempt_id: telemetry.current.runId,
          active_duration_s: engine.current?.time ?? 0,
          step_duration_s: Math.max(
            0,
            (engine.current?.time ?? 0) - (guidanceShownAt.current[step] ?? 0),
          ),
        });
    }
    if (next.skipped && !guidanceProfile.current.skipped)
      telemetry.current.event('guidance_skipped', {
        step_id: guidanceCueId.current,
        guidance_attempt_id: telemetry.current.runId,
      });
    guidanceProfile.current = next;
    try {
      localStorage.setItem(GUIDANCE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* Guidance still works during this visit. */
    }
  }

  function saveSkills(next: SkillProgress) {
    if (next === skillsRef.current) return;
    if (measuredRun.current)
      for (const id of next.completed) {
        if (!skillsRef.current.completed.includes(id)) {
          analytics.current?.completeGoal(measuredRun.current, id);
          telemetry.current.event('skill_goal_completed', {
            goal_id: id,
            completion_kind: 'first_persistent_unlock',
          });
        }
      }
    skillsRef.current = next;
    setSkills(next);
    try {
      localStorage.setItem(SKILL_GOALS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* Keep skill progress available for this session. */
    }
  }

  function changeMotion(reduced: boolean) {
    if (reduced !== reducedMotionRef.current)
      trackEvent('setting_changed', {
        surface: 'solo',
        setting: 'reduced_motion',
        previous_value: reducedMotionRef.current,
        value: reduced,
        source: 'user',
      });
    reducedMotionRef.current = reduced;
    setReducedMotion(reduced);
    world.current?.setReducedMotion(reduced);
    try {
      localStorage.setItem('frostbound-reduced-motion', String(reduced));
    } catch {
      /* The current session still respects the preference. */
    }
  }

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let explicit: string | null = null;
    try {
      explicit = localStorage.getItem('frostbound-reduced-motion');
    } catch {
      /* Use the system preference. */
    }
    const apply = () => {
      try {
        explicit = localStorage.getItem('frostbound-reduced-motion');
      } catch {
        /* Use the system preference. */
      }
      const reduced =
        explicit === 'true' || (explicit !== 'false' && preference.matches);
      reducedMotionRef.current = reduced;
      setReducedMotion(reduced);
      world.current?.setReducedMotion(reduced);
    };
    apply();
    preference.addEventListener('change', apply);
    return () => preference.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.reducedMotion = String(reducedMotion);
    return () => {
      delete document.documentElement.dataset.reducedMotion;
    };
  }, [reducedMotion]);

  function startRun(e: TowerEngine, selectedMode: GameMode, source = 'button') {
    returnToMenu.current = false;
    const retrySeed =
      e.status === 'over' && e.floor < 5 && e.mode === selectedMode
        ? e.seed
        : undefined;
    jev.current?.stop();
    jev.current = null;
    aiRun.current = source === 'jev';
    setJevMessage('');
    const reason =
      e.status === 'over'
        ? 'retry'
        : telemetry.current.runId
          ? 'restart'
          : 'first';
    telemetry.current.terminal(e, 'abandoned', { reason: 'restart' });
    if (measuredRun.current)
      analytics.current?.abandonRun(measuredRun.current, 'restart');
    resetInput();
    setMenuOpen(false);
    setRunDetailsOpen(false);
    guidanceRun.current = freshGuidanceRun();
    firstJumpEnabled.current =
      !aiRun.current &&
      shouldStartFirstJumpGuidance(
        guidanceProfile.current,
        profileRef.current.progress.floor,
      );
    firstJumpRef.current = null;
    setFirstJump(null);
    comboFeedback.current.reset();
    sectionShown.current = getTowerSection(0).id;
    clearTimeout(calloutTimer.current);
    setCallout(null);
    guidanceCueId.current = null;
    guidanceShownAt.current = {};
    setGuidanceCue(null);
    ghost.current = null;
    if (dailyRef.current) startDailyRun(e, dailyRef.current);
    else if (challengeRef.current)
      startChallengeRun(e, challengeRef.current, selectedMode);
    else
      ghost.current = startGhostRun(
        e,
        ghostBest.current,
        selectedMode,
        retrySeed,
      );
    startGoalCount.current = skillsRef.current.completed.length;
    if (source === 'game_tool') lastInput.current = 'game_tool';
    startBest.current = { ...bestRef.current[e.mode] };
    startGhostFloor.current = ghost.current
      ? (ghostBest.current?.floor ?? null)
      : null;
    if (!aiRun.current)
      telemetry.current.start(e, {
        start_source: source,
        start_reason: reason,
        input_type:
          source === 'game_tool'
            ? 'game_tool'
            : source === 'keyboard'
              ? 'keyboard'
              : lastInput.current,
        device_proxy: window.matchMedia('(any-pointer: coarse)').matches
          ? 'coarse_pointer'
          : 'fine_pointer',
        run_context: dailyRef.current
          ? 'daily'
          : challengeRef.current
            ? 'friend_challenge'
            : 'normal',
        daily_date: dailyRef.current?.date,
        target_floor: challengeRef.current?.floor,
        target_score: challengeRef.current?.score,
        ghost_enabled: !!ghost.current,
        guidance_enabled: !guidanceProfile.current.skipped,
      });
    setRemoteRunId(
      aiRun.current ? undefined : (telemetry.current.runId ?? undefined),
    );
    const baseline = personalRunBaseline(personalProgress.current, e.mode);
    setRunBaseline(baseline);
    world.current?.setPersonalBest(baseline.floor);
    measuredRun.current = aiRun.current
      ? null
      : (analytics.current?.beginRun({
          mode: `${dailyRef.current ? 'daily:' : challengeRef.current ? 'challenge:' : ''}${e.mode}`,
        }) ?? null);
    setMode(e.mode);
    setSharedRun(null);
    setRace(ghost.current?.snapshot(e) ?? null);
    setNewGhost(false);
    setGhostUnavailable(false);
    audio.current?.resetRun();
  }

  function saveProfile(next: WardrobeProfile) {
    profileRef.current = next;
    setProfile(next);
    try {
      localStorage.setItem(OUTFIT_STORAGE_KEY, JSON.stringify(next));
      setStorageAvailable(true);
    } catch {
      setStorageAvailable(false);
    }
  }
  function equip(slot: OutfitSlot, id: string) {
    const current = profileRef.current;
    const equipped = normalizeOutfit(
      { ...current.equipped, [slot]: id },
      current.progress,
    );
    if (equipped[slot] !== current.equipped[slot])
      telemetry.current.event('cosmetic_equipped', {
        slot,
        previous_item_id: current.equipped[slot],
        item_id: equipped[slot],
      });
    saveProfile({ ...current, equipped });
    world.current?.setOutfit(equipped);
  }
  function openWardrobe() {
    if (engine.current?.status === 'playing') pause('outfits_dialog');
    setWardrobeOpen(true);
    setNewOutfits([]);
  }

  function resetInput() {
    input.current.reset();
    setTouchPressed(freshControls());
  }
  function tone(type: string, milestone?: ComboMilestone) {
    if (!soundRef.current) return;
    audio.current ??= new TowerAudio();
    audio.current.setPaused(engine.current?.status !== 'playing');
    audio.current.play(type, milestone);
  }
  function changeSound(enabled: boolean) {
    soundRef.current = enabled;
    trackEvent('setting_changed', {
      surface: 'solo',
      setting: 'sound',
      previous_value: sound,
      value: enabled,
      source: 'user',
    });
    setSound(enabled);
    audio.current?.setEnabled(enabled);
    if (enabled) tone('gem');
  }
  function begin(selectedMode = mode, source = 'button') {
    if (!engine.current || !ready) return;
    startRun(engine.current, selectedMode, source);
    audio.current?.setPaused(false);
    setGame(engine.current.snapshot());
    setHelp(false);
    setChallengesOpen(false);
    tone('jump');
    canvas.current?.focus({ preventScroll: true });
  }
  function beginJev() {
    if (!JEV_ENABLED || !ready || !engine.current) return;
    leaveChallenge();
    leaveDaily();
    begin('practice', 'jev');
    setJevTrace([]);
    setJevLive(null);
    jev.current = new JevPlayer(undefined, setJevMessage, setJevTrace);
    setJevMessage('Jev is thinking…');
    world.current?.setPersonalBest(0);
  }
  function leaveChallenge() {
    if (challengeRef.current)
      telemetry.current.event('challenge_exited', {
        context_type: 'friend_challenge',
        status: engine.current?.status,
      });
    challengeRef.current = null;
    setChallenge(null);
    setChallengeError('');
    const url = new URL(window.location.href);
    url.searchParams.delete('challenge');
    window.history.replaceState(window.history.state, '', url);
  }
  function shareRun() {
    if (!engine.current) return;
    const completed = challengeFromRun(engine.current);
    if (completed)
      setSharedRun({
        challenge: completed,
        url: challengeUrl(window.location.href, completed),
      });
  }
  function leaveDaily() {
    if (dailyRef.current)
      telemetry.current.event('challenge_exited', {
        context_type: 'daily',
        status: engine.current?.status,
      });
    dailyRef.current = null;
    setDaily(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('daily');
    window.history.replaceState(window.history.state, '', url);
  }
  function requestActivity(label: string, run: () => void) {
    const status = engine.current?.status;
    if (status !== 'playing' && status !== 'paused') {
      run();
      return;
    }
    if (status === 'playing') pause('change_activity');
    const origin = { menuOpen, dailyOpen, help };
    setMenuOpen(false);
    setDailyOpen(false);
    setHelp(false);
    setPendingActivity({
      label,
      run,
      restore: () => {
        setMenuOpen(origin.menuOpen);
        setDailyOpen(origin.dailyOpen);
        setHelp(origin.help);
      },
    });
  }

  function playDaily(selected: DailyTower, source = 'daily_panel') {
    requestActivity('Start daily tower', () => {
      if (!ready) return;
      leaveChallenge();
      telemetry.current.event('daily_tower_selected', {
        daily_date: selected.date,
        selection_source: source,
      });
      dailyRef.current = selected;
      setDaily(selected);
      setDailyChoice(selected);
      window.history.replaceState(
        window.history.state,
        '',
        dailyTowerUrl(window.location.href, selected),
      );
      setDailyOpen(false);
      begin('arcade');
    });
  }
  function guidedPractice() {
    requestActivity('Start practice', () => {
      if (!ready) return;
      leaveChallenge();
      leaveDaily();
      saveGuidance(replayGuidance());
      begin('practice');
      telemetry.current.event('guided_practice_started', {
        entry_surface: 'solo',
      });
    });
  }
  function openDailyShare(selected: DailyTower) {
    telemetry.current.event('share_dialog_opened', {
      share_type: 'daily',
      daily_date: selected.date,
    });
    setDailyShare(dailyTowerUrl(window.location.href, selected));
    setDailyOpen(false);
    setCopyStatus('');
  }
  function pause(reason = 'button') {
    const e = engine.current;
    if (!e || !ready || error) return;
    resetInput();
    e.togglePause();
    telemetry.current.pause(e, reason);
    audio.current?.setPaused(e.status === 'paused');
    setGame(e.snapshot());
    if (e.status === 'playing') canvas.current?.focus({ preventScroll: true });
  }
  function openLeaderboard() {
    if (engine.current?.status === 'playing') pause('leaderboard_dialog');
    setSubmissionRun(engine.current?.getReplay() ?? null);
    setLeaderboardOpen(true);
  }
  function menu() {
    requestActivity('Return to title', () => {
      jev.current?.stop();
      jev.current = null;
      aiRun.current = false;
      setJevMessage('');
      setRunDetailsOpen(false);
      if (engine.current)
        telemetry.current.terminal(engine.current, 'abandoned', {
          reason: 'menu',
        });
      if (measuredRun.current)
        analytics.current?.abandonRun(measuredRun.current, 'menu');
      measuredRun.current = null;
      ghost.current = null;
      setRace(null);
      engine.current?.menu();
      resetInput();
      if (engine.current) setGame(engine.current.snapshot());
    });
  }

  function fromMenu(action: () => void) {
    returnToMenu.current = true;
    setMenuOpen(false);
    action();
  }

  function closeFeature(setOpen: (open: boolean) => void, open: boolean) {
    setOpen(open);
    if (!open && returnToMenu.current) {
      returnToMenu.current = false;
      setMenuOpen(true);
    }
  }

  function changeMenuTab(tab: string) {
    setMenuTab(tab);
    if (tab === 'settings')
      telemetry.current.event('feature_panel_opened', { panel: 'settings' });
  }

  useEffect(() => {
    let disposed = false,
      frame = 0,
      last = 0,
      sync = 0;
    let unregisterTools = () => {};
    let graphics: GraphicsRecovery | undefined;
    let loaded = false;
    const loadId = analyticsId();
    const loadStarted = performance.now();
    let recoveryStarted = 0;
    let readyReported = false;
    let loadStage = 'world_initialize';
    const performanceMode = usesPerformanceGraphics(window.location.search);
    const reportReady = () => {
      if (readyReported || !loaded || graphics?.blocked) return;
      readyReported = true;
      trackEvent('game_ready', {
        surface: 'solo',
        load_id: loadId,
        load_duration_ms: Math.round(performance.now() - loadStarted),
      });
    };
    trackEvent('game_load_started', { surface: 'solo', load_id: loadId });
    analytics.current = createPlaytestAnalytics();
    const query = new URLSearchParams(window.location.search);
    const incoming = query.get('challenge');
    const incomingDaily = query.get('daily');
    const mixedLinks = incoming !== null && incomingDaily !== null;
    const loadedChallenge = mixedLinks ? null : decodeChallenge(incoming);
    const loadedDaily = mixedLinks ? null : decodeDailyTower(incomingDaily);
    if (incoming !== null || incomingDaily !== null)
      trackEvent('shared_link_opened', {
        surface: 'solo',
        link_type: mixedLinks
          ? 'mixed'
          : incomingDaily !== null
            ? 'daily'
            : 'friend_challenge',
        result: mixedLinks
          ? 'mixed'
          : loadedChallenge || loadedDaily
            ? 'valid'
            : 'invalid',
        rules_version: loadedDaily?.version ?? loadedChallenge?.version,
      });
    challengeRef.current = loadedChallenge;
    dailyRef.current = loadedDaily;
    const e = new TowerEngine(loadedDaily?.seed ?? loadedChallenge?.seed);
    engine.current = e;
    if (loadedChallenge) e.mode = loadedChallenge.mode;
    try {
      dailyProgressRef.current = readDailyProgress(
        localStorage.getItem(DAILY_PROGRESS_STORAGE_KEY),
      );
    } catch {
      /* Daily bests remain usable without persistence. */
    }
    for (const selected of ['arcade', 'party', 'practice'] as const) {
      try {
        const stored = JSON.parse(
          localStorage.getItem(bestKey(selected)) || '{}',
        );
        if (Number.isFinite(stored.floor) && Number.isFinite(stored.score))
          bestRef.current[selected] = stored;
      } catch {
        /* A run works without browser storage. */
      }
    }
    try {
      personalProgress.current = readPersonalProgress(
        localStorage.getItem(PERSONAL_PROGRESS_STORAGE_KEY),
      );
    } catch {
      /* Per-mode comparisons remain available this session. */
    }
    for (const selected of ['arcade', 'party', 'practice'] as const) {
      personalProgress.current.modes[selected].floor = Math.max(
        personalProgress.current.modes[selected].floor,
        bestRef.current[selected].floor,
      );
    }
    try {
      ghostBest.current = readGhost(localStorage.getItem(GHOST_STORAGE_KEY));
    } catch {
      /* Ghost racing still works for this session without storage. */
    }
    if (ghostBest.current?.replay.version !== CURRENT_RULES_VERSION)
      ghostBest.current = null;
    setGhostFloor(ghostBest.current?.floor ?? null);
    try {
      guidanceProfile.current = readGuidanceProfile(
        localStorage.getItem(GUIDANCE_STORAGE_KEY),
      );
    } catch {
      /* First-run guidance is the storage-free default. */
    }
    void Promise.resolve().then(() => {
      if (disposed) return;
      setTouchGuidance(window.matchMedia('(any-pointer: coarse)').matches);
      setDaily(loadedDaily);
      setDailyChoice(loadedDaily ?? todayDailyTower());
      setDailyProgress(dailyProgressRef.current);
      try {
        saveSkills(
          readSkillProgress(localStorage.getItem(SKILL_GOALS_STORAGE_KEY)),
        );
      } catch {
        /* Skill goals also work without browser storage. */
      }
      try {
        const saved = readProfile(localStorage.getItem(OUTFIT_STORAGE_KEY));
        // Existing personal records also earn their floor and score rewards.
        for (const record of Object.values(bestRef.current))
          saved.progress = advanceProgress(saved.progress, {
            ...record,
            combo: 0,
          });
        saveProfile(saved);
      } catch {
        setStorageAvailable(false);
      }
    });
    import('@/lib/tower-world')
      .then(async ({ TowerWorld }) => {
        if (disposed || !canvas.current) return;
        setChallenge(loadedChallenge);
        setMode(e.mode);
        if (incomingDaily !== null && !loadedDaily)
          setChallengeError(
            mixedLinks
              ? 'This link contains two challenges. Choose a daily tower or begin a normal climb.'
              : 'This daily tower link is invalid or unsupported. Choose today’s tower or begin a normal climb.',
          );
        if (incoming !== null && !loadedChallenge && incomingDaily === null)
          setChallengeError(
            'This challenge link is invalid or from an unsupported game version. You can still start a new climb.',
          );
        try {
          const w = new TowerWorld(canvas.current, performanceMode);
          world.current = w;
          const stopGraphics = (message: string) => {
            resetInput();
            if (e.status === 'playing') {
              e.togglePause();
              telemetry.current.pause(e, 'graphics');
            }
            audio.current?.setPaused(true);
            setReady(false);
            setGame(e.snapshot());
            setError(message);
          };
          graphics = new GraphicsRecovery(canvas.current, {
            lost: () => {
              setGraphicsReconnecting(true);
              setPerformanceRetry(false);
              recoveryStarted = performance.now();
              telemetry.current.event('graphics_context_lost', {
                load_id: loadId,
                phase: e.status,
              });
              stopGraphics(
                'Graphics were interrupted. Your climb is paused while they reconnect (up to 12 seconds).',
              );
            },
            restored: () => {
              telemetry.current.event('graphics_context_restored', {
                load_id: loadId,
                recovery_duration_ms: Math.round(
                  performance.now() - recoveryStarted,
                ),
                quality_fallback: true,
              });
              w.setQuality(false);
              setQuality(false);
              setGraphicsReconnecting(false);
              setReady(loaded);
              setError('');
              reportReady();
            },
            failed: (cause) => {
              const code = graphicsFailureCode(cause, 'render_failed');
              setGraphicsReconnecting(false);
              setPerformanceRetry(
                !performanceMode &&
                  code !== 'webgl_unavailable' &&
                  code !== 'network_failed',
              );
              telemetry.current.event('graphics_failed', {
                load_id: loadId,
                error_code: code,
                phase: e.status,
              });
              console.error('Frostbound rendering stopped.', cause);
              stopGraphics(graphicsFailureMessage(code, performanceMode));
            },
          });
          const high =
            !performanceMode && !window.matchMedia('(pointer: coarse)').matches;
          w.setQuality(high);
          w.setReducedMotion(reducedMotionRef.current);
          setQuality(high);
          // Show the real tower while the optional character model loads.
          w.render(e, 0, performance.now() / 1000);
          loadStage = 'world_assets';
          await w.load();
          if (disposed) {
            w.dispose();
            return;
          }
          loadStage = 'world_ready';
          w.setOutfit(profileRef.current.equipped);
          loaded = true;
          setReady(!graphics.blocked);
          reportReady();
          setBests({ ...bestRef.current });
          unregisterTools = registerGameTools(e, {
            start: (selected) => {
              if (graphics?.blocked) return;
              startRun(e, selected, 'game_tool');
              audio.current?.setPaused(false);
              setHelp(false);
              setGame(e.snapshot());
              canvas.current?.focus();
            },
            pause: () => {
              if (graphics?.blocked) return;
              resetInput();
              e.togglePause();
              telemetry.current.pause(e, 'game_tool');
              audio.current?.setPaused(e.status === 'paused');
              setGame(e.snapshot());
            },
          });
          let lastSnapshotStatus = e.status;
          const animate = (now: number) => {
            if (disposed) return;
            const dt = Math.min((now - (last || now)) / 1000, 0.1);
            last = now;
            graphics?.frame(() => {
              reportReady();
              if (aiRun.current) jev.current?.tick(e, dt);
              else e.tick(dt, input.current.controls);
              audio.current?.updateAction(
                e.time,
                e.rulesVersion >= 6 ? e.action.frenzyTime : 0,
                e.status === 'playing',
              );
              ghost.current?.advanceTo(e.time);
              const events = e.drainEvents();
              let savedGhost = false;
              const milestone = comboFeedback.current.observe(
                e.combo,
                e.comboTime,
              );
              if (
                milestone !== null &&
                !events.some((event) => event.type === 'frenzy')
              )
                tone('combo', milestone);
              if (!aiRun.current) {
                const guided = advanceGuidance(
                  guidanceProfile.current,
                  guidanceRun.current,
                  e,
                  events,
                  input.current.controls,
                );
                saveGuidance(guided.profile);
                guidanceRun.current = guided.run;
                const cue = getGuidanceCue(
                  guidanceProfile.current,
                  guidanceRun.current,
                  e,
                );
                if ((cue?.id ?? null) !== guidanceCueId.current) {
                  if (cue) {
                    guidanceShownAt.current[cue.id] = e.time;
                    telemetry.current.event('guidance_step_shown', {
                      step_id: cue.id,
                      guidance_attempt_id: telemetry.current.runId,
                      active_duration_s: e.time,
                    });
                  }
                  guidanceCueId.current = cue?.id ?? null;
                  setGuidanceCue(cue);
                }
              }
              if (
                !aiRun.current &&
                events.some((event) => event.type === 'land')
              ) {
                const section = getTowerSection(e.floor);
                if (section.id !== sectionShown.current) {
                  sectionShown.current = section.id;
                  showCallout(
                    {
                      kind: 'section',
                      eyebrow: `Floor ${section.startsAtFloor}`,
                      title: section.name
                        .toLowerCase()
                        .replace(/\b\w/g, (c) => c.toUpperCase()),
                    },
                    2.8,
                  );
                }
              }
              for (const event of events) {
                w.effect(event, e.time);
                if (event.type !== 'combo') tone(event.type);
                if (event.type === 'over' && !aiRun.current) {
                  const progress = recordPersonalProgress(
                    personalProgress.current,
                    e.snapshot(),
                  );
                  if (progress !== personalProgress.current) {
                    personalProgress.current = progress;
                    try {
                      localStorage.setItem(
                        PERSONAL_PROGRESS_STORAGE_KEY,
                        JSON.stringify(progress),
                      );
                    } catch {
                      /* Preserve session records. */
                    }
                  }
                  if (dailyRef.current) {
                    const next = updateDailyProgress(
                      dailyProgressRef.current,
                      dailyRef.current,
                      e,
                    );
                    if (next !== dailyProgressRef.current) {
                      const previous = getDailyBest(
                        dailyProgressRef.current,
                        dailyRef.current,
                      );
                      telemetry.current.event('daily_best_improved', {
                        daily_date: dailyRef.current.date,
                        previous_floor: previous?.floor ?? 0,
                        previous_score: previous?.score ?? 0,
                        floor: e.floor,
                        score: e.score,
                      });
                      dailyProgressRef.current = next;
                      setDailyProgress(next);
                      try {
                        localStorage.setItem(
                          DAILY_PROGRESS_STORAGE_KEY,
                          JSON.stringify(next),
                        );
                      } catch {
                        /* Keep this visit's daily best. */
                      }
                    }
                  }
                  resetInput();
                  setGhostUnavailable(
                    e.mode === 'arcade' && e.floor > 0 && !e.getReplay(),
                  );
                  const nextGhost =
                    e.version === CURRENT_RULES_VERSION
                      ? bestGhost(ghostBest.current, e)
                      : ghostBest.current;
                  if (nextGhost && nextGhost !== ghostBest.current) {
                    savedGhost = true;
                    ghostBest.current = nextGhost;
                    setGhostFloor(nextGhost.floor);
                    setNewGhost(true);
                    try {
                      localStorage.setItem(
                        GHOST_STORAGE_KEY,
                        JSON.stringify(nextGhost),
                      );
                    } catch {
                      /* Keep the ghost in memory if storage is full or blocked. */
                    }
                  }
                  const record = {
                    floor: Math.max(bestRef.current[e.mode].floor, e.floor),
                    score: Math.max(bestRef.current[e.mode].score, e.score),
                  };
                  bestRef.current = { ...bestRef.current, [e.mode]: record };
                  setBests(bestRef.current);
                  try {
                    localStorage.setItem(
                      bestKey(e.mode),
                      JSON.stringify(record),
                    );
                  } catch {
                    /* Optional local record. */
                  }
                }
              }
              if (events.length && !aiRun.current) {
                saveSkills(
                  advanceSkillProgress(skillsRef.current, e.snapshot()),
                );
                const current = profileRef.current;
                const progress = advanceProgress(current.progress, {
                  floor: e.floor,
                  score: e.score,
                  combo: e.bestCombo,
                  stomps: e.action.stomps,
                });
                if (
                  ACHIEVEMENT_METRICS.some(
                    (metric) => progress[metric] !== current.progress[metric],
                  )
                ) {
                  const earned = COSMETICS.filter(
                    (item) =>
                      !isUnlocked(item, current.progress) &&
                      isUnlocked(item, progress),
                  );
                  for (const item of earned)
                    telemetry.current.event('cosmetic_unlocked', {
                      item_id: item.id,
                      slot: item.slot,
                      criterion: item.metric,
                    });
                  saveProfile({ ...current, progress });
                  if (earned.length)
                    setNewOutfits((previous) => [
                      ...new Set([
                        ...previous,
                        ...earned.map((item) => item.name),
                      ]),
                    ]);
                }
              }
              if (!aiRun.current && (events.length || now - sync > 65))
                telemetry.current.progress(e);
              if (
                !aiRun.current &&
                events.some((event) => event.type === 'over')
              ) {
                if (measuredRun.current)
                  analytics.current?.finishRun(measuredRun.current, {
                    floor: e.floor,
                    bestCombo: e.bestCombo,
                    wallRebounds: e.wallJumps,
                    gems: e.gems,
                  });
                const completed = telemetry.current.terminal(e, 'finished', {
                  input_type: lastInput.current,
                  personal_best_floor: e.floor > startBest.current.floor,
                  personal_best_score: e.score > startBest.current.score,
                  skill_goals_completed:
                    skillsRef.current.completed.length - startGoalCount.current,
                  new_ghost: savedGhost,
                  recording_unavailable:
                    e.mode === 'arcade' && e.floor > 0 && !e.getReplay(),
                });
                if (completed) {
                  telemetry.current.event('run_results_viewed', {
                    view: 'summary',
                  });
                  if (challengeRef.current)
                    telemetry.current.event('challenge_result', {
                      target_floor: challengeRef.current.floor,
                      target_score: challengeRef.current.score,
                      floor_beaten: e.floor > challengeRef.current.floor,
                      score_beaten: e.score > challengeRef.current.score,
                    });
                  if (startGhostFloor.current !== null)
                    telemetry.current.event('ghost_result', {
                      target_floor: startGhostFloor.current,
                      beaten: e.floor > startGhostFloor.current,
                    });
                }
              }
              if (e.status === 'playing') {
                firstJumpRef.current = getFirstJumpGuidance(
                  e,
                  input.current.controls,
                  firstJumpRef.current,
                  firstJumpEnabled.current && !guidanceProfile.current.skipped,
                );
              }
              const landingGuide =
                e.status === 'playing' ? firstJumpRef.current : null;
              w.render(e, dt, now / 1000, ghost.current, landingGuide);
              if (
                (e.status === 'playing' && now - sync > 65) ||
                e.status !== lastSnapshotStatus ||
                events.length
              ) {
                setGame(e.snapshot());
                lastSnapshotStatus = e.status;
                if (aiRun.current && jev.current)
                  setJevLive(jev.current.liveState(e));
                setRace(ghost.current?.snapshot(e) ?? null);
                setFirstJump(landingGuide);
                sync = now;
              }
            });
            frame = requestAnimationFrame(animate);
          };
          frame = requestAnimationFrame(animate);
        } catch (cause) {
          if (disposed) return;
          const code = graphicsFailureCode(cause, 'world_load_failed');
          trackEvent('game_load_failed', {
            surface: 'solo',
            load_id: loadId,
            stage: loadStage,
            error_code: code,
            load_duration_ms: Math.round(performance.now() - loadStarted),
          });
          graphics?.dispose();
          world.current?.dispose();
          world.current = null;
          loaded = false;
          setReady(false);
          setGraphicsReconnecting(false);
          setPerformanceRetry(
            !performanceMode &&
              code !== 'webgl_unavailable' &&
              code !== 'network_failed',
          );
          console.error(cause);
          setError(graphicsFailureMessage(code, performanceMode));
        }
      })
      .catch((cause) => {
        if (disposed) return;
        trackEvent('game_load_failed', {
          surface: 'solo',
          load_id: loadId,
          stage: 'import',
          error_code: graphicsFailureCode(cause, 'import_failed'),
          load_duration_ms: Math.round(performance.now() - loadStarted),
        });
        setGraphicsReconnecting(false);
        setPerformanceRetry(false);
        setError('The game could not load. Check your connection and reload.');
      });
    const key = (event: KeyboardEvent, down: boolean) => {
      const source = `key:${event.code}`;
      if (!down) {
        input.current.release(source);
        setTouchPressed({ ...input.current.controls });
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (!loaded || graphics?.blocked) return;
      const editable =
        event.target instanceof HTMLElement &&
        event.target.closest(
          'input, select, textarea, dialog, [role="dialog"], [data-jev-inspector]',
        );
      if (editable) return;
      if (
        [
          'KeyA',
          'KeyD',
          'KeyW',
          'ArrowLeft',
          'ArrowRight',
          'ArrowUp',
          'Space',
        ].includes(event.code)
      )
        setTouchGuidance(false);
      const button =
        event.target instanceof HTMLElement &&
        event.target.closest('button, a, summary, [role="tab"]');
      const active = e.status === 'playing';
      if (
        ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space'].includes(event.code) &&
        active &&
        !button
      )
        event.preventDefault();
      if (active && !button && !aiRun.current) {
        if (event.code === 'KeyA' || event.code === 'ArrowLeft')
          input.current.press(source, 'left');
        if (event.code === 'KeyD' || event.code === 'ArrowRight')
          input.current.press(source, 'right');
        if (['Space', 'ArrowUp', 'KeyW'].includes(event.code))
          input.current.press(source, 'jump');
        setTouchPressed({ ...input.current.controls });
      }
      lastInput.current = 'keyboard';
      if (event.repeat) return;
      if (event.code === 'Escape' || event.code === 'KeyP') {
        resetInput();
        e.togglePause();
        telemetry.current.pause(e, 'keyboard');
        audio.current?.setPaused(e.status === 'paused');
        setGame(e.snapshot());
      }
      if (event.code === 'Enter' && aiRun.current) {
        event.preventDefault();
        return;
      }
      if (event.code === 'Enter' && !button && world.current) {
        if (e.status === 'paused') {
          e.togglePause();
          telemetry.current.pause(e, 'keyboard');
          audio.current?.setPaused(false);
        } else if (e.status !== 'playing') {
          startRun(e, e.mode, 'keyboard');
          audio.current?.setPaused(false);
          tone('jump');
        }
        setGame(e.snapshot());
      }
    };
    const down = (event: KeyboardEvent) => key(event, true),
      up = (event: KeyboardEvent) => key(event, false);
    const blur = () => {
      resetInput();
      if (e.status === 'playing') {
        e.togglePause();
        telemetry.current.pause(e, document.hidden ? 'visibility' : 'blur');
        audio.current?.setPaused(true);
        setGame(e.snapshot());
      }
    };
    const viewport = window.visualViewport;
    const syncViewport = () => {
      const style = document.documentElement.style;
      style.setProperty(
        '--visible-height',
        `${viewport?.height ?? window.innerHeight}px`,
      );
      style.setProperty('--visible-top', `${viewport?.offsetTop ?? 0}px`);
    };
    syncViewport();
    viewport?.addEventListener('resize', syncViewport);
    viewport?.addEventListener('scroll', syncViewport);
    const orientation = window.matchMedia('(orientation: portrait)');
    orientation.addEventListener('change', blur);
    const visibility = () => {
      if (document.hidden) blur();
    };
    const endVisit = () => {
      telemetry.current.terminal(e, 'abandoned', { reason: 'unload' });
      if (measuredRun.current)
        analytics.current?.abandonRun(measuredRun.current, 'unload');
    };
    const pagehide = (event: PageTransitionEvent) => {
      // Back/forward cache restores this same run and its measurement ID.
      // Pause it rather than permanently recording an abandonment.
      if (event.persisted) blur();
      else endVisit();
    };
    const fullscreen = () =>
      trackEvent('fullscreen_changed', {
        surface: 'solo',
        fullscreen: !!document.fullscreenElement,
      });
    document.addEventListener('fullscreenchange', fullscreen);
    window.addEventListener('pagehide', pagehide);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      disposed = true;
      jev.current?.stop();
      endVisit();
      cancelAnimationFrame(frame);
      graphics?.dispose();
      world.current?.dispose();
      world.current = null;
      engine.current = null;
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('fullscreenchange', fullscreen);
      window.removeEventListener('pagehide', pagehide);
      orientation.removeEventListener('change', blur);
      viewport?.removeEventListener('resize', syncViewport);
      viewport?.removeEventListener('scroll', syncViewport);
      document.documentElement.style.removeProperty('--visible-height');
      document.documentElement.style.removeProperty('--visible-top');
      unregisterTools();
      audio.current?.dispose();
      audio.current = null;
    };
  }, []);

  const releaseTouch = (event: React.PointerEvent<HTMLButtonElement>) => {
    input.current.release(`pointer:${event.pointerId}`);
    setTouchPressed({ ...input.current.controls });
  };
  const pressTouch = (event: React.PointerEvent<HTMLButtonElement>) => {
    lastInput.current = event.pointerType === 'touch' ? 'touch' : 'pointer';
    setTouchGuidance(true);
    const control = event.currentTarget.dataset.control;
    if (control !== 'left' && control !== 'right' && control !== 'jump') return;
    if (
      aiRun.current ||
      engine.current?.status !== 'playing' ||
      event.button !== 0
    )
      return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    input.current.press(`pointer:${event.pointerId}`, control);
    setTouchPressed({ ...input.current.controls });
  };
  const moveTouch = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (
      event.currentTarget.dataset.control === 'jump' ||
      !input.current.has(`pointer:${event.pointerId}`)
    )
      return;
    const pad = event.currentTarget.parentElement!.getBoundingClientRect();
    input.current.press(
      `pointer:${event.pointerId}`,
      event.clientX < pad.left + pad.width / 2 ? 'left' : 'right',
    );
    setTouchPressed({ ...input.current.controls });
  };
  const touchEvents = {
    ...useGameControlKeys(
      input.current,
      game.status === 'playing' && !aiRun.current,
      () => {
        lastInput.current = 'keyboard';
        setTouchPressed({ ...input.current.controls });
      },
    ),
    onPointerDown: pressTouch,
    onPointerMove: moveTouch,
    onPointerUp: releaseTouch,
    onPointerCancel: releaseTouch,
    onLostPointerCapture: releaseTouch,
    onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
  };
  const active = game.status === 'playing' || game.status === 'paused';
  const actionRules = game.rulesVersion >= 6;
  const menuButton = (
    <Button
      variant="ghost"
      className="menu-toggle"
      onClick={() => {
        if (engine.current?.status === 'playing') pause('menu_dialog');
        setMenuOpen(true);
      }}
      aria-haspopup="dialog"
      aria-expanded={menuOpen}
      aria-label={`${game.status === 'playing' ? 'Pause and open menu' : 'Menu'}${newOutfits.length ? ', new outfits available' : ''}`}
    >
      <Menu size={18} /> <span>Menu</span>
      {newOutfits.length > 0 && (
        <i className={menuStyles.unlockDot} aria-hidden="true" />
      )}
    </Button>
  );

  return (
    <div className={JEV_ENABLED && jevMessage ? 'jev-layout' : undefined}>
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Prevent native touch callouts; this does not add an interactive action to the landmark. */}
      <main
        onContextMenu={preventTouchContextMenu}
        onPointerDownCapture={(event) => {
          lastInput.current =
            event.pointerType === 'touch' ? 'touch' : 'pointer';
        }}
        onKeyDownCapture={() => {
          lastInput.current = 'keyboard';
        }}
        className={`game-shell game-touch-surface state-${game.status} mode-${game.mode} ${active ? hudStyles.layout : ''} ${challenge ? 'friend-run' : ''} ${reducedMotion ? 'reduce-motion' : ''}`}
      >
        <canvas
          className="world-canvas"
          ref={canvas}
          tabIndex={game.status === 'ready' ? -1 : 0}
          aria-hidden={game.status === 'ready'}
          aria-label="Icy Tower game. Use the on-screen left, right and jump buttons, or A/D and Space. Pause with the top button or Escape."
        />
        <div className="screen-vignette" />
        <header className="topbar" hidden={game.status === 'ready'}>
          <div className="brand">
            <Snowflake size={23} strokeWidth={1.4} />
            <span>
              ICY TOWER<small>F R O S T B O U N D</small>
            </span>
          </div>
          {game.status !== 'ready' && (
            <div className="topbar-right">{menuButton}</div>
          )}
        </header>
        {game.status === 'ready' && (
          <TitleMenu
            mode={mode}
            ready={ready}
            failed={!!error}
            sound={sound}
            touch={touchGuidance}
            best={best}
            skills={skills}
            newOutfits={newOutfits.length}
            invited={!!daily || !!challenge}
            playLabel={
              daily
                ? 'Climb daily tower'
                : challenge
                  ? 'Accept challenge'
                  : 'Begin ascent'
            }
            onPlay={() => begin()}
            onModes={() => {
              changeMenuTab('play');
              setMenuOpen(true);
            }}
            onDaily={() => {
              setDailyChoice(daily ?? todayDailyTower());
              setDailyOpen(true);
            }}
            onProgress={() => {
              changeMenuTab('progress');
              setMenuOpen(true);
            }}
            onOutfits={openWardrobe}
            onLeaderboard={openLeaderboard}
            onHelp={() => setHelp(true)}
            onSettings={() => {
              changeMenuTab('settings');
              setMenuOpen(true);
            }}
            onSound={() => changeSound(!sound)}
            context={
              daily ? (
                <div className="friend-invite">
                  <span>DAILY TOWER · CLASSIC</span>
                  <strong>{daily.date}</strong>
                  <p>Same tower for everyone. Unlimited attempts.</p>
                  <Button variant="ghost" onClick={leaveDaily}>
                    Leave daily tower
                  </Button>
                </div>
              ) : challenge ? (
                <div className="friend-invite">
                  <span>FRIEND CHALLENGE</span>
                  <strong>Beat floor {challenge.floor}.</strong>
                  <p>
                    {challenge.score.toLocaleString()} points ·{' '}
                    {MODE_LABELS[challenge.mode]}
                    <br />
                    Same tower. Your turn.
                  </p>
                  <Button variant="ghost" onClick={leaveChallenge}>
                    Leave challenge
                  </Button>
                </div>
              ) : challengeError ? (
                <p className="friend-link-error" role="alert">
                  {challengeError}
                </p>
              ) : null
            }
          />
        )}
        {active && (
          <>
            <GameHud
              game={game}
              skills={skills}
              guidance={game.status === 'playing' ? guidanceCue : null}
              ghost={race}
              touch={touchGuidance}
              firstJump={game.status === 'playing' ? firstJump : null}
              onSkip={() => saveGuidance(skipGuidance(guidanceProfile.current))}
            />
            <HudCallout callout={game.status === 'playing' ? callout : null} />
            {game.status === 'playing' && (
              <fieldset
                className="touch-controls"
                aria-label="Touch game controls"
                data-guidance={guidanceCue?.id}
                data-guidance-direction={firstJump?.direction ?? undefined}
                data-guidance-phase={firstJump?.phase}
              >
                <fieldset className="touch-move" aria-label="Movement">
                  <Button
                    aria-label="Move left"
                    aria-pressed={touchPressed.left}
                    data-control="left"
                    {...touchEvents}
                  >
                    <ArrowLeft />
                  </Button>
                  <Button
                    aria-label="Move right"
                    aria-pressed={touchPressed.right}
                    data-control="right"
                    {...touchEvents}
                  >
                    <ArrowRight />
                  </Button>
                </fieldset>
                <Button
                  className="touch-jump"
                  aria-label="Jump"
                  aria-pressed={touchPressed.jump}
                  data-control="jump"
                  {...touchEvents}
                >
                  <ArrowUp />
                  <span>{game.doubleJumpReady ? 'DOUBLE' : 'JUMP'}</span>
                </Button>
              </fieldset>
            )}
          </>
        )}
        {(game.status === 'paused' || game.status === 'over') && (
          <RunSummaryDialog
            open={
              !error &&
              !graphicsReconnecting &&
              !menuOpen &&
              !help &&
              !runDetailsOpen &&
              !leaderboardOpen &&
              !wardrobeOpen &&
              !dailyOpen &&
              !dailyShare &&
              !sharedRun &&
              !challengesOpen &&
              !measurementsOpen &&
              !pendingActivity
            }
            paused={game.status === 'paused'}
            onContinue={() =>
              game.status === 'paused'
                ? pause()
                : aiRun.current
                  ? beginJev()
                  : begin()
            }
            onExit={menu}
            returnFocus={() =>
              engine.current?.status === 'playing'
                ? canvas.current
                : engine.current?.status === 'ready'
                  ? document.querySelector<HTMLElement>('[data-start-climb]')
                  : false
            }
          >
            <section
              className={`result-card run-summary ${resultStyles.card} ${game.status === 'paused' ? resultStyles.pauseCard : ''}`}
              aria-label={
                game.status === 'paused' ? 'Paused climb' : 'Climb result'
              }
            >
              <div
                className={
                  game.status === 'over' ? resultStyles.overview : undefined
                }
              >
                <div
                  className={
                    game.status === 'over' ? resultStyles.outcome : undefined
                  }
                >
                  {game.status === 'over' && (
                    <span className="run-context">
                      {daily
                        ? `DAILY TOWER · ${daily.date}`
                        : challenge
                          ? 'FRIEND CHALLENGE'
                          : `${MODE_LABELS[game.mode].toUpperCase()} CLIMB`}
                    </span>
                  )}
                  <h2 id="run-summary-heading" tabIndex={-1}>
                    {game.status === 'paused' ? (
                      'Paused.'
                    ) : (
                      <>Floor {game.floor}.</>
                    )}
                  </h2>
                  {game.status === 'paused' && (
                    <p className={resultStyles.pauseDescription}>
                      The tower can wait.
                    </p>
                  )}
                  {game.status === 'over' ? (
                    <dl
                      className={resultStyles.metrics}
                      id="run-summary-metrics"
                    >
                      <div>
                        <dt>Points</dt>
                        <dd>{game.score.toLocaleString()}</dd>
                      </div>
                      <div>
                        <dt>Best combo</dt>
                        <dd>
                          {game.bestCombo}
                          <span>×</span>
                        </dd>
                      </div>
                    </dl>
                  ) : (
                    <dl
                      className={resultStyles.pauseMetrics}
                      id="run-summary-metrics"
                    >
                      <div>
                        <dt>Floor</dt>
                        <dd>{game.floor}</dd>
                      </div>
                      <div>
                        <dt>Points</dt>
                        <dd>{game.score.toLocaleString()}</dd>
                      </div>
                    </dl>
                  )}
                  {game.status === 'over' &&
                    !aiRun.current &&
                    (challenge || game.floor > 0 || runBaseline.floor > 0) && (
                      <p
                        className={`run-highlight ${(challenge ? game.floor > challenge.floor : game.floor > runBaseline.floor) ? 'is-record' : ''}`}
                      >
                        {challenge
                          ? game.floor > challenge.floor
                            ? 'Challenge beaten!'
                            : `Challenge target · Floor ${challenge.floor + 1}`
                          : game.floor > runBaseline.floor
                            ? 'New personal best!'
                            : `Personal best · ${runBaseline.floor} floors`}
                      </p>
                    )}
                </div>
                {game.status === 'over' && !aiRun.current && (
                  <NextClimb
                    snapshot={game}
                    baseline={runBaseline}
                    skills={skills}
                    achievementProgress={profile.progress}
                    challengeFloor={challenge?.floor}
                    daily={!!daily}
                  />
                )}
              </div>
              <Button
                className="start-button"
                onClick={() =>
                  aiRun.current &&
                  (game.status === 'over' || jev.current?.finished)
                    ? beginJev()
                    : game.status === 'paused'
                      ? pause()
                      : begin()
                }
              >
                {game.status === 'paused' ? (
                  <Play size={16} />
                ) : (
                  <RotateCcw size={16} />
                )}
                {aiRun.current &&
                (game.status === 'over' || jev.current?.finished)
                  ? 'WATCH JEV AGAIN'
                  : game.status === 'paused'
                    ? 'Resume climb'
                    : daily
                      ? 'RETRY DAILY TOWER'
                      : challenge
                        ? 'RETRY CHALLENGE'
                        : 'CLIMB AGAIN'}
                <ArrowRight size={18} />
              </Button>
              {game.status === 'over' && !aiRun.current && (
                <span className="retry-hint">
                  or press <kbd>ENTER</kbd>
                </span>
              )}
              <div
                className={
                  game.status === 'over' ? resultStyles.extras : undefined
                }
              >
                {game.status === 'over' && newOutfits.length > 0 && (
                  <Button
                    variant="ghost"
                    className="run-unlock"
                    onClick={openWardrobe}
                  >
                    <Shirt size={18} aria-hidden="true" />
                    <span>
                      Unlocked: {newOutfits.join(', ')}
                      <small>Try on your reward</small>
                    </span>
                    <ChevronRight size={16} aria-hidden="true" />
                  </Button>
                )}
                {game.status === 'over' &&
                  !challenge &&
                  !daily &&
                  game.mode !== 'practice' &&
                  game.floor < 5 &&
                  runBaseline.floor < 5 && (
                    <Button
                      variant="ghost"
                      className="run-practice"
                      onClick={guidedPractice}
                    >
                      <Footprints size={16} aria-hidden="true" />
                      Practice without rising frost
                    </Button>
                  )}
                {game.status === 'over' &&
                  !challenge &&
                  game.mode !== 'practice' &&
                  (daily || Math.max(game.floor, runBaseline.floor) >= 5) &&
                  newOutfits.length === 0 && (
                    <DailyReturn
                      daily={daily}
                      onStartToday={() =>
                        playDaily(todayDailyTower(), 'results')
                      }
                    />
                  )}
                {game.status === 'paused' && (
                  <div className="pause-options">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        changeMenuTab('settings');
                        setMenuOpen(true);
                      }}
                    >
                      <Settings2 size={17} />
                      Settings
                      <ChevronRight size={16} />
                    </Button>
                    <Button variant="ghost" onClick={() => setHelp(true)}>
                      <CircleHelp size={17} />
                      How to play
                      <ChevronRight size={16} />
                    </Button>
                  </div>
                )}
                {game.status === 'over' &&
                  !aiRun.current &&
                  game.mode !== 'practice' &&
                  game.floor > 0 && (
                    <Button
                      variant="outline"
                      className="run-ranking"
                      onClick={openLeaderboard}
                    >
                      <Trophy size={16} aria-hidden="true" /> Submit score &
                      rankings
                      <ChevronRight size={16} aria-hidden="true" />
                    </Button>
                  )}
              </div>
              <div className="run-summary-actions">
                {game.status === 'over' && !aiRun.current && (
                  <Button
                    variant="ghost"
                    onClick={() => setRunDetailsOpen(true)}
                  >
                    Run details <ChevronRight size={14} />
                  </Button>
                )}
                <Button variant="ghost" onClick={menu}>
                  Back to title
                </Button>
              </div>
            </section>
          </RunSummaryDialog>
        )}
        <Dialog
          open={!!pendingActivity}
          onOpenChange={(open) => {
            if (!open) {
              pendingActivity?.restore();
              setPendingActivity(null);
            }
          }}
        >
          <DialogContent className="leave-climb-dialog">
            <DialogTitle>Leave this climb?</DialogTitle>
            <DialogDescription>
              You’re on floor {game.floor}. This unfinished run will end; your
              saved records stay with you.
            </DialogDescription>
            <Button
              className="keep-climbing"
              onClick={() => {
                pendingActivity?.restore();
                setPendingActivity(null);
              }}
            >
              Keep this climb
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                const action = pendingActivity?.run;
                setPendingActivity(null);
                action?.();
              }}
            >
              {pendingActivity?.label}
            </Button>
          </DialogContent>
        </Dialog>
        <Dialog
          open={runDetailsOpen && game.status === 'over'}
          onOpenChange={setRunDetailsOpen}
        >
          <DialogContent className="result-card help-card run-details-dialog">
            <DialogTitle>Your climb.</DialogTitle>
            <DialogDescription>
              {MODE_LABELS[game.mode]} · Floor {game.floor} ·{' '}
              {game.score.toLocaleString()} points
            </DialogDescription>
            <p className="run-detail-timing">
              Time {formatTime(game.time)} ·{' '}
              {game.mode === 'practice'
                ? 'Practice pace off'
                : `Pace ${game.pace.level}`}
            </p>
            <div className="run-details-content">
              <RunFeedback snapshot={game} />
              {actionRules && <TowerActionResults action={game.action} />}
              <PersonalProgressResults baseline={runBaseline} run={game} />
              <FeaturedSkillGoal profile={skills} snapshot={game} />
              {daily && (
                <DailyTowerBanner
                  daily={daily}
                  best={getDailyBest(dailyProgress, daily)}
                />
              )}
              {challenge && (
                <p className="run-details-note">
                  {game.floor > challenge.floor
                    ? 'Floor beaten!'
                    : game.floor === challenge.floor
                      ? 'Floor matched — climb one higher to win.'
                      : `Challenge: beat floor ${challenge.floor}.`}{' '}
                  {game.score > challenge.score
                    ? 'Score beaten!'
                    : `Score to beat: ${challenge.score.toLocaleString()}.`}
                </p>
              )}
              {game.mode === 'arcade' && !daily && (
                <p className="run-details-note">
                  <Ghost size={18} />
                  {ghostUnavailable
                    ? 'This climb exceeded the ghost recording limit.'
                    : newGhost
                      ? 'New ghost ready. Race this climb next run.'
                      : race
                        ? `Ghost to beat: floor ${race.floor}.`
                        : 'Reach a floor and finish to record your ghost.'}
                </p>
              )}
            </div>
            <div className="run-details-actions">
              <Button
                variant="outline"
                onClick={() => {
                  setRunDetailsOpen(false);
                  openLeaderboard();
                }}
              >
                <Trophy size={16} />{' '}
                {game.mode !== 'practice' && game.floor > 0
                  ? 'Submit score & leaderboard'
                  : 'View leaderboard'}
              </Button>
              {game.floor > 0 && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setRunDetailsOpen(false);
                    shareRun();
                  }}
                >
                  <Share2 size={16} /> Challenge a friend
                </Button>
              )}
              {daily && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setRunDetailsOpen(false);
                    openDailyShare(daily);
                  }}
                >
                  Share daily tower
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
          <DialogContent className={menuStyles.dialog}>
            <div className={menuStyles.header}>
              <DialogTitle className={menuStyles.title}>
                {menuTab === 'play'
                  ? 'Choose your climb.'
                  : menuTab === 'progress'
                    ? 'Your ascent.'
                    : 'Your settings.'}
              </DialogTitle>
              <DialogDescription className={menuStyles.description}>
                {menuTab === 'play'
                  ? 'Three ways up. Find yours.'
                  : menuTab === 'progress'
                    ? 'Your milestones, your climbing kit, your place on the tower.'
                    : 'Fine-tune the sound, atmosphere, and feel of your climb.'}
              </DialogDescription>
            </div>
            <Tabs
              className={menuStyles.tabs}
              value={menuTab}
              onValueChange={(value) => changeMenuTab(String(value))}
            >
              <TabsList className={menuStyles.tabList} aria-label="Climb menu">
                <TabsTrigger value="play">
                  <Play aria-hidden="true" />
                  Play
                </TabsTrigger>
                <TabsTrigger value="progress">
                  <Trophy aria-hidden="true" />
                  Your ascent
                </TabsTrigger>
                <TabsTrigger value="settings">
                  <Settings2 aria-hidden="true" />
                  Settings
                </TabsTrigger>
              </TabsList>
              <div className={menuStyles.body}>
                <TabsContent value="play" className={menuStyles.panel}>
                  <div className={menuStyles.modeChooser}>
                    <fieldset
                      className={menuStyles.modes}
                      disabled={active || !!challenge || !!daily}
                    >
                      <legend className="sr-only">Choose your mode</legend>
                      <div className={menuStyles.modeGrid}>
                        {(
                          [
                            {
                              value: 'arcade',
                              label: 'Classic',
                              description:
                                'The original endless climb. Outrun the rising frost.',
                              Icon: Snowflake,
                            },
                            {
                              value: 'party',
                              label: 'Party',
                              description:
                                'Low gravity, spring platforms, and double jumps.',
                              Icon: Sparkles,
                            },
                            {
                              value: 'practice',
                              label: 'Practice',
                              description:
                                'Learn at your own pace. No rising frost. Unranked.',
                              Icon: Footprints,
                            },
                          ] as const
                        ).map(({ value, label, description, Icon }) => (
                          <label className={menuStyles.modeCard} key={value}>
                            <input
                              type="radio"
                              name="game-mode"
                              aria-label={label}
                              value={value}
                              checked={mode === value}
                              onChange={() => {
                                if (value !== mode)
                                  trackEvent('mode_selected', {
                                    surface: 'solo',
                                    previous_mode: mode,
                                    mode: value,
                                  });
                                setMode(value);
                                if (engine.current) {
                                  engine.current.start(
                                    value,
                                    engine.current.seed,
                                    CURRENT_RULES_VERSION,
                                  );
                                  engine.current.status = 'ready';
                                  setGame(engine.current.snapshot());
                                }
                              }}
                            />
                            <Icon aria-hidden="true" />
                            <strong>{label}</strong>
                            <small>{description}</small>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <ModePreview mode={mode} />
                  </div>
                  {(active || challenge || daily) && (
                    <p className={menuStyles.note}>
                      {active
                        ? 'Return to the title screen to change mode.'
                        : daily
                          ? 'Leave the daily tower to choose a different mode.'
                          : 'Leave this challenge to choose a different mode.'}
                    </p>
                  )}
                  <section
                    className={menuStyles.group}
                    aria-labelledby="menu-play-heading"
                  >
                    <h3 id="menu-play-heading">More ways to climb</h3>
                    {JEV_ENABLED && (
                      <Button
                        className={menuStyles.row}
                        variant="ghost"
                        disabled={!ready || !!error}
                        onClick={() => fromMenu(beginJev)}
                      >
                        <Play aria-hidden="true" />
                        <span>
                          Watch Jev play <small>AI player · unranked</small>
                        </span>
                        <ChevronRight aria-hidden="true" />
                      </Button>
                    )}
                    <Button
                      className={menuStyles.row}
                      variant="ghost"
                      render={
                        // oxlint-disable-next-line next/no-html-link-for-pages -- Vinext's client router fails in the static Netlify export.
                        <a
                          href="/race"
                          aria-label="Multiplayer lobbies"
                          onClick={(event) => {
                            if (
                              !active ||
                              event.metaKey ||
                              event.ctrlKey ||
                              event.shiftKey ||
                              event.altKey
                            )
                              return;
                            event.preventDefault();
                            requestActivity('Go to multiplayer', () => {
                              window.location.href = '/race';
                            });
                          }}
                        />
                      }
                      nativeButton={false}
                    >
                      <Users aria-hidden="true" />
                      <span>
                        Multiplayer lobbies
                        <small>Host or join a 2–4 player climb</small>
                      </span>
                      <ChevronRight aria-hidden="true" />
                    </Button>
                    <Button
                      className={menuStyles.row}
                      variant="ghost"
                      onClick={() =>
                        fromMenu(() => {
                          setDailyChoice(daily ?? todayDailyTower());
                          setDailyOpen(true);
                        })
                      }
                    >
                      <CalendarDays aria-hidden="true" />
                      <span>
                        Daily tower
                        <small>
                          One shared route. A fresh start every day.
                        </small>
                      </span>
                      <ChevronRight aria-hidden="true" />
                    </Button>
                    <Button
                      className={menuStyles.row}
                      variant="ghost"
                      disabled={!ready}
                      onClick={guidedPractice}
                    >
                      <Footprints aria-hidden="true" />
                      <span>
                        Guided practice
                        <small>Learn the jumps, one step at a time</small>
                      </span>
                      <ChevronRight aria-hidden="true" />
                    </Button>
                    <Button
                      className={menuStyles.row}
                      variant="ghost"
                      onClick={() => fromMenu(() => setHelp(true))}
                    >
                      <CircleHelp aria-hidden="true" />
                      <span>
                        How to play
                        <small>
                          Controls, combos, and the art of the ascent
                        </small>
                      </span>
                      <ChevronRight aria-hidden="true" />
                    </Button>
                  </section>
                </TabsContent>
                <TabsContent value="progress" className={menuStyles.panel}>
                  <section
                    className={menuStyles.group}
                    aria-labelledby="menu-progress-heading"
                  >
                    <div className={menuStyles.progressOverview}>
                      <div>
                        <span>
                          PERSONAL BEST · {MODE_LABELS[mode].toUpperCase()}
                        </span>
                        <strong>
                          {best.floor}
                          <small> floors</small>
                        </strong>
                      </div>
                      <div>
                        <span>MILESTONES EARNED</span>
                        <strong>
                          {skills.completed.length}
                          <small> / {SKILL_GOALS.length}</small>
                        </strong>
                      </div>
                    </div>
                    <h3 id="menu-progress-heading">Continue your story</h3>
                    <Button
                      className={menuStyles.row}
                      variant="ghost"
                      onClick={() => fromMenu(() => setChallengesOpen(true))}
                    >
                      <Target aria-hidden="true" />
                      <span>
                        Skill goals
                        <small>Small challenges. Stronger climbs.</small>
                      </span>
                      <ChevronRight aria-hidden="true" />
                    </Button>
                    <Button
                      className={menuStyles.row}
                      variant="ghost"
                      onClick={() => fromMenu(openWardrobe)}
                    >
                      <Shirt aria-hidden="true" />
                      <span>
                        Outfits <small>Make your climber your own</small>
                        {newOutfits.length > 0 && (
                          <span className={menuStyles.newLabel}>New</span>
                        )}
                      </span>
                      <ChevronRight aria-hidden="true" />
                    </Button>
                    {newOutfits.length > 0 && (
                      <p className={menuStyles.unlockDetails}>
                        Unlocked: {newOutfits.join(', ')}. Open Outfits to try
                        them on.
                      </p>
                    )}
                    <Button
                      className={menuStyles.row}
                      variant="ghost"
                      onClick={() => fromMenu(openLeaderboard)}
                    >
                      <Trophy aria-hidden="true" />
                      <span>
                        Leaderboard<small>See how high you can go</small>
                      </span>
                      <ChevronRight aria-hidden="true" />
                    </Button>
                    {ghostFloor !== null && (
                      <p className={menuStyles.ghost}>
                        <Ghost aria-hidden="true" />
                        <span>Classic ghost</span>
                        <strong>Floor {ghostFloor}</strong>
                      </p>
                    )}
                  </section>
                </TabsContent>
                <TabsContent value="settings" className={menuStyles.panel}>
                  <GameSettings
                    sound={sound}
                    music={music}
                    reducedMotion={reducedMotion}
                    quality={quality}
                    onSound={changeSound}
                    onMotion={changeMotion}
                    onMusic={(enabled) => {
                      trackEvent('setting_changed', {
                        surface: 'solo',
                        setting: 'music',
                        previous_value: music,
                        value: enabled,
                        source: 'user',
                      });
                      setMusic(enabled);
                      audio.current ??= new TowerAudio();
                      audio.current.setMusicEnabled(enabled);
                    }}
                    onQuality={(enabled) => {
                      trackEvent('setting_changed', {
                        surface: 'solo',
                        setting: 'quality',
                        previous_value: quality,
                        value: enabled,
                        source: 'user',
                      });
                      setQuality(enabled);
                      world.current?.setQuality(enabled);
                    }}
                    onFullscreen={() => {
                      const request = document.fullscreenElement
                        ? document.exitFullscreen()
                        : document.documentElement.requestFullscreen?.();
                      if (!request) {
                        trackEvent('fullscreen_failed', {
                          surface: 'solo',
                          error_code: 'unavailable',
                        });
                        setToast('Fullscreen is unavailable in this view.');
                        setTimeout(() => setToast(''), 3500);
                      }
                      void request?.catch(() => {
                        trackEvent('fullscreen_failed', {
                          surface: 'solo',
                          error_code: 'rejected',
                        });
                        setToast('Fullscreen is unavailable in this view.');
                        setTimeout(() => setToast(''), 3500);
                      });
                    }}
                  />
                </TabsContent>
              </div>
            </Tabs>
            <footer className={menuStyles.footer}>
              <span>
                {menuTab === 'settings'
                  ? 'Changes apply instantly'
                  : active
                    ? 'Your climb is paused'
                    : 'The tower is waiting'}
              </span>
              <Button
                disabled={menuTab === 'play' && !active && (!ready || !!error)}
                onClick={() => {
                  setMenuOpen(false);
                  if (active && game.status === 'paused') pause();
                  else if (menuTab === 'play' && !active) begin();
                }}
              >
                {active
                  ? 'Resume climb'
                  : menuTab === 'play'
                    ? daily
                      ? 'Climb daily tower'
                      : challenge
                        ? 'Accept challenge'
                        : `Play ${MODE_LABELS[mode]}`
                    : game.status === 'over'
                      ? 'Back to results'
                      : 'Back to title'}
                <ChevronRight aria-hidden="true" />
              </Button>
            </footer>
          </DialogContent>
        </Dialog>
        <Dialog
          open={dailyOpen}
          onOpenChange={(open) => closeFeature(setDailyOpen, open)}
        >
          <DialogContent className={dailyStyles.dialog}>
            <DialogTitle>Daily tower.</DialogTitle>
            <DialogDescription>
              One shared route. As many tries as it takes.
            </DialogDescription>
            <fieldset disabled={!ready} className="daily-options">
              <DailyTowerCard
                daily={dailyChoice}
                best={getDailyBest(dailyProgress, dailyChoice)}
                onStart={() => playDaily(dailyChoice)}
                onShare={() => openDailyShare(dailyChoice)}
                onToday={
                  dailyChoice.date !== todayDailyTower().date
                    ? () => setDailyChoice(todayDailyTower())
                    : undefined
                }
              />
            </fieldset>
          </DialogContent>
        </Dialog>
        <Dialog
          open={!!dailyShare}
          onOpenChange={(open) => {
            if (!open) setDailyShare('');
          }}
        >
          <DialogContent className="result-card help-card daily-dialog">
            <DialogTitle>Share this daily tower.</DialogTitle>
            <DialogDescription>
              This link always opens the same dated tower, even after the daily
              rotation.
            </DialogDescription>
            <label htmlFor="daily-share-url">Tower link</label>
            <input
              id="daily-share-url"
              className="daily-share-url"
              readOnly
              value={dailyShare}
              onFocus={(event) => event.target.select()}
            />
            <Button
              onClick={() => {
                const operationId = analyticsId();
                const props = {
                  share_type: 'daily',
                  method: 'clipboard',
                  operation_id: operationId,
                };
                telemetry.current.event('share_attempted', props);
                if (!navigator.clipboard) {
                  telemetry.current.event('share_failed', {
                    ...props,
                    error_code: 'unavailable',
                  });
                  setCopyStatus('Select and copy the link above.');
                  return;
                }
                void navigator.clipboard
                  .writeText(dailyShare)
                  .then(() => {
                    telemetry.current.event('share_completed', props);
                    setCopyStatus('Link copied.');
                  })
                  .catch(() => {
                    telemetry.current.event('share_failed', {
                      ...props,
                      error_code: 'clipboard_failed',
                    });
                    setCopyStatus('Select and copy the link above.');
                  });
              }}
            >
              Copy link
            </Button>
            <output aria-live="polite">{copyStatus}</output>
          </DialogContent>
        </Dialog>
        <Dialog
          open={challengesOpen}
          onOpenChange={(open) => closeFeature(setChallengesOpen, open)}
        >
          <DialogContent
            className={skillGoalStyles.dialog}
            initialFocus={goalsTitle}
          >
            <header className={skillGoalStyles.header}>
              <span className={skillGoalStyles.eyebrow}>
                <Target aria-hidden="true" /> ONE CLIMB AT A TIME
              </span>
              <DialogTitle
                className={skillGoalStyles.title}
                ref={goalsTitle}
                tabIndex={-1}
              >
                Your climbing goals.
              </DialogTitle>
              <DialogDescription className={skillGoalStyles.description}>
                Small steps. Higher places.
              </DialogDescription>
            </header>
            <div className={skillGoalStyles.body}>
              <SkillGoalProgression
                profile={skills}
                snapshot={game}
                onSelect={(id) => {
                  const next = selectSkillGoal(skillsRef.current, id);
                  if (next !== skillsRef.current)
                    telemetry.current.event('skill_goal_selected', {
                      goal_id: id,
                      previous_goal_id: skillsRef.current.featuredId,
                    });
                  saveSkills(next);
                }}
              />
              <details className={skillGoalStyles.expert}>
                <summary>
                  <span>Extra challenges</span>
                  <small>Reset each run</small>
                  <ChevronRight aria-hidden="true" />
                </summary>
                <div>
                  <QuickChallenges challenges={game.challenges} preview />
                </div>
              </details>
            </div>
            <footer className={skillGoalStyles.footer}>
              <Button
                variant="ghost"
                onClick={() => closeFeature(setChallengesOpen, false)}
              >
                Done
              </Button>
              <Button
                className={skillGoalStyles.primary}
                disabled={!ready || !!error}
                onClick={() => {
                  if (active) {
                    closeFeature(setChallengesOpen, false);
                    return;
                  }
                  if (skills.completed.length === SKILL_GOALS.length) {
                    setChallengesOpen(false);
                    setDailyChoice(daily ?? todayDailyTower());
                    setDailyOpen(true);
                  } else begin();
                }}
              >
                {active
                  ? 'Back to climb'
                  : skills.completed.length === SKILL_GOALS.length
                    ? 'Try the daily tower'
                    : 'Start climbing'}{' '}
                <ArrowRight size={18} />
              </Button>
            </footer>
          </DialogContent>
        </Dialog>
        <HowToPlayDialog
          open={help}
          onOpenChange={(open) => closeFeature(setHelp, open)}
          ready={ready && !error}
          active={active}
          onPractice={guidedPractice}
          onPlay={() => begin()}
          onMeasurements={() => {
            setHelp(false);
            setMeasurementsOpen(true);
          }}
        />
        {sharedRun && (
          <FriendChallengeDialog
            runId={remoteRunId}
            challenge={sharedRun.challenge}
            url={sharedRun.url}
            onClose={() => setSharedRun(null)}
          />
        )}
        {leaderboardOpen && (
          <LeaderboardDialog
            runId={submissionRun ? remoteRunId : undefined}
            open={leaderboardOpen}
            onOpenChange={(open) => closeFeature(setLeaderboardOpen, open)}
            run={submissionRun}
            outfit={profile.equipped}
            initialMode={mode === 'party' ? 'party' : 'arcade'}
          />
        )}
        <WardrobeDialog
          open={wardrobeOpen}
          onOpenChange={(open) => closeFeature(setWardrobeOpen, open)}
          profile={profile}
          onEquip={equip}
          storageAvailable={storageAvailable}
        />
        {error && (
          <div
            className="error-message"
            role="alert"
            style={{
              maxHeight: 'calc(var(--visible-height, 100dvh) - 32px)',
              overflowY: 'auto',
            }}
          >
            <p>{error}</p>
            {!graphicsReconnecting && (
              <>
                <p className="text-xs opacity-80">
                  Reloading ends the current climb. Previously saved records and
                  unlocks stay saved.
                </p>
                {performanceRetry && (
                  <Button
                    onClick={() => {
                      telemetry.current.event('graphics_retry', {
                        performance_mode: true,
                      });
                      location.replace(graphicsRetryUrl(location.href));
                    }}
                  >
                    Reload in performance mode
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => {
                    telemetry.current.event('graphics_retry', {
                      performance_mode: usesPerformanceGraphics(
                        location.search,
                      ),
                    });
                    location.reload();
                  }}
                >
                  Reload game
                </Button>
              </>
            )}
          </div>
        )}
        {toast && <output className="toast">{toast}</output>}
        {measurementsOpen && (
          <PlaytestReport
            onClose={() => {
              setMeasurementsOpen(false);
              setHelp(true);
            }}
          />
        )}
      </main>
      {JEV_ENABLED && jevMessage && (
        <JevInspector
          records={jevTrace}
          live={jevLive}
          message={game.status === 'over' ? 'Climb finished.' : jevMessage}
          paused={game.status !== 'playing'}
          canPause={
            !jev.current?.finished &&
            (game.status === 'playing' || game.status === 'paused')
          }
          onPause={() => {
            if (game.status === 'playing' || game.status === 'paused')
              pause('jev_inspector');
          }}
          onStop={menu}
        />
      )}
    </div>
  );
}
