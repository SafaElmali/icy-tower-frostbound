'use client';

import { useState } from 'react';
import { Activity, ArrowLeft, ArrowRight, ArrowUp, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { JevDebugRecord, JevLiveState } from '@/lib/jev-debug';
import styles from './jev-inspector.module.css';

const percent = (n: number | null | undefined) =>
  n == null ? '—' : `${Math.round(n * 100)}%`;
const ms = (n: number | null | undefined) =>
  n == null ? '—' : `${Math.round(n)} ms`;
const chosenPlan = (record: JevDebugRecord) =>
  record.state.plans.find((plan) => plan.id === record.decision?.action);

export function JevInspector({
  records,
  live,
  message,
  paused,
  canPause,
  onPause,
  onStop,
}: {
  records: JevDebugRecord[];
  live: JevLiveState | null;
  message: string;
  paused: boolean;
  canPause: boolean;
  onPause: () => void;
  onStop: () => void;
}) {
  const [pinned, setPinned] = useState<JevDebugRecord | null>(null);
  const pinnedUpdate = pinned ? records.find((r) => r.id === pinned.id) : null;
  // Keep the final outcome available even after a selected entry ages out of the feed.
  if (pinnedUpdate && pinnedUpdate !== pinned) setPinned(pinnedUpdate);
  const latest = records.at(-1);
  const answered = records.findLast((r) => r.decision);
  // Retain the last answer while the next request is pending, so bars don't flash away.
  const record = pinned ? (pinnedUpdate ?? pinned) : (answered ?? latest);
  const selected = record && chosenPlan(record);
  const currentControls = paused ? null : live?.controls;
  function exportTrace() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify({ version: 1, records }, null, 2)], {
        type: 'application/json',
      }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'jev-inspector-trace.json';
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <aside
      className={styles.inspector}
      data-jev-inspector
      aria-label="Jev live inspector"
    >
      <header className={styles.header}>
        <div className={styles.identity}>
          <div className={styles.icon}>
            <Activity size={23} strokeWidth={1.5} />
          </div>
          <div>
            <h2>
              Jev <span>is climbing</span>
            </h2>
            <p>AI PLAYER · UNRANKED</p>
          </div>
          <span className={styles.liveBadge} data-paused={paused}>
            <i />
            {paused ? 'Paused' : 'Live'}
          </span>
        </div>
        <div className={styles.modelLine}>
          <span>{answered?.decision?.model ?? 'Connecting to Jev'}</span>
          <span>{ms(answered?.responseMs)}</span>
        </div>
      </header>
      <section className={styles.controller} aria-label="Live game controls">
        <div className={styles.sectionTitle}>
          <h3>Controls now</h3>
          <span>{paused ? 'Paused' : (live?.phase ?? 'Waiting')}</span>
        </div>
        <div className={styles.keys}>
          <div
            data-pressed={!!currentControls?.left}
            aria-label={`Left ${currentControls?.left ? 'pressed' : 'released'}`}
          >
            <ArrowLeft size={16} />
            <span>LEFT</span>
          </div>
          <div
            data-pressed={!!currentControls?.jump}
            aria-label={`Jump ${currentControls?.jump ? 'pressed' : 'released'}`}
          >
            <ArrowUp size={16} />
            <span>JUMP</span>
          </div>
          <div
            data-pressed={!!currentControls?.right}
            aria-label={`Right ${currentControls?.right ? 'pressed' : 'released'}`}
          >
            <ArrowRight size={16} />
            <span>RIGHT</span>
          </div>
        </div>
        <p className={styles.motion}>
          <span>
            {live?.targetFloor != null
              ? `Executing → floor ${live.targetFloor}`
              : 'Waiting for a route'}
          </span>
          <span>
            {live ? `x ${live.x.toFixed(1)} · y ${live.y.toFixed(1)}` : '—'}
          </span>
        </p>
      </section>
      <div className={styles.body}>
        <section aria-label="Jev decision">
          <div className={styles.sectionTitle}>
            <h3>{pinned ? 'Inspecting history' : 'Latest decision'}</h3>
            {pinned ? (
              <button className={styles.follow} onClick={() => setPinned(null)}>
                <Radio size={12} /> Back to live
              </button>
            ) : (
              <span>#{record?.id.toString().padStart(3, '0') ?? '000'}</span>
            )}
          </div>
          <div className={styles.decisionHeading}>
            <h4>
              {selected ? `Floor ${selected.targetFloor}` : 'Choosing a route…'}
            </h4>
            {selected && (
              <span>
                {selected.direction} · {selected.kind}
              </span>
            )}
          </div>
          {record && (
            <p className={styles.outcome} data-status={record.status}>
              {record.detail}
            </p>
          )}
          <dl className={styles.metrics}>
            <div>
              <dt>Confidence</dt>
              <dd>{percent(record?.decision?.confidence)}</dd>
            </div>
            <div>
              <dt>API latency</dt>
              <dd>{ms(record?.responseMs)}</dd>
            </div>
            <div>
              <dt>Planning</dt>
              <dd>{ms(record?.planningMs)}</dd>
            </div>
          </dl>
          <div className={styles.sectionTitle}>
            <h3>Landing probabilities</h3>
            <span>{record?.state.plans.length ?? 0} options</span>
          </div>
          <ul className={styles.plans}>
            {record?.state.plans.map((plan) => {
              const chosen = plan.id === record.decision?.action;
              const probability = record.decision?.probabilities[plan.id];
              return (
                <li
                  key={plan.id}
                  className={chosen ? styles.chosen : undefined}
                >
                  <div className={styles.planTitle}>
                    <strong>
                      Floor {plan.targetFloor} <span>· {plan.direction}</span>
                    </strong>
                    <span>
                      {chosen && '✓ '}
                      {percent(probability)}
                    </span>
                  </div>
                  <meter
                    min={0}
                    max={1}
                    value={probability ?? 0}
                    aria-label={`Probability for floor ${plan.targetFloor}`}
                    aria-valuetext={
                      probability === undefined
                        ? 'Awaiting model result'
                        : percent(probability)
                    }
                  />
                  <p>
                    {plan.gain > 0 ? '+' : ''}
                    {plan.gain} floors · {plan.seconds}s · clearance{' '}
                    {plan.landingMargin}
                    {plan.hazards > 0
                      ? ` · ${plan.hazards} predicted hits`
                      : ''}
                    {plan.crumbling ? ' · Crumbling' : ''}
                    {plan.moving ? ' · Moving' : ''}
                    {plan.collectsGem ? ' · Crystal' : ''}
                  </p>
                </li>
              );
            })}
          </ul>
          {!record && (
            <p className={styles.note}>Waiting for the first decision.</p>
          )}
        </section>
        <section
          className={styles.feedSection}
          aria-label="Recent Jev decisions"
        >
          <div className={styles.sectionTitle}>
            <h3>Decision feed</h3>
            <span>Newest first</span>
          </div>
          <ol className={styles.feed}>
            {[...records]
              .reverse()
              .slice(0, 6)
              .map((r) => {
                const plan = chosenPlan(r);
                return (
                  <li key={r.id}>
                    <button
                      aria-pressed={pinned?.id === r.id}
                      onClick={() => setPinned(r)}
                    >
                      <span className={styles.number}>
                        #{r.id.toString().padStart(3, '0')}
                      </span>
                      <span>
                        {plan
                          ? `Floor ${plan.targetFloor} · ${plan.direction}`
                          : 'Choosing…'}
                      </span>
                      <span
                        className={styles.feedStatus}
                        data-status={r.status}
                      >
                        {r.status}
                      </span>
                    </button>
                  </li>
                );
              })}
          </ol>
          <label className={styles.srOnly} htmlFor="jev-decision">
            Decision to inspect
          </label>
          <select
            id="jev-decision"
            className={styles.select}
            value={pinned ? String(pinned.id) : 'live'}
            onChange={(event) =>
              setPinned(
                records.find((r) => String(r.id) === event.target.value) ??
                  null,
              )
            }
          >
            <option value="live">Live · follow latest decision</option>
            {pinned && !records.some((r) => r.id === pinned.id) && (
              <option value={pinned.id}>#{pinned.id} · saved view</option>
            )}
            {[...records].reverse().map((r) => (
              <option key={r.id} value={r.id}>
                #{r.id} · {r.status}
                {r.decision ? ` · floor ${chosenPlan(r)?.targetFloor}` : ''}
              </option>
            ))}
          </select>
        </section>
        {record && (
          <details className={styles.raw}>
            <summary>What Jev saw · decision #{record.id}</summary>
            <p className={styles.note}>
              At {record.gameTime.toFixed(2)}s ·{' '}
              {record.forecastAhead > 0
                ? `forecast ${record.forecastAhead.toFixed(2)}s ahead`
                : 'current state'}{' '}
              · standing floor {record.state.currentFloor}
            </p>
            <label>
              State sent to Jev
              <textarea
                aria-label="State sent to Jev"
                readOnly
                rows={8}
                value={JSON.stringify(record.state, null, 2)}
              />
            </label>
            <label>
              Model result
              <textarea
                aria-label="Model result"
                readOnly
                rows={6}
                value={
                  record.decision
                    ? JSON.stringify(record.decision, null, 2)
                    : 'No model result yet.'
                }
              />
            </label>
          </details>
        )}
        <p className={styles.note}>
          Jev chooses a landing; the controller executes the jump. Probabilities
          compare routes, not jump success. Jump presses flash briefly. The
          latest 30 decisions stay in memory.
        </p>
        <Button
          className={styles.export}
          variant="ghost"
          size="sm"
          onClick={exportTrace}
          disabled={!records.length}
        >
          Export trace · JSON
        </Button>
      </div>
      <footer className={styles.footer}>
        <p>
          <i data-pending={latest?.status === 'pending' && !paused} />
          {message}
        </p>
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={onPause}
            disabled={!canPause}
          >
            {paused ? 'Continue game' : 'Pause game'}
          </Button>
          <Button variant="ghost" size="sm" onClick={onStop}>
            Stop watching
          </Button>
        </div>
      </footer>
    </aside>
  );
}
