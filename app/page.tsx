'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUp, AudioLines, ChevronRight, Diamond, Flag, Maximize2, Pause, Play, RotateCcw, Snowflake, Shirt, Trophy, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WardrobeDialog } from '@/components/wardrobe';
import { COSMETICS, OUTFIT_STORAGE_KEY, advanceProgress, isUnlocked, normalizeOutfit, readProfile, type OutfitSlot, type WardrobeProfile } from '@/lib/outfits';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { LeaderboardDialog } from '@/components/leaderboard';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { TowerInput } from '@/lib/tower-input';
import { TowerAudio } from '@/lib/tower-audio';
import { registerGameTools } from '@/lib/game-tools';
import { TowerEngine, freshControls, MODE_LABELS, type GameMode, type Snapshot, type RunReplay } from '@/lib/tower-engine';
import type { TowerWorld } from '@/lib/tower-world';

type PersonalBest = { floor: number; score: number };
const emptyBests = (): Record<GameMode, PersonalBest> => ({ arcade: { floor: 0, score: 0 }, party: { floor: 0, score: 0 }, practice: { floor: 0, score: 0 } });
const bestKey = (mode: GameMode) => mode === 'arcade' ? 'frostbound-best' : `frostbound-best-${mode}`;
const initial = new TowerEngine().snapshot();
const formatTime = (t: number) => `${Math.floor(t / 60).toString().padStart(2, '0')}:${Math.floor(t % 60).toString().padStart(2, '0')}`;

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
  const [help, setHelp] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [submissionRun, setSubmissionRun] = useState<RunReplay | null>(null);
  const [wardrobeOpen, setWardrobeOpen] = useState(false);
  const [profile, setProfile] = useState<WardrobeProfile>(() => readProfile(null));
  const profileRef = useRef(profile);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [unlockNotice, setUnlockNotice] = useState('');
  const [bests, setBests] = useState(emptyBests);
  const best = bests[mode];
  const [toast, setToast] = useState('');
  const bestRef = useRef(emptyBests());
  const soundRef = useRef(true);
  const audio = useRef<TowerAudio | null>(null);

  function saveProfile(next: WardrobeProfile) {
    profileRef.current = next; setProfile(next);
    try { localStorage.setItem(OUTFIT_STORAGE_KEY, JSON.stringify(next)); setStorageAvailable(true); }
    catch { setStorageAvailable(false); }
  }
  function equip(slot: OutfitSlot, id: string) {
    const current = profileRef.current;
    const equipped = normalizeOutfit({ ...current.equipped, [slot]: id }, current.progress);
    saveProfile({ ...current, equipped }); world.current?.setOutfit(equipped);
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

  function resetInput() { input.current.reset(); setTouchPressed(freshControls()); }
  function tone(type: string) {
    if (!soundRef.current) return;
    audio.current ??= new TowerAudio(); audio.current.play(type);
  }
  function begin(selectedMode = mode) {
    if (!engine.current || !ready) return;
    setMode(selectedMode); resetInput(); engine.current.start(selectedMode, Math.floor(Math.random() * 2 ** 30));
    audio.current?.setPaused(false); setGame(engine.current.snapshot()); setHelp(false); tone('jump'); canvas.current?.focus({ preventScroll: true });
  }
  function pause() {
    const e = engine.current; if (!e) return;
    resetInput(); e.togglePause(); audio.current?.setPaused(e.status === 'paused'); setGame(e.snapshot());
    if (e.status === 'playing') canvas.current?.focus({ preventScroll: true });
  }
  function openLeaderboard() {
    if (engine.current?.status === 'playing') pause();
    setSubmissionRun(engine.current?.getReplay() ?? null); setLeaderboardOpen(true);
  }
  function menu() { engine.current?.menu(); resetInput(); if (engine.current) setGame(engine.current.snapshot()); }

  useEffect(() => {
    let disposed = false, frame = 0, last = 0, sync = 0;
    let unregisterTools = () => {};
    const e = new TowerEngine(); engine.current = e;
    for (const selected of ['arcade', 'party', 'practice'] as const) {
      try { const stored = JSON.parse(localStorage.getItem(bestKey(selected)) || '{}');
        if (Number.isFinite(stored.floor) && Number.isFinite(stored.score)) bestRef.current[selected] = stored;
      } catch { /* A run works without browser storage. */ }
    }
    void Promise.resolve().then(() => {
      if (disposed) return;
      try {
        const saved = readProfile(localStorage.getItem(OUTFIT_STORAGE_KEY));
        // Existing personal records also earn their floor and score rewards.
        for (const record of Object.values(bestRef.current)) saved.progress = advanceProgress(saved.progress, { ...record, combo: 0 });
        saveProfile(saved);
      } catch { setStorageAvailable(false); }
    });
    import('@/lib/tower-world').then(async ({ TowerWorld }) => {
      if (disposed || !canvas.current) return;
      try {
        const w = new TowerWorld(canvas.current); world.current = w;
        const high = !window.matchMedia('(pointer: coarse)').matches; w.setQuality(high); setQuality(high);
        await w.load(); if (disposed) { w.dispose(); return; }
        w.setOutfit(profileRef.current.equipped);
        setReady(true); setBests({ ...bestRef.current });
        unregisterTools = registerGameTools(e, { start: selected => { resetInput(); e.start(selected, Math.floor(Math.random()*2**30)); setMode(selected); setHelp(false); setGame(e.snapshot()); canvas.current?.focus(); }, pause: () => { resetInput(); e.togglePause(); setGame(e.snapshot()); } });
        const animate = (now: number) => {
          const dt = Math.min((now - (last || now)) / 1000, .1); last = now;
          e.tick(dt, input.current.controls);
          const events = e.drainEvents();
          for (const event of events) {
            w.effect(event, e.time); tone(event.type);
            if (event.type === 'over') {
              resetInput();
              const record = { floor: Math.max(bestRef.current[e.mode].floor, e.floor), score: Math.max(bestRef.current[e.mode].score, e.score) };
              bestRef.current = { ...bestRef.current, [e.mode]: record }; setBests(bestRef.current);
              try { localStorage.setItem(bestKey(e.mode), JSON.stringify(record)); } catch { /* Optional local record. */ }
            }
          }
          if (events.length) {
            const current = profileRef.current;
            const progress = advanceProgress(current.progress, { floor: e.floor, score: e.score, combo: e.bestCombo });
            if (progress.floor !== current.progress.floor || progress.score !== current.progress.score || progress.combo !== current.progress.combo) {
              const earned = COSMETICS.filter(item => !isUnlocked(item, current.progress) && isUnlocked(item, progress));
              saveProfile({ ...current, progress });
              if (earned.length) setUnlockNotice(`Unlocked: ${earned.map(item => item.name).join(', ')}. Find it in Outfits.`);
            }
          }
          w.render(e, dt, now / 1000);
          if (now - sync > 65 || events.length) { setGame(e.snapshot()); sync = now; }
          frame = requestAnimationFrame(animate);
        };
        frame = requestAnimationFrame(animate);
      } catch (cause) { console.error(cause); setError('The 3D world could not load. Please reload in a browser with WebGL enabled.'); }
    }).catch(() => setError('The game could not load. Check your connection and reload.'));
    const key = (event: KeyboardEvent, down: boolean) => {
      const source = `key:${event.code}`;
      if (!down) { input.current.release(source); setTouchPressed({ ...input.current.controls }); return; }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const editable = event.target instanceof HTMLElement && event.target.closest('input, select, textarea, [role="dialog"]');
      if (editable) return;
      const button = event.target instanceof HTMLElement && event.target.closest('button');
      const active = e.status === 'playing';
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space'].includes(event.code) && (active || !button)) event.preventDefault();
      if (active) {
        if (event.code === 'KeyA' || event.code === 'ArrowLeft') input.current.press(source, 'left');
        if (event.code === 'KeyD' || event.code === 'ArrowRight') input.current.press(source, 'right');
        if (['Space', 'ArrowUp', 'KeyW'].includes(event.code)) input.current.press(source, 'jump');
        setTouchPressed({ ...input.current.controls });
      }
      if (event.repeat) return;
      if (event.code === 'Escape' || event.code === 'KeyP') {
        resetInput(); e.togglePause(); audio.current?.setPaused(e.status === 'paused'); setGame(e.snapshot());
      }
      if (event.code === 'Enter' && !button && world.current) {
        if (e.status === 'paused') e.togglePause();
        else if (e.status !== 'playing') { e.start(e.mode, Math.floor(Math.random() * 2 ** 30)); resetInput(); tone('jump'); }
        setGame(e.snapshot());
      }
    };
    const down = (event: KeyboardEvent) => key(event, true), up = (event: KeyboardEvent) => key(event, false);
    const blur = () => { resetInput(); if (e.status === 'playing') { e.togglePause(); audio.current?.setPaused(true); setGame(e.snapshot()); } };
    const viewport = window.visualViewport;
    const syncViewport = () => {
      const style = document.documentElement.style;
      style.setProperty('--visible-height', `${viewport?.height ?? window.innerHeight}px`);
      style.setProperty('--visible-top', `${viewport?.offsetTop ?? 0}px`);
    };
    syncViewport(); viewport?.addEventListener('resize', syncViewport); viewport?.addEventListener('scroll', syncViewport);
    const orientation = window.matchMedia('(orientation: portrait)');
    orientation.addEventListener('change', blur);
    const visibility = () => { if (document.hidden) blur(); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur); document.addEventListener('visibilitychange', visibility);
    return () => { disposed = true; cancelAnimationFrame(frame); world.current?.dispose(); world.current = null; engine.current = null;
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility);
      orientation.removeEventListener('change', blur);
      viewport?.removeEventListener('resize', syncViewport); viewport?.removeEventListener('scroll', syncViewport);
      document.documentElement.style.removeProperty('--visible-height'); document.documentElement.style.removeProperty('--visible-top');
      unregisterTools(); audio.current?.dispose(); audio.current = null;
    };
  }, []);

  const releaseTouch = (event: React.PointerEvent<HTMLButtonElement>) => {
    input.current.release(`pointer:${event.pointerId}`); setTouchPressed({ ...input.current.controls });
  };
  const pressTouch = (event: React.PointerEvent<HTMLButtonElement>) => {
    const control = event.currentTarget.dataset.control;
    if (control !== 'left' && control !== 'right' && control !== 'jump') return;
    if (engine.current?.status !== 'playing' || event.button !== 0) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    input.current.press(`pointer:${event.pointerId}`, control); setTouchPressed({ ...input.current.controls });
  };
  const moveTouch = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.dataset.control === 'jump' || !input.current.has(`pointer:${event.pointerId}`)) return;
    const pad = event.currentTarget.parentElement!.getBoundingClientRect();
    input.current.press(`pointer:${event.pointerId}`, event.clientX < pad.left + pad.width / 2 ? 'left' : 'right');
    setTouchPressed({ ...input.current.controls });
  };
  const touchEvents = {
    onPointerDown: pressTouch, onPointerMove: moveTouch,
    onPointerUp: releaseTouch, onPointerCancel: releaseTouch, onLostPointerCapture: releaseTouch,
    onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
  };
  const active = game.status === 'playing' || game.status === 'paused';
  const zone = game.floor >= 75 ? 'THE AURORA' : game.floor >= 50 ? 'CRYSTAL SPIRE' : game.floor >= 25 ? 'THE FROZEN BELFRY' : 'THE FORGOTTEN HALL';

  return <main className={`game-shell state-${game.status}`}>
    <canvas className="world-canvas" ref={canvas} tabIndex={0} aria-label="Icy Tower game. Use the on-screen left, right and jump buttons, or A/D and Space. Pause with the top button or Escape." />
    <div className="screen-vignette" />
    <header className="topbar"><div className="brand"><Snowflake size={23} strokeWidth={1.4} /><span>ICY TOWER<small>F R O S T B O U N D</small></span></div><div className="topbar-right"><span className="edition"><i /> {active ? `${MODE_LABELS[game.mode].toUpperCase()} · ${zone}` : 'AN ENDLESS ASCENT'}</span>{active && <Button variant="ghost" size="icon" className="utility" onClick={pause} aria-label={game.status === 'paused' ? 'Resume game' : 'Pause game'}>{game.status === 'paused' ? <Play /> : <Pause />}</Button>}<Button variant="ghost" size="icon" className="utility outfit-utility" onClick={openWardrobe} aria-label="Open outfits"><Shirt /></Button><Button variant="ghost" size="icon" className="utility" onClick={openLeaderboard} aria-label="Open leaderboard"><Trophy /></Button><Button variant="ghost" size="icon" className="utility" onClick={() => { soundRef.current = !sound; setSound(!sound); audio.current?.setEnabled(!sound); if (!sound) tone('gem'); }} aria-label={sound ? 'Mute audio' : 'Enable audio'} aria-pressed={sound}>{sound ? <Volume2 /> : <VolumeX />}</Button><Button variant="ghost" size="icon" className="utility fullscreen" aria-label="Toggle fullscreen" onClick={() => { const request = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.(); void request?.catch(() => { setToast('Fullscreen is unavailable in this view.'); setTimeout(() => setToast(''), 3500); }); }}><Maximize2 /></Button></div></header>
    {game.status === 'ready' && <>
      <section className="title-screen"><div className="eyebrow"><span /> REACH FOR THE IMPOSSIBLE</div><h1>ICY<br /><span>TOWER</span></h1><div className="subtitle"><i /> F R O S T B O U N D <i /></div><p>One more jump.<br />A little closer to the sky.</p><Button className="start-button" onClick={() => begin()} disabled={!ready || !!error}><Play size={17} fill="currentColor" />{ready ? 'BEGIN THE ASCENT' : 'ENTERING THE TOWER…'}<ArrowRight size={19} /></Button><span className="enter-hint">{mode === 'party' ? 'Springs · low gravity · crystal double jumps · ' : ''}or press <kbd>ENTER</kbd></span><span className="touch-hint">{mode === 'party' ? 'Springs · low gravity · crystals grant double jumps' : 'Hold a direction · tap jump with your other thumb'}</span><div className="menu-actions"><Button variant="ghost" onClick={() => setHelp(true)}>How to play <ChevronRight size={13} /></Button><span /><label className="mode-picker" htmlFor="game-mode">Mode<NativeSelect id="game-mode" aria-label="Game mode" value={mode} onChange={event => { const next = event.target.value as GameMode; setMode(next); if (engine.current) { engine.current.start(next); engine.current.status = 'ready'; setGame(engine.current.snapshot()); } }}><NativeSelectOption value="arcade">Classic</NativeSelectOption><NativeSelectOption value="party">Party</NativeSelectOption><NativeSelectOption value="practice">Practice</NativeSelectOption></NativeSelect></label></div><div className="collection-menu"><Button variant="ghost" className="leaderboard-menu-button" onClick={openWardrobe}><Shirt size={16} /> Outfits</Button><Button variant="ghost" className="leaderboard-menu-button" onClick={openLeaderboard}><Trophy size={16} /> Leaderboard <ChevronRight size={14} /></Button></div><div className="personal-best"><Flag size={13} /><span>{MODE_LABELS[mode].toUpperCase()} BEST</span><strong>{best.floor.toString().padStart(3, '0')} <small>FLOORS</small></strong></div></section>
      <aside className="location-caption"><span>01 — THE FORGOTTEN HALL</span><h2>The only way<br />is up.</h2><div><i /> {mode === 'party' ? 'SPRINGS · LOW GRAVITY · DOUBLE JUMPS' : mode === 'arcade' ? 'OUTRUN THE RISING FROST' : 'CLIMB AT YOUR OWN PACE'}</div></aside>
    </>}
    {active && <><section className="score-hud"><span className="eyebrow">FLOOR</span><strong>{game.floor.toString().padStart(3, '0')}</strong><div className="score-number">{game.score.toLocaleString()} <small>PTS</small></div><div className="height-readout"><ArrowUp size={13} /> {game.height} m <span>·</span> {formatTime(game.time)}</div><div className="gem-count"><Diamond size={13} /> {game.gems}</div>{game.mode === 'party' && <div className="party-hud"><strong>PARTY · LOW GRAVITY</strong><span>{game.doubleJumpTime > 0 ? `DOUBLE JUMP · ${Math.ceil(game.doubleJumpTime)}s` : 'CRYSTALS GRANT DOUBLE JUMPS'}</span>{game.doubleJumpTime > 0 && <small>{game.doubleJumpReady ? 'PRESS JUMP AGAIN IN MIDAIR' : 'LAND TO RECHARGE'}</small>}<small>Pink springs launch you higher</small></div>}</section><div className={`combo-hud ${game.combo >= 3 ? 'visible' : ''}`}><span>{game.combo >= 15 ? 'UNSTOPPABLE' : game.combo >= 8 ? 'ON FIRE' : 'KEEP IT GOING'}</span><strong>{game.combo}<small>COMBO</small></strong><div className="combo-track"><i style={{ transform: `scaleX(${game.comboTime / 3.8})` }} /></div></div><div className="speed-meter"><span>MOMENTUM</span><div>{Array.from({ length: 12 }, (_, i) => <i key={i} className={game.speed / 8.4 * 12 > i ? 'filled' : ''} />)}</div><small>{game.speed > 6 ? 'SUPER JUMP READY' : 'BUILD SPEED TO JUMP HIGHER'}</small></div>{game.stormDistance < 4 && game.status === 'playing' && <div className="storm-warning"><ArrowUp size={15} /> THE FROST IS CATCHING UP</div>}{game.status === 'playing' && <fieldset className="touch-controls" aria-label="Touch game controls"><fieldset className="touch-move" aria-label="Movement"><Button aria-label="Move left" aria-pressed={touchPressed.left} data-control="left" {...touchEvents}><ArrowLeft /></Button><Button aria-label="Move right" aria-pressed={touchPressed.right} data-control="right" {...touchEvents}><ArrowRight /></Button></fieldset><Button className="touch-jump" aria-label="Jump" aria-pressed={touchPressed.jump} data-control="jump" {...touchEvents}><ArrowUp /><span>JUMP</span></Button></fieldset>}</>}
    {(game.status === 'paused' || game.status === 'over') && <div className="overlay"><section className="result-card"><Snowflake className="result-mark" size={35} strokeWidth={1} /><span className="eyebrow">{game.status === 'paused' ? 'A MOMENT IN THE QUIET' : 'THE TOWER WILL WAIT'}</span><h2>{game.status === 'paused' ? 'Catch your breath.' : 'One more climb?'}</h2><p>{game.status === 'paused' ? 'Your ascent is right where you left it.' : `${MODE_LABELS[game.mode]} mode · ${game.mode === 'practice' ? 'Unranked climb' : 'Separate ' + MODE_LABELS[game.mode].toLowerCase() + ' rankings'}`}</p><div className="result-stats"><div><small>FLOOR</small><strong>{game.floor.toString().padStart(3, '0')}</strong></div><div><small>SCORE</small><strong>{game.score.toLocaleString()}</strong></div><div><small>BEST COMBO</small><strong>{game.bestCombo}<em>×</em></strong></div></div><Button className="start-button" onClick={() => game.status === 'paused' ? pause() : begin()}>{game.status === 'paused' ? <Play size={16} /> : <RotateCcw size={16} />}{game.status === 'paused' ? 'CONTINUE ASCENT' : 'CLIMB AGAIN'}<ArrowRight size={18} /></Button>{game.status === 'over' && <Button className="leaderboard-result-button" variant="outline" onClick={openLeaderboard}><Trophy size={16} />{game.mode !== 'practice' && game.floor > 0 ? 'Submit score & leaderboard' : 'View leaderboard'}</Button>}<Button className="back-menu" variant="ghost" onClick={openWardrobe}><Shirt size={14} /> Outfits</Button><Button className="back-menu" variant="ghost" onClick={menu}>Return to the tower</Button></section></div>}
    <Dialog open={help} onOpenChange={setHelp}><DialogContent className="result-card help-card"><span className="eyebrow">THE ART OF THE ASCENT</span><DialogTitle>Find your rhythm.</DialogTitle><DialogDescription className="sr-only">Controls and rules for climbing the tower.</DialogDescription><div className="instruction"><span><kbd>A</kbd><kbd>D</kbd></span><div><strong>Move with momentum</strong><p>Hold the left or right touch button, or use A / D or the arrow keys. Slide across the direction pad to turn. Ice is slippery — steer early.</p></div></div><div className="instruction"><kbd>SPACE</kbd><div><strong>Jump. Land. Repeat.</strong><p>Tap JUMP with your other thumb while holding a direction. Release and tap again for the next jump. On a keyboard, use Space, W or ↑. Build speed for higher jumps and star-shaped spins.</p></div></div><div className="instruction"><Diamond size={25} /><div><strong>Keep your chain alive</strong><p>Land on higher floors within 3.8 seconds. Keep a combo going to leave a colorful star trail. Collect crystals and skip floors to raise your score.</p></div></div><div className="instruction"><ArrowUp size={25} /><div><strong>Stay above the frost</strong><p>The steps start scrolling down at floor 5 and speed up every 30 seconds. The camera follows your falls so you can recover, but stay above the frost. Practice mode removes automatic scrolling.</p></div></div><div className="instruction"><Diamond size={25} /><div><strong>Party mode</strong><p>Float in low gravity. Pink spring platforms launch you automatically. Collect a pink crystal for 8 seconds of double jumps: press jump again in midair, once per landing. Party has its own rankings and personal best.</p></div></div><Button className="start-button" onClick={() => begin()}>LET’S CLIMB <ArrowRight size={18} /></Button></DialogContent></Dialog>
    {leaderboardOpen && <LeaderboardDialog open={leaderboardOpen} onOpenChange={setLeaderboardOpen} run={submissionRun} outfit={profile.equipped} initialMode={mode === 'party' ? 'party' : 'arcade'} />}
    <WardrobeDialog open={wardrobeOpen} onOpenChange={setWardrobeOpen} profile={profile} onEquip={equip} storageAvailable={storageAvailable} />
    {unlockNotice && <output className="toast unlock-toast" aria-live="polite"><Shirt size={18} /><span>{unlockNotice}</span></output>}
    {error && <div className="error-message" role="alert">{error}<Button onClick={() => location.reload()}>Reload game</Button></div>}
    {toast && <output className="toast">{toast}</output>}
    <footer className="bottom-bar"><div className="controls-legend"><span><kbd>←</kbd><kbd>→</kbd> MOVE</span><span><kbd>SPACE</kbd> JUMP</span><span><kbd>ESC</kbd> PAUSE</span></div><span className="sound-note"><AudioLines size={14} /> BEST WITH HEADPHONES</span><Button className="quality-control" variant="ghost" onClick={() => { setQuality(!quality); world.current?.setQuality(!quality); }}><i /> {quality ? 'HIGH' : 'PERFORMANCE'} <span>QUALITY</span></Button></footer>
  </main>;
}
