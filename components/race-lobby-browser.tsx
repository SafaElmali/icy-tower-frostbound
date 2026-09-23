'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, RotateCcw, Users } from 'lucide-react';
import { listRaceLobbies } from '@/lib/race-client';
import type { RaceLobbyList } from '@/lib/race-protocol';
import { RACE_MODE_LABELS } from '@/lib/race-protocol';
import styles from './race-entry.module.css';

export function RaceLobbyBrowser({
  disabled,
  onJoin,
  onHost,
}: {
  disabled: boolean;
  onJoin: (id: string) => void;
  onHost: () => void;
}) {
  const [result, setResult] = useState<RaceLobbyList | null>(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController;
    async function load() {
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5_000);
      setLoading(true);
      try {
        const next = await listRaceLobbies(controller.signal);
        if (!disposed) {
          setResult(next);
          setError('');
        }
      } catch (cause) {
        if (!disposed)
          setError(
            cause instanceof Error && cause.name !== 'AbortError'
              ? cause.message
              : 'Lobbies could not be reached. Try refreshing.',
          );
      } finally {
        clearTimeout(timeout);
        if (!disposed) {
          setLoading(false);
          timer = setTimeout(() => void load(), 5_000);
        }
      }
    }
    void load();
    return () => {
      disposed = true;
      clearTimeout(timer);
      controller?.abort();
    };
  }, [refresh]);

  return (
    <section className={styles.browser} aria-labelledby="open-lobbies-heading">
      <header>
        <div>
          <h2 id="open-lobbies-heading">Find your rivals.</h2>
        </div>
        <button
          className={styles.refreshLobbies}
          aria-label="Refresh lobbies"
          disabled={loading || disabled}
          onClick={() => setRefresh((value) => value + 1)}
        >
          <RotateCcw size={16} />
        </button>
      </header>
      <p className={styles.browserHint}>
        Pick a room, ready up, and climb together.
      </p>
      {error ? (
        <p className={styles.browserEmpty} role="alert">
          {error}
        </p>
      ) : !result ? (
        <output className={styles.browserEmpty}>Finding open lobbies…</output>
      ) : result.lobbies.length === 0 ? (
        <div className={styles.browserEmpty}>
          <div className={styles.emptySeats} aria-hidden="true">
            <span>
              <Users size={24} />
            </span>
            <span />
            <span />
            <span />
          </div>
          <strong>Start the next race.</strong>
          <span>
            No open lobbies right now. Host a race and bring the others to you.
          </span>
          <button
            className={styles.emptyAction}
            onClick={onHost}
            disabled={disabled}
          >
            Set up a lobby <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <ul className={styles.lobbyList}>
          {result.lobbies.map((lobby) => (
            <li key={lobby.id}>
              <div className={styles.lobbySummary}>
                <strong>{lobby.hostName}’s lobby</strong>
                <span>
                  <Users size={13} /> {lobby.players}/4 climbers <i>·</i>{' '}
                  {4 - lobby.players} open
                </span>
                <small>
                  {RACE_MODE_LABELS[lobby.settings.mode]} · Floor{' '}
                  {lobby.settings.targetFloor} ·{' '}
                  {lobby.settings.durationMs / 60_000} min · Shoves{' '}
                  {lobby.settings.bumping ? 'on' : 'off'}
                </small>
              </div>
              <button
                disabled={disabled}
                onClick={() => onJoin(lobby.id)}
                aria-label={`Join ${lobby.hostName}’s lobby`}
              >
                Join <ArrowRight size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <small className={styles.browserFootnote}>
        {result?.limited
          ? 'Showing a selection of open rooms. Refresh for current availability.'
          : 'Updates every 5 seconds. No account needed.'}
      </small>
    </section>
  );
}
