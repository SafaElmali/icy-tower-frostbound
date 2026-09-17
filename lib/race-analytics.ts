import type { RaceView } from './race-protocol.ts';

type Event = {
  name: string;
  properties: Record<string, string | number | boolean | null>;
};

/** Local player transitions only; persisted race_finished is emitted by the server. */
export class RaceAnalyticsTransitions {
  private round: number | null = null;
  private ready: boolean | null = null;
  private results = new Set<number>();
  private starts = new Set<number>();
  private rematches = new Set<number>();
  private invitations = new Set<number>();
  private transportState: string | null = null;
  private outageAt: number | null = null;
  private retries = 0;

  receive(view: RaceView): Event[] {
    const events: Event[] = [];
    const ready =
      view.players.find((player) => player.slot === view.you)?.ready ?? false;
    if (
      this.round === view.round &&
      this.ready !== null &&
      this.ready !== ready
    ) {
      events.push({ name: 'race_ready_changed', properties: { ready } });
    }
    this.round = view.round;
    this.ready = ready;
    if (view.phase === 'finished' && !this.results.has(view.round)) {
      this.results.add(view.round);
      const result = view.players.find(
        (player) => player.slot === view.you,
      )?.result;
      events.push({
        name: 'race_results_viewed',
        properties: {
          winner: view.winner ?? 'none',
          result_reason: view.reason ?? 'unknown',
          verified_floor: result?.floor ?? null,
          result_kind: result?.kind ?? 'missing',
        },
      });
    }
    if (
      view.phase === 'waiting' &&
      view.players.length === 1 &&
      !this.invitations.has(view.round)
    ) {
      this.invitations.add(view.round);
      events.push({
        name: 'share_dialog_opened',
        properties: { share_type: 'race', source: 'lobby' },
      });
    }
    return events;
  }

  started(round: number) {
    if (this.starts.has(round)) return false;
    this.starts.add(round);
    return true;
  }

  rematch(round: number) {
    if (this.rematches.has(round)) return false;
    this.rematches.add(round);
    return true;
  }

  transport(state: string) {
    if (state === this.transportState) return false;
    this.transportState = state;
    return true;
  }

  lost(now: number) {
    this.retries++;
    if (this.outageAt !== null) return false;
    this.outageAt = now;
    return true;
  }

  restored(now: number) {
    if (this.outageAt === null) return null;
    const properties = {
      outage_duration_ms: Math.round(Math.max(0, now - this.outageAt)),
      retry_count: this.retries,
    };
    this.outageAt = null;
    this.retries = 0;
    return properties;
  }
}
