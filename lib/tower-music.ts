export const MUSIC_TRACK = {
  title: 'Black Diamond',
  artist: 'Joth',
  url: '/audio/black-diamond.mp3',
  source: 'https://opengameart.org/content/black-diamond',
} as const;

const MUSIC_LEVEL = 0.16;

/** Stream the long track so mobile devices do not decode it all into RAM. */
export class TowerMusic {
  private context: AudioContext;
  private output: AudioNode;
  private element?: HTMLAudioElement;
  private source?: MediaElementAudioSourceNode;
  private gain?: GainNode;
  private wanted = false;
  private disposed = false;
  private duckUntil = 0;

  constructor(context: AudioContext, output: AudioNode) {
    this.context = context;
    this.output = output;
  }

  setPlaying(playing: boolean) {
    if (this.disposed) return;
    this.wanted = playing;
    if (!playing) {
      this.duckUntil = 0;
      this.element?.pause();
      return;
    }
    try {
      if (!this.element) {
        const element = new Audio();
        element.loop = true;
        element.preload = 'none';
        element.src = MUSIC_TRACK.url;
        const source = this.context.createMediaElementSource(element);
        const gain = this.context.createGain();
        source.connect(gain);
        gain.connect(this.output);
        this.element = element;
        this.source = source;
        this.gain = gain;
      }
      if (!this.element.paused) return;
      const now = this.context.currentTime;
      this.gain!.gain.cancelScheduledValues(now);
      this.gain!.gain.setValueAtTime(0, now);
      this.gain!.gain.setTargetAtTime(MUSIC_LEVEL, now, 0.18);
      void this.element
        .play()
        .then(() => {
          if (!this.wanted || this.disposed) this.element?.pause();
        })
        .catch(() => {
          // Autoplay blocks, interrupted playback and unavailable music never block play.
        });
    } catch {
      // Unsupported media elements must not disable the sound effects.
    }
  }

  /** Briefly lower the soundtrack so a warning or reward remains easy to hear. */
  duck(duration = 0.65) {
    if (!this.gain || !this.wanted || this.disposed) return;
    const now = this.context.currentTime;
    this.duckUntil = Math.max(this.duckUntil, now + duration);
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setTargetAtTime(0.065, now, 0.025);
    this.gain.gain.setTargetAtTime(MUSIC_LEVEL, this.duckUntil, 0.25);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.wanted = false;
    this.element?.pause();
    this.element?.removeAttribute('src');
    this.element?.load();
    this.source?.disconnect();
    this.gain?.disconnect();
  }
}
