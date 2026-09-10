'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LoaderCircle, RefreshCw, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { LeaderboardEntry } from '@/lib/leaderboard';
import type { RunReplay } from '@/lib/tower-engine';

import { OutfitBadges } from '@/components/wardrobe';
import type { Outfit } from '@/lib/outfits';

const ENDPOINT = '/.netlify/functions/leaderboard';

export function LeaderboardDialog({ open, onOpenChange, run, outfit }: { open: boolean; onOpenChange: (open: boolean) => void; run: RunReplay | null; outfit: Outfit }) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [name, setName] = useState(() => { try { return typeof window === 'undefined' ? '' : localStorage.getItem('frostbound-player-name') ?? ''; } catch { return ''; } });
  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitted, setSubmitted] = useState<{ id: string; rank: number | null } | null>(null);
  const request = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(ENDPOINT, { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error('The leaderboard is unavailable. Please try again.');
      const data = await response.json() as { entries: LeaderboardEntry[]; error?: string; id: string; rank: number | null };
      if (!Array.isArray(data.entries)) throw new Error('The leaderboard is unavailable. Please try again.');
      if (request.current === controller) setEntries(data.entries);
    } catch {
      if (request.current === controller) setLoadError('Could not load the leaderboard. Check your connection and try again.');
    } finally { clearTimeout(timeout); if (request.current === controller) setLoading(false); }
  }, []);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { if (open && active) void load(); });
    return () => { active = false; const previous = request.current; request.current = null; previous?.abort(); };
  }, [open, run, load]);

  function refresh() { setLoading(true); setLoadError(''); void load(); }

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault(); if (!run || sending) return;
    const previous = request.current; request.current = null; previous?.abort(); setLoading(false);
    setSending(true); setSubmitError('');
    try {
      const response = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, replay: run, outfit }), signal: AbortSignal.timeout(20000) });
      const data = await response.json() as { entries: LeaderboardEntry[]; error?: string; id: string; rank: number | null };
      if (!response.ok) throw new Error(data.error || 'Could not submit your score. Please try again.');
      setEntries(data.entries); setLoadError(''); setSubmitted({ id: data.id, rank: data.rank });
      try { localStorage.setItem('frostbound-player-name', name.trim()); } catch { /* Optional remembered name. */ }
    } catch (error) { setSubmitError(error instanceof Error && error.name !== 'TimeoutError' ? error.message : 'The connection timed out. Your run is still here; try submitting again.'); }
    finally { setSending(false); }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="leaderboard-card">
    <div className="leaderboard-heading"><Trophy size={28} strokeWidth={1.4} /><div><DialogTitle>Hall of climbers</DialogTitle><DialogDescription>The top 50 arcade runs, ranked by score.</DialogDescription></div></div>
    {run && !submitted && <form className="score-submission" onSubmit={submit}>
      <label htmlFor="leaderboard-name">Put your name on the tower <OutfitBadges outfit={outfit} /></label>
      <div><Input id="leaderboard-name" aria-describedby="score-name-note" value={name} onChange={event => setName(event.target.value)} minLength={2} maxLength={20} autoComplete="nickname" placeholder="Your name" required disabled={sending} /><Button type="submit" disabled={sending || name.trim().length < 2}>{sending ? <><LoaderCircle className="spin" size={16} /> Checking run…</> : 'Submit score'}</Button></div>
      <p id="score-name-note">Your name and score will be public. Arcade runs up to 30 minutes qualify.</p>
      {submitError && <p className="leaderboard-error" role="alert">{submitError}</p>}
    </form>}
    {submitted && <output className="leaderboard-success">{submitted.rank ? `You placed #${submitted.rank}! Your run is on the board.` : 'Run checked! You haven’t reached the top 50 yet. Keep climbing.'}</output>}
    <div className="leaderboard-toolbar"><span>ALL-TIME · ARCADE</span><Button variant="ghost" size="sm" onClick={refresh} disabled={loading || sending} aria-label="Refresh leaderboard"><RefreshCw size={15} className={loading ? 'spin' : ''} /> Refresh</Button></div>
    {loading && !entries.length ? <output className="leaderboard-empty">Loading the climbers…</output> : loadError ? <div className="leaderboard-empty" role="alert"><p>{loadError}</p><Button variant="outline" onClick={refresh}>Try again</Button></div> : !entries.length ? <div className="leaderboard-empty"><Trophy size={32} /><strong>The tower is waiting.</strong><p>Finish an arcade run and submit the first score.</p></div> : <div className="leaderboard-scroll"><Table aria-label="All-time arcade leaderboard"><TableHeader><TableRow><TableHead className="rank-column">#</TableHead><TableHead>Climber</TableHead><TableHead className="numeric">Score</TableHead><TableHead className="numeric">Floor</TableHead><TableHead className="numeric combo-column">Combo</TableHead></TableRow></TableHeader><TableBody>{entries.map((entry, i) => <TableRow key={entry.id} className={submitted?.id === entry.id ? 'your-score' : ''}><TableCell className={`rank-column ${i < 3 ? 'podium' : ''}`}>{i + 1}</TableCell><TableCell className="climber-name">{entry.name}<OutfitBadges outfit={entry.outfit} />{submitted?.id === entry.id && <small>YOU</small>}</TableCell><TableCell className="numeric score-column">{entry.score.toLocaleString()}</TableCell><TableCell className="numeric">{entry.floor}</TableCell><TableCell className="numeric combo-column">{entry.combo}×</TableCell></TableRow>)}</TableBody></Table></div>}
    <p className="leaderboard-footnote">Practice runs don’t count. Ties favor the higher floor, then the faster run.</p>
  </DialogContent></Dialog>;
}
