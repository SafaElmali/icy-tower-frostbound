'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUp, AudioLines, ChevronRight, Diamond, Flag, Maximize2, Pause, Play, RotateCcw, Snowflake, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { TowerAudio } from '@/lib/tower-audio';
import { registerGameTools } from '@/lib/game-tools';
import { TowerEngine, freshControls, type Controls, type GameMode, type Snapshot } from '@/lib/tower-engine';
import type { TowerWorld } from '@/lib/tower-world';

const initial = new TowerEngine().snapshot();
const formatTime = (t: number) => `${Math.floor(t / 60).toString().padStart(2, '0')}:${Math.floor(t % 60).toString().padStart(2, '0')}`;

export default function Home() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<TowerEngine | null>(null);
  const world = useRef<TowerWorld | null>(null);
  const input = useRef<Controls>(freshControls());
  const [game, setGame] = useState<Snapshot>(initial);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<GameMode>('arcade');
  const [sound, setSound] = useState(true);
  const [quality, setQuality] = useState(true);
  const [help, setHelp] = useState(false);
  const [best, setBest] = useState({ floor: 0, score: 0 });
  const [toast, setToast] = useState('');
  const bestRef = useRef(best);
  const soundRef = useRef(true);
  const audio = useRef<TowerAudio | null>(null);

  function tone(type: string) {
    if (!soundRef.current) return;
    audio.current ??= new TowerAudio(); audio.current.play(type);
  }
  function begin(selectedMode = mode) {
    if (!engine.current || !ready) return;
    input.current = freshControls(); engine.current.start(selectedMode, Math.floor(Math.random() * 2 ** 30));
    audio.current?.setPaused(false); setGame(engine.current.snapshot()); setHelp(false); tone('jump'); canvas.current?.focus({ preventScroll: true });
  }
  function pause() {
    const e = engine.current; if (!e) return;
    input.current = freshControls(); e.togglePause(); audio.current?.setPaused(e.status === 'paused'); setGame(e.snapshot());
    if (e.status === 'playing') canvas.current?.focus({ preventScroll: true });
  }
  function menu() { engine.current?.menu(); input.current = freshControls(); if (engine.current) setGame(engine.current.snapshot()); }

  useEffect(() => {
    let disposed = false, frame = 0, last = 0, sync = 0;
    let unregisterTools = () => {};
    const e = new TowerEngine(); engine.current = e;
    try { const stored = JSON.parse(localStorage.getItem('frostbound-best') || '{}');
      if (Number.isFinite(stored.floor) && Number.isFinite(stored.score)) { bestRef.current = stored; }
    } catch { /* A run works without browser storage. */ }
    import('@/lib/tower-world').then(async ({ TowerWorld }) => {
      if (disposed || !canvas.current) return;
      try {
        const w = new TowerWorld(canvas.current); world.current = w;
        await w.load(); if (disposed) { w.dispose(); return; }
        setReady(true); setBest(bestRef.current);
        unregisterTools = registerGameTools(e, { start: selected => { input.current = freshControls(); e.start(selected, Math.floor(Math.random()*2**30)); setMode(selected); setHelp(false); setGame(e.snapshot()); canvas.current?.focus(); }, pause: () => { input.current = freshControls(); e.togglePause(); setGame(e.snapshot()); } });
        const animate = (now: number) => {
          const dt = Math.min((now - (last || now)) / 1000, .1); last = now;
          e.tick(dt, input.current);
          const events = e.drainEvents();
          for (const event of events) {
            w.effect(event, e.time); tone(event.type);
            if (event.type === 'over') {
              const record = { floor: Math.max(bestRef.current.floor, e.floor), score: Math.max(bestRef.current.score, e.score) };
              bestRef.current = record; setBest(record);
              try { localStorage.setItem('frostbound-best', JSON.stringify(record)); } catch { /* Optional local record. */ }
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
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const editable = event.target instanceof HTMLElement && event.target.closest('input, select, textarea, [role="dialog"]');
      if (editable) return;
      const button = event.target instanceof HTMLElement && event.target.closest('button');
      const active = e.status === 'playing';
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space'].includes(event.code) && (active || !button)) event.preventDefault();
      if (event.code === 'KeyA' || event.code === 'ArrowLeft') input.current.left = down;
      if (event.code === 'KeyD' || event.code === 'ArrowRight') input.current.right = down;
      if (['Space', 'ArrowUp', 'KeyW'].includes(event.code) && (active || !button)) input.current.jump = down;
      if (!down || event.repeat) return;
      if (event.code === 'Escape' || event.code === 'KeyP') {
        input.current = freshControls(); e.togglePause(); audio.current?.setPaused(e.status === 'paused'); setGame(e.snapshot());
      }
      if (event.code === 'Enter' && !button && world.current) {
        if (e.status === 'paused') e.togglePause();
        else if (e.status !== 'playing') { e.start(e.mode, Math.floor(Math.random() * 2 ** 30)); input.current = freshControls(); tone('jump'); }
        setGame(e.snapshot());
      }
    };
    const down = (event: KeyboardEvent) => key(event, true), up = (event: KeyboardEvent) => key(event, false);
    const blur = () => { input.current = freshControls(); if (e.status === 'playing') { e.togglePause(); audio.current?.setPaused(true); setGame(e.snapshot()); } };
    const visibility = () => { if (document.hidden) blur(); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur); document.addEventListener('visibilitychange', visibility);
    return () => { disposed = true; cancelAnimationFrame(frame); world.current?.dispose(); world.current = null; engine.current = null;
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility);
      unregisterTools(); audio.current?.dispose(); audio.current = null;
    };
  }, []);

  const touch = (control: keyof Controls) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); input.current[control] = true; },
    onPointerUp: () => { input.current[control] = false; }, onPointerCancel: () => { input.current[control] = false; }, onLostPointerCapture: () => { input.current[control] = false; },
  });
  const active = game.status === 'playing' || game.status === 'paused';
  const zone = game.floor >= 75 ? 'THE AURORA' : game.floor >= 50 ? 'CRYSTAL SPIRE' : game.floor >= 25 ? 'THE FROZEN BELFRY' : 'THE FORGOTTEN HALL';

  return <main className={`game-shell state-${game.status}`}>
    <div className="cathedral-backdrop" />
    <canvas className="world-canvas" ref={canvas} tabIndex={0} aria-label="Icy Tower game. A and D or arrows to move, Space to jump, Escape to pause." />
    <div className="screen-vignette" />
    <header className="topbar"><div className="brand"><Snowflake size={23} strokeWidth={1.4} /><span>ICY TOWER<small>F R O S T B O U N D</small></span></div><div className="topbar-right"><span className="edition"><i /> {active ? zone : 'AN ENDLESS ASCENT'}</span>{active && <Button variant="ghost" size="icon" className="utility" onClick={pause} aria-label={game.status === 'paused' ? 'Resume game' : 'Pause game'}>{game.status === 'paused' ? <Play /> : <Pause />}</Button>}<Button variant="ghost" size="icon" className="utility" onClick={() => { soundRef.current = !sound; setSound(!sound); audio.current?.setEnabled(!sound); if (!sound) tone('gem'); }} aria-label={sound ? 'Mute audio' : 'Enable audio'} aria-pressed={sound}>{sound ? <Volume2 /> : <VolumeX />}</Button><Button variant="ghost" size="icon" className="utility fullscreen" aria-label="Toggle fullscreen" onClick={() => { const request = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.(); void request?.catch(() => { setToast('Fullscreen is unavailable in this view.'); setTimeout(() => setToast(''), 3500); }); }}><Maximize2 /></Button></div></header>
    {game.status === 'ready' && <>
      <section className="title-screen"><div className="eyebrow"><span /> REACH FOR THE IMPOSSIBLE</div><h1>ICY<br /><span>TOWER</span></h1><div className="subtitle"><i /> F R O S T B O U N D <i /></div><p>One more jump.<br />A little closer to the sky.</p><Button className="start-button" onClick={() => begin()} disabled={!ready || !!error}><Play size={17} fill="currentColor" />{ready ? 'BEGIN THE ASCENT' : 'ENTERING THE TOWER…'}<ArrowRight size={19} /></Button><span className="enter-hint">or press <kbd>ENTER</kbd></span><div className="menu-actions"><Button variant="ghost" onClick={() => setHelp(true)}>How to play <ChevronRight size={13} /></Button><span /><Button variant="ghost" onClick={() => { const next = mode === 'arcade' ? 'practice' : 'arcade'; setMode(next); if (engine.current) engine.current.mode = next; }}>{mode === 'arcade' ? 'Arcade mode' : 'Practice mode'} <ChevronRight size={13} /></Button></div><div className="personal-best"><Flag size={13} /><span>PERSONAL BEST</span><strong>{best.floor.toString().padStart(3, '0')} <small>FLOORS</small></strong></div></section>
      <aside className="location-caption"><span>01 — THE FORGOTTEN HALL</span><h2>The only way<br />is up.</h2><div><i /> {mode === 'arcade' ? 'OUTRUN THE RISING FROST' : 'CLIMB AT YOUR OWN PACE'}</div></aside>
    </>}
    {active && <><section className="score-hud"><span className="eyebrow">FLOOR</span><strong>{game.floor.toString().padStart(3, '0')}</strong><div className="score-number">{game.score.toLocaleString()} <small>PTS</small></div><div className="height-readout"><ArrowUp size={13} /> {game.height} m <span>·</span> {formatTime(game.time)}</div><div className="gem-count"><Diamond size={13} /> {game.gems}</div></section><div className={`combo-hud ${game.combo >= 3 ? 'visible' : ''}`}><span>{game.combo >= 15 ? 'UNSTOPPABLE' : game.combo >= 8 ? 'ON FIRE' : 'KEEP IT GOING'}</span><strong>{game.combo}<small>COMBO</small></strong><div className="combo-track"><i style={{ transform: `scaleX(${game.comboTime / 3.8})` }} /></div></div><div className="speed-meter"><span>MOMENTUM</span><div>{Array.from({ length: 12 }, (_, i) => <i key={i} className={game.speed / 8.4 * 12 > i ? 'filled' : ''} />)}</div><small>{game.speed > 6 ? 'SUPER JUMP READY' : 'BUILD SPEED TO JUMP HIGHER'}</small></div>{game.stormDistance < 4 && game.status === 'playing' && <div className="storm-warning"><ArrowUp size={15} /> THE FROST IS CATCHING UP</div>}<div className="touch-controls"><div><Button aria-label="Move left" {...touch('left')}><ArrowLeft /></Button><Button aria-label="Move right" {...touch('right')}><ArrowRight /></Button></div><Button className="touch-jump" aria-label="Jump" {...touch('jump')}><ArrowUp /> JUMP</Button></div></>}
    {(game.status === 'paused' || game.status === 'over') && <div className="overlay"><section className="result-card"><Snowflake className="result-mark" size={35} strokeWidth={1} /><span className="eyebrow">{game.status === 'paused' ? 'A MOMENT IN THE QUIET' : 'THE TOWER WILL WAIT'}</span><h2>{game.status === 'paused' ? 'Catch your breath.' : 'One more climb?'}</h2><p>{game.status === 'paused' ? 'Your ascent is right where you left it.' : 'Every fall is the start of a better run.'}</p><div className="result-stats"><div><small>FLOOR</small><strong>{game.floor.toString().padStart(3, '0')}</strong></div><div><small>SCORE</small><strong>{game.score.toLocaleString()}</strong></div><div><small>BEST COMBO</small><strong>{game.bestCombo}<em>×</em></strong></div></div><Button className="start-button" onClick={() => game.status === 'paused' ? pause() : begin()}>{game.status === 'paused' ? <Play size={16} /> : <RotateCcw size={16} />}{game.status === 'paused' ? 'CONTINUE ASCENT' : 'CLIMB AGAIN'}<ArrowRight size={18} /></Button><Button className="back-menu" variant="ghost" onClick={menu}>Return to the tower</Button></section></div>}
    <Dialog open={help} onOpenChange={setHelp}><DialogContent className="result-card help-card"><span className="eyebrow">THE ART OF THE ASCENT</span><DialogTitle>Find your rhythm.</DialogTitle><DialogDescription className="sr-only">Controls and rules for climbing the tower.</DialogDescription><div className="instruction"><span><kbd>A</kbd><kbd>D</kbd></span><div><strong>Move with momentum</strong><p>Use A / D or the arrow keys. Ice is slippery — steer early.</p></div></div><div className="instruction"><kbd>SPACE</kbd><div><strong>Jump. Land. Repeat.</strong><p>Press Space, W or ↑ to jump. Build speed for a higher jump and a full somersault.</p></div></div><div className="instruction"><Diamond size={25} /><div><strong>Keep your chain alive</strong><p>Land on higher floors within 3.8 seconds. Collect crystals and skip floors to raise your score.</p></div></div><div className="instruction"><ArrowUp size={25} /><div><strong>Stay above the frost</strong><p>The steps start scrolling down at floor 5 and speed up every 30 seconds. The camera follows your falls so you can recover, but stay above the frost. Practice mode removes automatic scrolling.</p></div></div><Button className="start-button" onClick={() => begin()}>LET’S CLIMB <ArrowRight size={18} /></Button></DialogContent></Dialog>
    {error && <div className="error-message" role="alert">{error}<Button onClick={() => location.reload()}>Reload game</Button></div>}
    {toast && <output className="toast">{toast}</output>}
    <footer className="bottom-bar"><div className="controls-legend"><span><kbd>←</kbd><kbd>→</kbd> MOVE</span><span><kbd>SPACE</kbd> JUMP</span><span><kbd>ESC</kbd> PAUSE</span></div><span className="sound-note"><AudioLines size={14} /> BEST WITH HEADPHONES</span><Button className="quality-control" variant="ghost" onClick={() => { setQuality(!quality); world.current?.setQuality(!quality); }}><i /> {quality ? 'HIGH' : 'PERFORMANCE'} <span>QUALITY</span></Button></footer>
  </main>;
}
