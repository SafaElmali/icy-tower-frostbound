'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CalendarDays,
  ChevronRight,
  CircleHelp,
  Footprints,
  Settings2,
  Diamond,
  Ghost,
  Maximize2,
  Menu,
  Pause,
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
import menuStyles from './game-menu.module.css';
import mobileHudStyles from '@/components/mobile-game-hud.module.css';
import { MobileGameHud } from '@/components/mobile-game-hud';
import { WardrobeDialog } from '@/components/wardrobe';
import {
  COSMETICS,
  OUTFIT_STORAGE_KEY,
  advanceProgress,
  isUnlocked,
  normalizeOutfit,
  readProfile,
  type OutfitSlot,
  type WardrobeProfile,
} from '@/lib/outfits';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
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
import { PersonalProgressResults } from '@/components/personal-progress';
import {
  readPersonalProgress,
  personalRunBaseline,
  recordPersonalProgress,
  PERSONAL_PROGRESS_STORAGE_KEY,
} from '@/lib/personal-progress';
import {
  ComboFeedbackTracker,
  comboMilestoneLabel,
  type ComboMilestone,
} from '@/lib/combo-feedback';
import { getTowerSection } from '@/lib/tower-sections';
import { DailyTowerCard, DailyTowerBanner } from '@/components/daily-tower';
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
import { ClimbGuidance } from '@/components/climb-guidance';
import {
  hasActionNotice,
  TowerActionHud,
  TowerActionResults,
  TowerFrenzyMeter,
} from '@/components/tower-action-hud';
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
  const [touchPressed, setTouchPressed] = useState(freshControls());
  const [game, setGame] = useState<Snapshot>(initial);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<GameMode>('arcade');
  const [sound, setSound] = useState(true);
  const [quality, setQuality] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const reducedMotionRef = useRef(false);
  const [help, setHelp] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [runDetailsOpen, setRunDetailsOpen] = useState(false);
  const [challengesOpen, setChallengesOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [submissionRun, setSubmissionRun] = useState<RunReplay | null>(null);
  const [wardrobeOpen, setWardrobeOpen] = useState(false);
  const [profile, setProfile] = useState<WardrobeProfile>(() =>
    readProfile(null),
  );
  const profileRef = useRef(profile);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [unlockNotice, setUnlockNotice] = useState('');
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
  const [comboMilestone, setComboMilestone] = useState<ComboMilestone | null>(
    null,
  );
  const sectionNoticeRef = useRef<{ id: string; until: number } | null>(null);
  const [sectionNotice, setSectionNotice] = useState('');

  function saveGuidance(next: GuidanceProfile) {
    if (guidanceProfile.current === next) return;
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
        if (!skillsRef.current.completed.includes(id))
          analytics.current?.completeGoal(measuredRun.current, id);
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

  function startRun(e: TowerEngine, selectedMode: GameMode) {
    if (measuredRun.current)
      analytics.current?.abandonRun(measuredRun.current, 'restart');
    resetInput();
    setMenuOpen(false);
    setRunDetailsOpen(false);
    guidanceRun.current = freshGuidanceRun();
    comboFeedback.current.reset();
    setComboMilestone(null);
    sectionNoticeRef.current = null;
    setSectionNotice('');
    guidanceCueId.current = null;
    setGuidanceCue(null);
    ghost.current = null;
    if (dailyRef.current) startDailyRun(e, dailyRef.current);
    else if (challengeRef.current)
      startChallengeRun(e, challengeRef.current, selectedMode);
    else ghost.current = startGhostRun(e, ghostBest.current, selectedMode);
    const baseline = personalRunBaseline(personalProgress.current, e.mode);
    setRunBaseline(baseline);
    world.current?.setPersonalBest(baseline.floor);
    measuredRun.current =
      analytics.current?.beginRun({
        mode: `${dailyRef.current ? 'daily:' : challengeRef.current ? 'challenge:' : ''}${e.mode}`,
      }) ?? null;
    setMode(e.mode);
    setSharedRun(null);
    setRace(ghost.current?.snapshot(e) ?? null);
    setNewGhost(false);
    setGhostUnavailable(false);
    audio.current?.setPaused(false);
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
    saveProfile({ ...current, equipped });
    world.current?.setOutfit(equipped);
  }
  function openWardrobe() {
    if (engine.current?.status === 'playing') pause();
    setWardrobeOpen(true);
  }
  useEffect(() => {
    if (!unlockNotice) return;
    const timer = setTimeout(() => setUnlockNotice(''), 6000);
    return () => clearTimeout(timer);
  }, [unlockNotice]);

  function resetInput() {
    input.current.reset();
    setTouchPressed(freshControls());
  }
  function tone(type: string, milestone?: ComboMilestone) {
    if (!soundRef.current) return;
    audio.current ??= new TowerAudio();
    audio.current.play(type, milestone);
  }
  function begin(selectedMode = mode) {
    if (!engine.current || !ready) return;
    startRun(engine.current, selectedMode);
    audio.current?.setPaused(false);
    setGame(engine.current.snapshot());
    setHelp(false);
    setChallengesOpen(false);
    tone('jump');
    canvas.current?.focus({ preventScroll: true });
  }
  function leaveChallenge() {
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
    dailyRef.current = null;
    setDaily(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('daily');
    window.history.replaceState(window.history.state, '', url);
  }
  function playDaily(selected: DailyTower) {
    if (!ready) return;
    leaveChallenge();
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
  }
  function guidedPractice() {
    if (!ready) return;
    leaveChallenge();
    leaveDaily();
    saveGuidance(replayGuidance());
    begin('practice');
  }
  function openDailyShare(selected: DailyTower) {
    setDailyShare(dailyTowerUrl(window.location.href, selected));
    setDailyOpen(false);
    setCopyStatus('');
  }
  function pause() {
    const e = engine.current;
    if (!e) return;
    resetInput();
    e.togglePause();
    audio.current?.setPaused(e.status === 'paused');
    setGame(e.snapshot());
    if (e.status === 'playing') canvas.current?.focus({ preventScroll: true });
  }
  function openLeaderboard() {
    if (engine.current?.status === 'playing') pause();
    setSubmissionRun(engine.current?.getReplay() ?? null);
    setLeaderboardOpen(true);
  }
  function menu() {
    setRunDetailsOpen(false);
    if (measuredRun.current)
      analytics.current?.abandonRun(measuredRun.current, 'menu');
    measuredRun.current = null;
    ghost.current = null;
    setRace(null);
    engine.current?.menu();
    resetInput();
    if (engine.current) setGame(engine.current.snapshot());
  }

  function fromMenu(action: () => void) {
    setMenuOpen(false);
    action();
  }

  useEffect(() => {
    let disposed = false,
      frame = 0,
      last = 0,
      sync = 0;
    let unregisterTools = () => {};
    analytics.current = createPlaytestAnalytics();
    const query = new URLSearchParams(window.location.search);
    const incoming = query.get('challenge');
    const incomingDaily = query.get('daily');
    const mixedLinks = incoming !== null && incomingDaily !== null;
    const loadedChallenge = mixedLinks ? null : decodeChallenge(incoming);
    const loadedDaily = mixedLinks ? null : decodeDailyTower(incomingDaily);
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
          const w = new TowerWorld(canvas.current);
          world.current = w;
          const high = !window.matchMedia('(pointer: coarse)').matches;
          w.setQuality(high);
          w.setReducedMotion(reducedMotionRef.current);
          setQuality(high);
          await w.load();
          if (disposed) {
            w.dispose();
            return;
          }
          w.setOutfit(profileRef.current.equipped);
          setReady(true);
          setBests({ ...bestRef.current });
          unregisterTools = registerGameTools(e, {
            start: (selected) => {
              startRun(e, selected);
              audio.current?.setPaused(false);
              setHelp(false);
              setGame(e.snapshot());
              canvas.current?.focus();
            },
            pause: () => {
              resetInput();
              e.togglePause();
              setGame(e.snapshot());
            },
          });
          const animate = (now: number) => {
            const dt = Math.min((now - (last || now)) / 1000, 0.1);
            last = now;
            e.tick(dt, input.current.controls);
            audio.current?.updateAction(
              e.time,
              e.rulesVersion >= 6 ? e.action.frenzyTime : 0,
              e.status === 'playing',
            );
            ghost.current?.advanceTo(e.time);
            const events = e.drainEvents();
            const milestone = comboFeedback.current.observe(
              e.combo,
              e.comboTime,
            );
            if (milestone !== null) {
              setComboMilestone(milestone);
              if (!events.some((event) => event.type === 'frenzy'))
                tone('combo', milestone);
            } else if (e.combo === 0)
              setComboMilestone((previous) =>
                previous === null ? previous : null,
              );
            const section = getTowerSection(e.floor);
            if (
              section.startsAtFloor > 0 &&
              sectionNoticeRef.current?.id !== section.id
            ) {
              sectionNoticeRef.current = { id: section.id, until: e.time + 3 };
              setSectionNotice(section.name);
            }
            if (
              sectionNoticeRef.current &&
              e.time > sectionNoticeRef.current.until
            )
              setSectionNotice((previous) => (previous ? '' : previous));
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
              guidanceCueId.current = cue?.id ?? null;
              setGuidanceCue(cue);
            }
            for (const event of events) {
              w.effect(event, e.time);
              if (event.type !== 'combo') tone(event.type);
              if (event.type === 'over') {
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
                if (measuredRun.current)
                  analytics.current?.finishRun(measuredRun.current, {
                    floor: e.floor,
                    bestCombo: e.bestCombo,
                    wallRebounds: e.wallJumps,
                    gems: e.gems,
                  });
                resetInput();
                setGhostUnavailable(
                  e.mode === 'arcade' && e.floor > 0 && !e.getReplay(),
                );
                const nextGhost =
                  e.version === CURRENT_RULES_VERSION
                    ? bestGhost(ghostBest.current, e)
                    : ghostBest.current;
                if (nextGhost && nextGhost !== ghostBest.current) {
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
                  localStorage.setItem(bestKey(e.mode), JSON.stringify(record));
                } catch {
                  /* Optional local record. */
                }
              }
            }
            if (events.length) {
              saveSkills(advanceSkillProgress(skillsRef.current, e.snapshot()));
              const current = profileRef.current;
              const progress = advanceProgress(current.progress, {
                floor: e.floor,
                score: e.score,
                combo: e.bestCombo,
              });
              if (
                progress.floor !== current.progress.floor ||
                progress.score !== current.progress.score ||
                progress.combo !== current.progress.combo
              ) {
                const earned = COSMETICS.filter(
                  (item) =>
                    !isUnlocked(item, current.progress) &&
                    isUnlocked(item, progress),
                );
                saveProfile({ ...current, progress });
                if (earned.length)
                  setUnlockNotice(
                    `Unlocked: ${earned.map((item) => item.name).join(', ')}. Find it in Outfits.`,
                  );
              }
            }
            w.render(e, dt, now / 1000, ghost.current);
            if (now - sync > 65 || events.length) {
              setGame(e.snapshot());
              setRace(ghost.current?.snapshot(e) ?? null);
              sync = now;
            }
            frame = requestAnimationFrame(animate);
          };
          frame = requestAnimationFrame(animate);
        } catch (cause) {
          console.error(cause);
          setError(
            'The 3D world could not load. Please reload in a browser with WebGL enabled.',
          );
        }
      })
      .catch(() =>
        setError('The game could not load. Check your connection and reload.'),
      );
    const key = (event: KeyboardEvent, down: boolean) => {
      const source = `key:${event.code}`;
      if (!down) {
        input.current.release(source);
        setTouchPressed({ ...input.current.controls });
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const editable =
        event.target instanceof HTMLElement &&
        event.target.closest(
          'input, select, textarea, dialog, [role="dialog"]',
        );
      if (editable) return;
      const button =
        event.target instanceof HTMLElement && event.target.closest('button');
      const active = e.status === 'playing';
      if (
        ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space'].includes(event.code) &&
        (active || !button)
      )
        event.preventDefault();
      if (active) {
        if (event.code === 'KeyA' || event.code === 'ArrowLeft')
          input.current.press(source, 'left');
        if (event.code === 'KeyD' || event.code === 'ArrowRight')
          input.current.press(source, 'right');
        if (['Space', 'ArrowUp', 'KeyW'].includes(event.code))
          input.current.press(source, 'jump');
        setTouchPressed({ ...input.current.controls });
      }
      if (event.repeat) return;
      if (event.code === 'Escape' || event.code === 'KeyP') {
        resetInput();
        e.togglePause();
        audio.current?.setPaused(e.status === 'paused');
        setGame(e.snapshot());
      }
      if (event.code === 'Enter' && !button && world.current) {
        if (e.status === 'paused') {
          e.togglePause();
          audio.current?.setPaused(false);
        } else if (e.status !== 'playing') {
          startRun(e, e.mode);
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
      if (measuredRun.current)
        analytics.current?.abandonRun(measuredRun.current, 'unload');
    };
    const pagehide = (event: PageTransitionEvent) => {
      // Back/forward cache restores this same run and its measurement ID.
      // Pause it rather than permanently recording an abandonment.
      if (event.persisted) blur();
      else endVisit();
    };
    window.addEventListener('pagehide', pagehide);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      disposed = true;
      endVisit();
      cancelAnimationFrame(frame);
      world.current?.dispose();
      world.current = null;
      engine.current = null;
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', visibility);
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
    const control = event.currentTarget.dataset.control;
    if (control !== 'left' && control !== 'right' && control !== 'jump') return;
    if (engine.current?.status !== 'playing' || event.button !== 0) return;
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
    onPointerDown: pressTouch,
    onPointerMove: moveTouch,
    onPointerUp: releaseTouch,
    onPointerCancel: releaseTouch,
    onLostPointerCapture: releaseTouch,
    onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
  };
  const active = game.status === 'playing' || game.status === 'paused';
  const zone = getTowerSection(game.floor).name;
  const actionRules = game.rulesVersion >= 6;
  const actionNotice = actionRules && hasActionNotice(game.action);

  return (
    <main
      className={`game-shell state-${game.status} mode-${game.mode} ${active ? mobileHudStyles.layout : ''} ${challenge ? 'friend-run' : ''} ${reducedMotion ? 'reduce-motion' : ''}`}
    >
      <canvas
        className="world-canvas"
        ref={canvas}
        tabIndex={0}
        aria-label="Icy Tower game. Use the on-screen left, right and jump buttons, or A/D and Space. Pause with the top button or Escape."
      />
      <div className="screen-vignette" />
      <header className="topbar">
        <div className="brand">
          <Snowflake size={23} strokeWidth={1.4} />
          <span>
            ICY TOWER<small>F R O S T B O U N D</small>
          </span>
        </div>
        <div className="topbar-right">
          {active && (
            <span className="edition">
              <i /> {MODE_LABELS[game.mode].toUpperCase()} · {zone}
            </span>
          )}
          {active && (
            <Button
              variant="ghost"
              size="icon"
              className="utility"
              onClick={pause}
              aria-label={
                game.status === 'paused' ? 'Resume game' : 'Pause game'
              }
            >
              {game.status === 'paused' ? <Play /> : <Pause />}
            </Button>
          )}
          <Button
            variant="ghost"
            className="menu-toggle"
            onClick={() => {
              if (engine.current?.status === 'playing') pause();
              setMenuOpen(true);
            }}
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            aria-label={
              game.status === 'playing' ? 'Pause and open menu' : 'Menu'
            }
          >
            <Menu size={18} /> <span>Menu</span>
          </Button>
        </div>
      </header>
      {game.status === 'playing' && sectionNotice && !actionNotice && (
        <output className="section-notice" aria-live="polite">
          {sectionNotice}
        </output>
      )}
      {game.status === 'ready' && (
        <>
          <section
            className={`title-screen ${challenge || daily || challengeError ? 'has-challenge' : ''}`}
          >
            <h1>
              ICY
              <br />
              <span>TOWER</span>
            </h1>
            <div className="subtitle">
              <i /> F R O S T B O U N D <i />
            </div>
            {daily ? (
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
            ) : null}
            <div className="title-play">
              <Button
                className="start-button"
                onClick={() => begin()}
                disabled={!ready || !!error}
              >
                <Play size={17} fill="currentColor" />
                {ready
                  ? daily
                    ? 'CLIMB DAILY TOWER'
                    : challenge
                      ? 'ACCEPT CHALLENGE'
                      : `PLAY ${MODE_LABELS[mode].toUpperCase()}`
                  : 'ENTERING THE TOWER…'}
                <ArrowRight size={19} />
              </Button>
              <span className="enter-hint">
                or press <kbd>ENTER</kbd>
              </span>
              {best.floor > 0 && (
                <p className="title-record">
                  Personal best · {best.floor} floors
                </p>
              )}
            </div>
          </section>
        </>
      )}
      {active && (
        <>
          {game.status === 'playing' && (
            <MobileGameHud
              game={game}
              guidance={guidanceCue}
              onSkip={() => saveGuidance(skipGuidance(guidanceProfile.current))}
            />
          )}
          {!actionNotice && (
            <aside className="skill-hud">
              <FeaturedSkillGoal profile={skills} snapshot={game} />
            </aside>
          )}
          {game.status === 'playing' && actionRules && (
            <div className="desktop-action-hud">
              <TowerActionHud action={game.action} />
            </div>
          )}
          {game.status === 'playing' && guidanceCue && (
            <div className="guidance-dock">
              <ClimbGuidance
                cue={guidanceCue}
                onSkip={() =>
                  saveGuidance(skipGuidance(guidanceProfile.current))
                }
              />
            </div>
          )}
          <section className="score-hud">
            {daily && (
              <DailyTowerBanner
                daily={daily}
                best={getDailyBest(dailyProgress, daily)}
              />
            )}
            <span className="eyebrow">FLOOR</span>
            <strong>{game.floor.toString().padStart(3, '0')}</strong>
            <div className="score-number">
              {game.score.toLocaleString()} <small>PTS</small>
            </div>
            <div className="run-readout" aria-label="Run time and tower pace">
              <span aria-label="Elapsed time">{formatTime(game.time)}</span>
              {game.mode !== 'practice' && game.pace.level > 0 && (
                <span>· Pace {game.pace.level}</span>
              )}
            </div>
            <div className="height-readout">
              <ArrowUp size={13} /> {game.height} m
            </div>
            <div className="gem-count">
              <Diamond size={13} /> {game.gems}
            </div>
            {race && (
              <div
                className={`ghost-race ${race.beaten ? 'ghost-beaten' : ''}`}
              >
                <span>
                  <Ghost size={16} /> YOUR BEST · {race.floor}
                </span>
                <strong>
                  {race.beaten
                    ? 'Best floor beaten!'
                    : race.finished
                      ? 'Ghost finished'
                      : race.lead === 0
                        ? 'Neck and neck'
                        : `${Math.abs(race.lead)} m ${race.lead > 0 ? 'ahead' : 'behind'}`}
                </strong>
                <small>
                  {race.finished || race.beaten
                    ? 'Keep climbing for a new record'
                    : 'Racing your previous climb'}
                </small>
              </div>
            )}
            {game.mode === 'party' && (
              <div
                className="party-hud"
                data-power-active={game.doubleJumpTime > 0}
              >
                <strong>PARTY · LOW GRAVITY</strong>
                <span>
                  {game.doubleJumpTime > 0
                    ? `DOUBLE JUMP · ${Math.ceil(game.doubleJumpTime)}s`
                    : 'CRYSTALS GRANT DOUBLE JUMPS'}
                </span>
                {game.doubleJumpTime > 0 && (
                  <small>
                    {game.doubleJumpReady
                      ? 'PRESS JUMP AGAIN IN MIDAIR'
                      : 'LAND TO RECHARGE'}
                  </small>
                )}
                <small>Pink springs launch you higher</small>
              </div>
            )}
            {challenge && (
              <div className="friend-target">
                <span>
                  {game.floor > challenge.floor
                    ? 'Floor beaten!'
                    : `Beat floor ${challenge.floor}`}
                </span>
                <small>
                  {game.score > challenge.score
                    ? 'Score beaten!'
                    : `${challenge.score.toLocaleString()} pts to beat`}
                </small>
              </div>
            )}
          </section>
          <div
            className={`combo-hud ${(game.combo >= 3 || (actionRules && game.action.frenzyTime > 0)) && !guidanceCue ? 'visible' : ''}`}
          >
            <span>
              {comboMilestone
                ? comboMilestoneLabel(comboMilestone).toUpperCase()
                : 'KEEP IT GOING'}
            </span>
            <strong>
              {game.combo}
              <small>COMBO</small>
            </strong>
            <div className="combo-track">
              <i style={{ transform: `scaleX(${game.comboTime / 3.8})` }} />
            </div>
            {actionRules && <TowerFrenzyMeter action={game.action} />}
          </div>
          <div className="speed-meter">
            <span>MOMENTUM</span>
            <div>
              {Array.from({ length: 12 }, (_, i) => (
                <i
                  key={i}
                  className={(game.speed / 8.4) * 12 > i ? 'filled' : ''}
                />
              ))}
            </div>
            <small>
              {game.speed > 6
                ? 'SUPER JUMP READY'
                : 'BUILD SPEED TO JUMP HIGHER'}
            </small>
          </div>
          {game.stormDistance < 4 && game.status === 'playing' && (
            <div className="storm-warning">
              <ArrowUp size={15} /> THE FROST IS CATCHING UP
            </div>
          )}
          {game.status === 'playing' && (
            <fieldset
              className="touch-controls"
              aria-label="Touch game controls"
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
        <div className="overlay">
          <section
            className="result-card run-summary"
            aria-label={
              game.status === 'paused' ? 'Paused climb' : 'Climb result'
            }
          >
            <span className="run-context">
              {game.status === 'paused'
                ? 'PAUSED'
                : daily
                  ? `DAILY TOWER · ${daily.date}`
                  : challenge
                    ? 'FRIEND CHALLENGE'
                    : `${MODE_LABELS[game.mode].toUpperCase()} CLIMB`}
            </span>
            <h2>
              {game.status === 'paused' ? (
                'Take a breath.'
              ) : (
                <>Floor {game.floor}.</>
              )}
            </h2>
            <p className="run-metrics">
              {game.status === 'paused'
                ? `Floor ${game.floor}`
                : `${game.score.toLocaleString()} points`}
              <span aria-hidden="true"> · </span>
              {game.status === 'paused'
                ? `${game.score.toLocaleString()} points`
                : `${game.bestCombo}× best combo`}
            </p>
            {game.status === 'over' && (
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
            <Button
              className="start-button"
              onClick={() => (game.status === 'paused' ? pause() : begin())}
            >
              {game.status === 'paused' ? (
                <Play size={16} />
              ) : (
                <RotateCcw size={16} />
              )}
              {game.status === 'paused'
                ? 'CONTINUE'
                : daily
                  ? 'RETRY DAILY TOWER'
                  : challenge
                    ? 'RETRY CHALLENGE'
                    : 'CLIMB AGAIN'}
              <ArrowRight size={18} />
            </Button>
            {game.status === 'over' && (
              <span className="retry-hint">
                or press <kbd>ENTER</kbd>
              </span>
            )}
            <div className="run-summary-actions">
              {game.status === 'over' && (
                <Button variant="ghost" onClick={() => setRunDetailsOpen(true)}>
                  Run details <ChevronRight size={14} />
                </Button>
              )}
              <Button variant="ghost" onClick={menu}>
                Back to title
              </Button>
            </div>
          </section>
        </div>
      )}
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
              Make it your climb.
            </DialogTitle>
          </div>
          <DialogDescription className="sr-only">
            Game modes, challenges, progress, and settings.
          </DialogDescription>
          <div className={menuStyles.body}>
            <div className={menuStyles.mode}>
              <label htmlFor="game-mode">Game mode</label>
              <NativeSelect
                className={menuStyles.modeSelect}
                disabled={active || !!challenge || !!daily}
                id="game-mode"
                aria-label="Game mode"
                value={mode}
                onChange={(event) => {
                  const next = event.target.value as GameMode;
                  setMode(next);
                  if (engine.current) {
                    engine.current.start(
                      next,
                      engine.current.seed,
                      CURRENT_RULES_VERSION,
                    );
                    engine.current.status = 'ready';
                    setGame(engine.current.snapshot());
                  }
                }}
              >
                <NativeSelectOption value="arcade">Classic</NativeSelectOption>
                <NativeSelectOption value="party">Party</NativeSelectOption>
                <NativeSelectOption value="practice">
                  Practice
                </NativeSelectOption>
              </NativeSelect>
            </div>
            {active && (
              <p className={menuStyles.note}>
                Return to the title screen to change mode.
              </p>
            )}
            <section
              className={menuStyles.group}
              aria-labelledby="menu-play-heading"
            >
              <h3 id="menu-play-heading">Play</h3>
              <Button
                className={menuStyles.row}
                variant="ghost"
                render={<Link href="/race" aria-label="Race a friend" />}
                nativeButton={false}
              >
                <Users aria-hidden="true" />
                <span>Race a friend</span>
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
                <span>Daily tower</span>
                <ChevronRight aria-hidden="true" />
              </Button>
              <Button
                className={menuStyles.row}
                variant="ghost"
                disabled={!ready}
                onClick={() => fromMenu(guidedPractice)}
              >
                <Footprints aria-hidden="true" />
                <span>Guided practice</span>
                <ChevronRight aria-hidden="true" />
              </Button>
              <Button
                className={menuStyles.row}
                variant="ghost"
                onClick={() => fromMenu(() => setHelp(true))}
              >
                <CircleHelp aria-hidden="true" />
                <span>How to play</span>
                <ChevronRight aria-hidden="true" />
              </Button>
            </section>
            <section
              className={menuStyles.group}
              aria-labelledby="menu-progress-heading"
            >
              <h3 id="menu-progress-heading">Your climb</h3>
              <Button
                className={menuStyles.row}
                variant="ghost"
                onClick={() => fromMenu(() => setChallengesOpen(true))}
              >
                <Target aria-hidden="true" />
                <span>Skill goals</span>
                <ChevronRight aria-hidden="true" />
              </Button>
              <Button
                className={menuStyles.row}
                variant="ghost"
                onClick={() => fromMenu(openWardrobe)}
              >
                <Shirt aria-hidden="true" />
                <span>Outfits</span>
                <ChevronRight aria-hidden="true" />
              </Button>
              <Button
                className={menuStyles.row}
                variant="ghost"
                onClick={() => fromMenu(openLeaderboard)}
              >
                <Trophy aria-hidden="true" />
                <span>Leaderboard</span>
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
            <details className={menuStyles.settings}>
              <summary>
                <Settings2 aria-hidden="true" />
                <span>Settings</span>
                <ChevronRight
                  className={menuStyles.disclosure}
                  aria-hidden="true"
                />
              </summary>
              <div className={menuStyles.settingsContent}>
                <label>
                  <span>Sound</span>
                  <input
                    type="checkbox"
                    checked={sound}
                    onChange={(event) => {
                      const enabled = event.target.checked;
                      soundRef.current = enabled;
                      setSound(enabled);
                      audio.current?.setEnabled(enabled);
                      if (enabled) tone('gem');
                    }}
                  />
                </label>
                <label>
                  <span>Reduce motion</span>
                  <input
                    type="checkbox"
                    checked={reducedMotion}
                    onChange={(event) => changeMotion(event.target.checked)}
                  />
                </label>
                <label>
                  <span>High quality effects</span>
                  <input
                    type="checkbox"
                    checked={quality}
                    onChange={(event) => {
                      setQuality(event.target.checked);
                      world.current?.setQuality(event.target.checked);
                    }}
                  />
                </label>
                <Button
                  className={menuStyles.row}
                  variant="ghost"
                  onClick={() => {
                    const request = document.fullscreenElement
                      ? document.exitFullscreen()
                      : document.documentElement.requestFullscreen?.();
                    void request?.catch(() => {
                      setToast('Fullscreen is unavailable in this view.');
                      setTimeout(() => setToast(''), 3500);
                    });
                  }}
                >
                  <Maximize2 aria-hidden="true" />
                  <span>Toggle fullscreen</span>
                </Button>
              </div>
            </details>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={dailyOpen} onOpenChange={setDailyOpen}>
        <DialogContent className="result-card help-card daily-dialog">
          <DialogTitle>A new route each day.</DialogTitle>
          <DialogDescription>
            Everyone gets the same Classic tower. Retry as often as you like.
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
              void navigator.clipboard
                ?.writeText(dailyShare)
                .then(() => setCopyStatus('Link copied.'))
                .catch(() => setCopyStatus('Select and copy the link above.'));
              if (!navigator.clipboard)
                setCopyStatus('Select and copy the link above.');
            }}
          >
            Copy link
          </Button>
          <output aria-live="polite">{copyStatus}</output>
        </DialogContent>
      </Dialog>
      <Dialog open={challengesOpen} onOpenChange={setChallengesOpen}>
        <DialogContent className="result-card help-card challenges-dialog">
          <DialogTitle>Find your next challenge.</DialogTitle>
          <DialogDescription>
            Learn one skill at a time. Completed milestones stay with you across
            climbs.
          </DialogDescription>
          <SkillGoalProgression
            profile={skills}
            snapshot={game}
            onSelect={(id) =>
              saveSkills(selectSkillGoal(skillsRef.current, id))
            }
          />
          <details className="advanced-challenges">
            <summary>Expert challenges · per run</summary>
            <QuickChallenges challenges={game.challenges} preview />
          </details>
          <Button
            className="start-button"
            disabled={!ready || !!error}
            onClick={() => begin()}
          >
            BEGIN THE ASCENT <ArrowRight size={18} />
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className="result-card help-card">
          <span className="eyebrow">THE ART OF THE ASCENT</span>
          <DialogTitle>Find your rhythm.</DialogTitle>
          <div className="game-settings">
            <Button variant="ghost" disabled={!ready} onClick={guidedPractice}>
              Replay guidance in Practice
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setHelp(false);
                setMeasurementsOpen(true);
              }}
            >
              Playtest measurements
            </Button>
          </div>
          <DialogDescription className="sr-only">
            Controls and rules for climbing the tower.
          </DialogDescription>
          <div className="instruction">
            <span>
              <kbd>A</kbd>
              <kbd>D</kbd>
            </span>
            <div>
              <strong>Move with momentum</strong>
              <p>
                Hold the left or right touch button, or use A / D or the arrow
                keys. Slide across the direction pad to turn. Ice is slippery —
                steer early.
              </p>
            </div>
          </div>
          <div className="instruction">
            <kbd>SPACE</kbd>
            <div>
              <strong>Jump. Land. Repeat.</strong>
              <p>
                Tap JUMP with your other thumb while holding a direction.
                Release and tap again for the next jump. On a keyboard, use
                Space, W or ↑. Build speed for higher jumps and star-shaped
                spins.
              </p>
            </div>
          </div>
          <div className="instruction">
            <ArrowRight size={25} />
            <div>
              <strong>Jump from the walls</strong>
              <p>
                While airborne beside a wall, release and tap JUMP to push up
                and away, even at low speed. Land or jump from the opposite wall
                before boosting from that wall again. Fast automatic rebounds
                still work. Older friend challenges use their original rules.
              </p>
            </div>
          </div>
          <div className="instruction">
            <Diamond size={25} />
            <div>
              <strong>Keep your chain alive</strong>
              <p>
                Land on higher floors within 3.8 seconds. Keep a combo going to
                leave a colorful star trail. Collect crystals and skip floors to
                raise your score.
              </p>
            </div>
          </div>
          <div className="instruction">
            <ArrowUp size={25} />
            <div>
              <strong>Stay above the frost</strong>
              <p>
                The frost starts rising at floor 5 and gets faster every 30
                seconds, with an extra speed increase every 50 floors. Each
                50-floor milestone also brings narrower regular ledges; the
                full-width stages give you room to prepare. Time and pace appear
                below your score. Pausing freezes both. Practice removes automatic
                scrolling; older friend challenges keep their original pace.
              </p>
            </div>
          </div>
          <div className="instruction">
            <Snowflake size={25} />
            <div>
              <strong>Read the danger</strong>
              <p>
                Cracked ledges crumble about a second after landing — jump away.
                Icicles drop without landing markers, and bats enter without
                spawn warnings. Both appear more often as you climb and can
                arrive together. Land on a bat from above for a
                powerful bounce and bonus points. Side hits knock you back, with
                a brief recovery window.
              </p>
            </div>
          </div>
          <div className="instruction">
            <Diamond size={25} />
            <div>
              <strong>Earn a frenzy. Ride out the rush.</strong>
              <p>
                Chain 10 new floors to earn six seconds of boosted jumps and
                bonus crystal trails. Keep your combo alive to recharge after it
                ends. Higher up, brief ice showers and collapsing stair
                sequences test your reflexes, followed by breathing room. These
                mechanics arrive gradually in new climbs; older friend
                challenges and dated towers keep their original rules. Your move
                and jump controls stay the same.
              </p>
            </div>
          </div>
          <div className="instruction">
            <Diamond size={25} />
            <div>
              <strong>Party mode</strong>
              <p>
                Float in low gravity. Pink spring platforms launch you
                automatically. Collect a pink crystal for 8 seconds of double
                jumps: press jump again in midair, once per landing. Party has
                its own rankings and personal best.
              </p>
            </div>
          </div>
          <div className="instruction">
            <Ghost size={25} />
            <div>
              <strong>Race your ghost</strong>
              <p>
                Your highest completed Classic climb returns as a translucent
                rival on the same tower. Score, then time, break floor ties.
                Ghosts are saved in this browser; Party and Practice runs do not
                replace them.
              </p>
            </div>
          </div>
          <Button className="start-button" onClick={() => begin()}>
            LET’S CLIMB <ArrowRight size={18} />
          </Button>
        </DialogContent>
      </Dialog>
      {sharedRun && (
        <FriendChallengeDialog
          challenge={sharedRun.challenge}
          url={sharedRun.url}
          onClose={() => setSharedRun(null)}
        />
      )}
      {leaderboardOpen && (
        <LeaderboardDialog
          open={leaderboardOpen}
          onOpenChange={setLeaderboardOpen}
          run={submissionRun}
          outfit={profile.equipped}
          initialMode={mode === 'party' ? 'party' : 'arcade'}
        />
      )}
      <WardrobeDialog
        open={wardrobeOpen}
        onOpenChange={setWardrobeOpen}
        profile={profile}
        onEquip={equip}
        storageAvailable={storageAvailable}
      />
      {unlockNotice && (
        <output className="toast unlock-toast" aria-live="polite">
          <Shirt size={18} />
          <span>{unlockNotice}</span>
        </output>
      )}
      {error && (
        <div className="error-message" role="alert">
          {error}
          <Button onClick={() => location.reload()}>Reload game</Button>
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
      {active && (
        <footer className="bottom-bar">
          <div className="controls-legend">
            <span>
              <kbd>←</kbd>
              <kbd>→</kbd> MOVE
            </span>
            <span>
              <kbd>SPACE</kbd> JUMP
            </span>
            <span>
              <kbd>ESC</kbd> PAUSE
            </span>
          </div>
        </footer>
      )}
    </main>
  );
}
