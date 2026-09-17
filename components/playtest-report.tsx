'use client';
import { useEffect, useRef, useState } from 'react';
import { trackEvent } from '@/lib/analytics';
import { createPlaytestAnalytics, type PlaytestAnalytics } from '../lib/playtest-analytics';

export function PlaytestReport({ analytics, onClose }: { analytics?: PlaytestAnalytics; onClose: () => void }) {
  const [, refresh] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const tracker = analytics ?? createPlaytestAnalytics();
  const report = tracker.getReport();
  const recordCount = report.summary.reduce((count, group) => count + group.runs, 0);
  useEffect(() => { dialog.current?.showModal(); }, []);
  function download() {
    const url = URL.createObjectURL(new Blob([tracker.exportJSON()], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'frostbound-playtest.json'; link.click();
    trackEvent('playtest_report_exported', { surface: 'solo', record_count: recordCount });
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <dialog ref={dialog} onCancel={onClose} onClose={onClose} aria-labelledby="playtest-title" style={{ margin: 'auto', padding: 20, width: 'min(680px, 94vw)', maxHeight: '85dvh', overflowY: 'auto', fontSize: 12, lineHeight: 1.6, background: '#0b1929', color: '#e5f3ff', border: '1px solid #42617c', borderRadius: 12 }}>
      <h2 id="playtest-title" style={{ fontSize: 18, marginBottom: 12 }}>Playtest measurements</h2>
      <p>This detailed report is stored on this browser only and is never uploaded automatically. When enabled, anonymous gameplay events are sent to PostHog separately. Export voluntarily for a playtest; this report describes one browser, not population retention.</p>
      {!report.persistent && <p>Storage is unavailable. Measurements last for this page visit only.</p>}
      {report.discardedRuns > 0 && <p>Showing the latest 300 runs. {report.discardedRuns} older runs were discarded; replay measurements describe this retained window.</p>}
      {report.summary.length === 0 ? <p>Start a climb to record a run.</p> : report.summary.map(group => <div key={`${group.device}/${group.mode}/${group.featureVersion}`} style={{ marginTop: 12 }}>
        <strong>{group.device} · {group.mode} · {group.featureVersion}</strong>
        <p>{group.runs} starts · {group.finishedRuns} finishes · {group.abandonedRuns} abandoned · second run in {group.replaySessions}/{group.sessions} sessions ({Math.round(group.replayRate * 100)}%)</p>
        <p>A skill goal completed in {group.goalCompletingRuns}/{group.runs} runs ({Math.round(group.goalCompletionRate * 100)}%) · next-day return: {group.nextDayReturn}</p>
      </div>)}
      <p>A session ends after 30 minutes without a run start, finish, or goal completion. Next-day return means a run on the UTC day after the first run in that group; a missing return stays pending until that day ends.</p>
      <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
        <button type="button" onClick={download} style={{ textDecoration: 'underline', cursor: 'pointer' }}>Export JSON</button>
        <button type="button" onClick={() => { tracker.clear(); trackEvent('playtest_report_cleared', { surface: 'solo', record_count: recordCount }); refresh(value => value + 1); }} style={{ textDecoration: 'underline', cursor: 'pointer' }}>Clear measurements</button>
        <button type="button" onClick={onClose} style={{ textDecoration: 'underline', cursor: 'pointer' }}>Close</button>
      </div>
  </dialog>;
}
