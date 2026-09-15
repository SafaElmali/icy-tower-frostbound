type SampleCue = {
  files: readonly string[];
  volume: number;
  variation: number;
  /** Keep the musical part of this cue under its recorded texture. */
  layered?: boolean;
};

/** Volumes are relative to clips prepared with a shared 0.72 peak. */
export const SOUND_SAMPLES: Readonly<Record<string, SampleCue>> = {
  jump: {
    files: ['jump-1', 'jump-2', 'jump-3'],
    volume: 0.27,
    variation: 0.025,
  },
  land: {
    files: ['land-1', 'land-2', 'land-3'],
    volume: 0.38,
    variation: 0.04,
  },
  wall: { files: ['wall-1', 'wall-2'], volume: 0.34, variation: 0.035 },
  gem: {
    files: ['gem-1', 'gem-2', 'gem-3'],
    volume: 0.2,
    variation: 0,
    layered: true,
  },
  crumble: { files: ['crumble'], volume: 0.26, variation: 0.03 },
  collapse: { files: ['collapse'], volume: 0.3, variation: 0.035 },
  hurt: { files: ['hurt'], volume: 0.38, variation: 0.02 },
  stomp: { files: ['stomp'], volume: 0.32, variation: 0.02, layered: true },
  dodge: { files: ['dodge'], volume: 0.2, variation: 0.03 },
  'bat-warning': {
    files: ['bat-warning'],
    volume: 0.3,
    variation: 0,
    layered: true,
  },
  'icicle-warning': {
    files: ['icicle-warning'],
    volume: 0.25,
    variation: 0,
    layered: true,
  },
  frenzy: { files: ['frenzy'], volume: 0.2, variation: 0, layered: true },
  'frenzy-end': {
    files: ['frenzy-end'],
    volume: 0.14,
    variation: 0,
    layered: true,
  },
  encounter: {
    files: ['encounter'],
    volume: 0.22,
    variation: 0,
    layered: true,
  },
  over: { files: ['over'], volume: 0.22, variation: 0, layered: true },
};

export const WIND_SAMPLE = '/audio/wind-loop.mp3';
export const SAMPLE_URLS = [
  ...new Set(
    Object.values(SOUND_SAMPLES).flatMap((cue) =>
      cue.files.map((file) => `/audio/${file}.wav`),
    ),
  ),
  WIND_SAMPLE,
];

/** Decode once in the background. A missed cue is never queued for late playback. */
export class TowerSampleBank {
  private context: AudioContext;
  private buffers = new Map<string, AudioBuffer>();
  private nextVariant = new Map<string, number>();
  private abort = new AbortController();
  private loading?: Promise<void>;

  constructor(context: AudioContext) {
    this.context = context;
  }

  preload(onWind: (buffer: AudioBuffer) => void): Promise<void> {
    this.loading ??= this.load(onWind);
    return this.loading;
  }

  private async load(onWind: (buffer: AudioBuffer) => void) {
    const queue = [...SAMPLE_URLS];
    const worker = async () => {
      while (queue.length && !this.abort.signal.aborted) {
        const url = queue.shift()!;
        try {
          const response = await fetch(url, { signal: this.abort.signal });
          if (!response.ok) continue;
          const buffer = await this.context.decodeAudioData(
            await response.arrayBuffer(),
          );
          if (this.abort.signal.aborted || this.context.state === 'closed')
            return;
          this.buffers.set(url, buffer);
          if (url === WIND_SAMPLE) onWind(buffer);
        } catch {
          // Offline, unsupported codecs and interrupted loads keep the synth fallback.
        }
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
  }

  take(kind: string) {
    const cue = Object.hasOwn(SOUND_SAMPLES, kind)
      ? SOUND_SAMPLES[kind]
      : undefined;
    if (!cue || this.abort.signal.aborted) return null;
    const ready = cue.files
      .map((file) => this.buffers.get(`/audio/${file}.wav`))
      .filter((buffer) => buffer !== undefined);
    if (!ready.length) return null;
    const next = this.nextVariant.get(kind) ?? 0;
    this.nextVariant.set(kind, next + 1);
    return {
      buffer: ready[next % ready.length],
      volume: cue.volume,
      rate: 1 + (Math.random() * 2 - 1) * cue.variation,
      layered: cue.layered ?? false,
    };
  }

  dispose() {
    this.abort.abort();
    this.buffers.clear();
    this.nextVariant.clear();
  }
}
