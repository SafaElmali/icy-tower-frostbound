import type { ComboMilestone } from './combo-feedback';
import { FrenzyRhythm } from './frenzy-rhythm.ts';
import { INSTRUMENT, TowerSampleBank } from './tower-samples.ts';
import { TowerMusic } from './tower-music.ts';

const COMBO_MELODIES: Record<ComboMilestone, readonly number[]> = {
  3: [293.66, 440],
  5: [440, 587.33, 659.25],
  10: [587.33, 739.99, 880],
  15: [739.99, 880, 1108.73, 1174.66],
};

// Multiple crystals or hazard fragments can arrive in the same simulation step.
const CUE_COOLDOWNS: Readonly<Record<string, number>> = {
  jump: 0.055,
  land: 0.075,
  wall: 0.075,
  gem: 0.065,
  crumble: 0.12,
  collapse: 0.16,
  'icicle-warning': 0.18,
  'bat-warning': 0.18,
  'icicle-shatter': 0.09,
  wraith: 0.3,
  'wraith-tell': 0.3,
  'wraith-dash': 0.2,
  'crumble-creak-1': 0.1,
  'crumble-creak-2': 0.1,
  thunder: 1.2,
  spring: 0.1,
};

/** Optional placement for a cue: stereo position (-1..1), pitch, and a start delay in seconds. */
export type CueOptions = { pan?: number; rate?: number; delay?: number };
/** Sections with their own occasional ambience, by tower-section id. */
const BELL_SECTION = 'frozen-belfry';

/** Recorded snow, ice and movement foley with musical cues and offline synthesis. */
export class TowerAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private ambience?: GainNode;
  private rhythmGain?: GainNode;
  private reverb?: ConvolverNode;
  private enabled = true;
  private paused = false;
  private rhythm = new FrenzyRhythm();
  private sources: AudioScheduledSourceNode[] = [];
  private samples?: TowerSampleBank;
  private music?: TowerMusic;
  private musicEnabled = true;
  private voices = new Map<AudioScheduledSourceNode, AudioNode[]>();
  private lastCue = new Map<string, number>();
  private disposed = false;
  private section = '';
  private nextToll = -1;
  private init() {
    if (this.context) return this.context;
    const ctx = new AudioContext();
    this.context = ctx;
    const master = ctx.createGain();
    master.gain.value = this.enabled ? 0.65 : 0;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.knee.value = 10;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.16;
    master.connect(compressor);
    compressor.connect(ctx.destination);
    this.master = master;
    this.music = new TowerMusic(ctx, master);
    const rhythmGain = ctx.createGain();
    rhythmGain.gain.value = this.paused ? 0 : 1;
    rhythmGain.connect(master);
    this.rhythmGain = rhythmGain;
    const reverb = ctx.createConvolver();
    const impulse = ctx.createBuffer(2, ctx.sampleRate * 2.2, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < data.length; i++)
        data[i] =
          (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3.2) * 0.55;
    }
    reverb.buffer = impulse;
    const wet = ctx.createGain();
    wet.gain.value = 0.26;
    reverb.connect(wet);
    wet.connect(master);
    this.reverb = reverb;
    const ambience = ctx.createGain();
    ambience.gain.value = 0.23;
    ambience.connect(master);
    this.ambience = ambience;
    const fallback = ctx.createGain();
    fallback.connect(ambience);
    const noise = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const data = noise.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < data.length; i++) {
      brown = (brown + (Math.random() * 2 - 1) * 0.018) / 1.025;
      data[i] = brown * 2.8;
    }
    const wind = ctx.createBufferSource();
    wind.buffer = noise;
    wind.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 750;
    wind.connect(filter);
    filter.connect(fallback);
    wind.start();
    this.sources.push(wind);
    // A subtle open fifth: atmosphere without a repetitive music loop.
    for (const frequency of [73.416, 110, 146.83]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      const gain = ctx.createGain();
      gain.gain.value = 0.021;
      osc.connect(gain);
      gain.connect(fallback);
      osc.start();
      this.sources.push(osc);
    }
    this.samples = new TowerSampleBank(ctx);
    void this.samples.preload((buffer) => {
      if (this.disposed) return;
      const recordedWind = ctx.createBufferSource();
      const fade = ctx.createGain();
      recordedWind.buffer = buffer;
      recordedWind.loop = true;
      recordedWind.connect(fade);
      fade.connect(ambience);
      fade.gain.setValueAtTime(0, ctx.currentTime);
      fade.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.5);
      fallback.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
      this.sources.forEach((source) => source.stop(ctx.currentTime + 0.6));
      recordedWind.start();
      this.sources.push(recordedWind);
    });
    return ctx;
  }
  setEnabled(enabled: boolean) {
    if (this.disposed) return;
    this.enabled = enabled;
    if (!enabled) {
      this.rhythm.observe(0, false);
      this.stopVoices();
    }
    try {
      if (!this.context && enabled) this.init();
      if (this.context && this.master) {
        void this.context.resume().catch(() => {});
        this.master.gain.setTargetAtTime(
          enabled ? 0.65 : 0,
          this.context.currentTime,
          0.025,
        );
        this.music?.setPlaying(enabled && this.musicEnabled && !this.paused);
      }
    } catch {
      // Sound settings must also work on devices without Web Audio.
    }
  }
  setMusicEnabled(enabled: boolean) {
    if (this.musicEnabled === enabled || this.disposed) return;
    this.musicEnabled = enabled;
    this.music?.setPlaying(enabled && this.enabled && !this.paused);
  }
  setPaused(paused: boolean) {
    if (this.paused === paused) return;
    this.paused = paused;
    this.music?.setPlaying(!paused && this.enabled && this.musicEnabled);
    if (paused) {
      this.rhythm.observe(0, false);
      this.stopVoices();
    }
    if (this.context && this.rhythmGain)
      this.rhythmGain.gain.setTargetAtTime(
        paused ? 0 : 1,
        this.context.currentTime,
        0.015,
      );
    if (this.context && this.ambience)
      this.ambience.gain.setTargetAtTime(
        paused ? 0.08 : 0.23,
        this.context.currentTime,
        0.25,
      );
  }
  updateAction(time: number, frenzyTime: number, playing: boolean) {
    this.setPaused(!playing);
    const beat = this.rhythm.observe(
      time,
      playing && this.enabled && frenzyTime > 0,
    );
    if (beat !== null) this.play(`frenzy-beat-${beat}`);
    // A distant bell tolls now and then in the Belfry, timed on the run clock.
    if (!playing || this.section !== BELL_SECTION) this.nextToll = -1;
    else if (this.nextToll < 0 || time < this.nextToll - 20) this.nextToll = time + 3 + Math.random() * 4;
    else if (time >= this.nextToll) {
      this.nextToll = time + 9 + Math.random() * 7;
      this.play('bell-toll', 3, { pan: (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.3) });
    }
  }
  /** The current tower section's id, for section ambience. */
  setSection(id: string) {
    this.section = id;
  }
  play(kind: string, comboMilestone: ComboMilestone = 3, options: CueOptions = {}) {
    if (!this.enabled || this.disposed) return;
    try {
      const ctx = this.init();
      void ctx.resume().catch(() => {});
      const now = ctx.currentTime + Math.max(0, options.delay ?? 0);
      this.music?.setPlaying(this.musicEnabled && !this.paused);
      if (
        [
          'icicle-warning',
          'bat-warning',
          'hurt',
          'combo',
          'encounter',
          'frenzy',
          'wraith-tell',
        ].includes(kind)
      )
        this.music?.duck(kind === 'frenzy' ? 6 : 0.65);
      const isRhythm = kind.startsWith('frenzy-beat-');
      if (isRhythm && this.paused) return;
      const last = this.lastCue.get(kind);
      if (last !== undefined && now - last < (CUE_COOLDOWNS[kind] ?? 0)) return;
      this.lastCue.set(kind, now);
      // Position cues across the tower's width; older browsers without a panner stay centred.
      const pan = Math.max(-1, Math.min(1, options.pan ?? 0));
      /** Connect one voice to the mix; each voice owns its panner so it can end independently. */
      const route = (gain: AudioNode): AudioNode[] => {
        if (!pan || typeof ctx.createStereoPanner !== 'function') {
          gain.connect(this.master!);
          return [gain];
        }
        const panner = ctx.createStereoPanner();
        panner.pan.value = pan;
        gain.connect(panner);
        panner.connect(this.master!);
        return [gain, panner];
      };
      const sample = this.samples?.take(kind);
      if (sample) {
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        source.buffer = sample.buffer;
        source.playbackRate.value = sample.rate * (options.rate ?? 1);
        gain.gain.value = sample.volume;
        source.connect(gain);
        this.track(source, route(gain));
        source.start(now);
        if (!sample.layered) return;
      }
      const note = (
        frequency: number,
        end: number,
        duration: number,
        amplitude: number,
        delay = 0,
        type: OscillatorType = 'sine',
      ) => {
        if (this.voices.size >= 48) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const time = now + delay;
        osc.type = type;
        osc.frequency.setValueAtTime(frequency, time);
        osc.frequency.exponentialRampToValueAtTime(end, time + duration);
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(
          amplitude * (sample ? 0.65 : 1),
          time + 0.009,
        );
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
        osc.connect(gain);
        let nodes: AudioNode[] = [gain];
        if (isRhythm) gain.connect(this.rhythmGain!);
        else {
          nodes = route(gain);
          gain.connect(this.reverb!);
        }
        this.track(osc, nodes);
        osc.start(time);
        osc.stop(time + duration + 0.03);
      };
      /** A struck chime note from the sampled instrument, or a sine note while it loads. */
      const chime = (frequency: number, duration: number, amplitude: number, delay = 0) => {
        const register = frequency < 440 ? 'low' : 'high';
        const buffer = this.samples?.instrument(register);
        if (!buffer) return note(frequency, frequency, duration, amplitude, delay);
        if (this.voices.size >= 48) return;
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        const time = now + delay, ring = duration * 1.6 + 0.25;
        source.buffer = buffer;
        source.playbackRate.value = frequency / INSTRUMENT[register].frequency;
        // The note is peak-balanced to 0.72; bells read louder than sines, so trim a little.
        gain.gain.setValueAtTime(amplitude * 1.1 * (sample ? 0.65 : 1), time);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + ring);
        source.connect(gain);
        let nodes: AudioNode[] = [gain];
        if (isRhythm) gain.connect(this.rhythmGain!);
        else {
          nodes = route(gain);
          gain.connect(this.reverb!);
        }
        this.track(source, nodes);
        source.start(time);
        source.stop(time + ring + 0.03);
      };
      if (kind === 'gem') {
        chime(1174.66, 0.5, 0.12);
        chime(1760, 0.55, 0.06, 0.07);
        chime(2349.32, 0.6, 0.03, 0.11);
      } else if (kind === 'combo') {
        const melody = COMBO_MELODIES[comboMilestone];
        melody.forEach((frequency, index) =>
          chime(frequency, 0.3, 0.06, index * 0.055),
        );
        if (comboMilestone >= 10)
          chime(melody[0] / 2, 0.45, 0.035);
      } else if (kind === 'land') {
        // A short heel impact followed by a quieter ice tap; no sustained landing drone.
        note(125, 48, 0.11, 0.14, 0, 'triangle');
        note(820, 390, 0.045, 0.025, 0.015);
      } else if (kind === 'jump') {
        note(185, 570, 0.2, 0.065);
        note(100, 250, 0.15, 0.035, 0, 'triangle');
      } else if (kind === 'wall') {
        note(250, 70, 0.17, 0.09, 0, 'triangle');
      } else if (kind === 'icicle-warning') {
        note(1568, 1760, 0.1, 0.045);
        note(1568, 1760, 0.1, 0.035, 0.15);
      } else if (kind === 'bat-warning') {
        note(1046.5, 659.25, 0.13, 0.04);
        note(1046.5, 783.99, 0.11, 0.03, 0.16);
      } else if (kind === 'icicle-shatter') {
        // Glassy tinkles over a short crack: the shard broke on the ledge.
        note(1760, 820, 0.09, 0.035, 0, 'triangle');
        note(2637, 2093, 0.2, 0.03, 0.02);
        note(3136, 2349, 0.24, 0.022, 0.05);
      } else if (kind === 'wraith') {
        // Fallback only: a hollow breath as the wraith drifts in.
        note(196, 293.66, 0.55, 0.035);
        note(293.66, 220, 0.65, 0.022, 0.1);
      } else if (kind === 'wraith-tell') {
        // A rising, detuned wail that lasts as long as the visible tell.
        note(415.3, 880, 0.85, 0.045, 0, 'triangle');
        note(440, 932.33, 0.85, 0.028, 0.02);
      } else if (kind === 'wraith-dash') {
        note(1318.51, 196, 0.26, 0.06, 0, 'triangle');
        note(659.25, 110, 0.3, 0.035, 0.02);
      } else if (kind === 'crumble') {
        note(900, 310, 0.06, 0.045, 0, 'triangle');
        note(670, 220, 0.065, 0.035, 0.055, 'triangle');
      } else if (kind === 'collapse') {
        note(420, 65, 0.15, 0.065, 0, 'triangle');
      } else if (kind === 'crumble-creak-1' || kind === 'crumble-creak-2') {
        const high = kind === 'crumble-creak-2';
        note(high ? 520 : 380, high ? 340 : 250, 0.12, 0.035, 0, 'sawtooth');
      } else if (kind === 'spring') {
        note(190, 560, 0.24, 0.06, 0, 'triangle');
      } else if (kind === 'hurt') {
        note(190, 85, 0.19, 0.085, 0, 'triangle');
        note(270, 120, 0.15, 0.04, 0.04);
      } else if (kind === 'stomp') {
        note(146.83, 587.33, 0.2, 0.07, 0, 'triangle');
        chime(880, 0.25, 0.05, 0.06);
        chime(1174.66, 0.3, 0.045, 0.11);
      } else if (kind === 'combo-short') {
        // A gentle falling pair: the chain ended, but nothing went wrong.
        chime(659.25, 0.18, 0.045);
        chime(493.88, 0.3, 0.035, 0.1);
      } else if (kind === 'dodge') {
        note(1174.66, 1568, 0.16, 0.035);
      } else if (kind === 'frenzy') {
        [587.33, 739.99, 880, 1174.66].forEach((frequency, i) =>
          chime(frequency, 0.34, 0.065, i * 0.06),
        );
      } else if (kind === 'frenzy-end') {
        [880, 739.99, 587.33, 440].forEach((frequency, i) =>
          chime(frequency, 0.28, 0.04 - i * 0.005, i * 0.07),
        );
      } else if (kind === 'encounter') {
        note(293.66, 293.66, 0.2, 0.065, 0, 'triangle');
        note(440, 440, 0.3, 0.055, 0.14);
      } else if (isRhythm && !this.paused) {
        const beat = Number(kind.slice('frenzy-beat-'.length));
        const frequency = [
          293.66, 587.33, 440, 739.99, 293.66, 880, 440, 587.33,
        ][beat];
        if (frequency) {
          chime(frequency, 0.13, 0.03);
          if (beat % 2 === 0) note(96, 48, 0.1, 0.035);
        }
      } else if (kind === 'over') {
        note(293.66, 146.83, 1.4, 0.11);
        note(220, 110, 1.6, 0.07, 0.12);
      }
    } catch {
      /* A blocked audio device must never interrupt gameplay. */
    }
  }
  private track(source: AudioScheduledSourceNode, nodes: AudioNode[]) {
    // Keep polyphony bounded during a burst of pickups or collapsing platforms.
    if (this.voices.size >= 48) {
      const oldest = this.voices.keys().next().value!;
      oldest.stop();
      oldest.disconnect();
      this.voices.get(oldest)?.forEach((node) => node.disconnect());
      this.voices.delete(oldest);
    }
    this.voices.set(source, nodes);
    source.onended = () => {
      source.disconnect();
      nodes.forEach((node) => node.disconnect());
      this.voices.delete(source);
    };
  }
  private stopVoices() {
    this.voices.forEach((nodes, source) => {
      try {
        source.stop();
      } catch {
        /* Already stopped. */
      }
      source.disconnect();
      nodes.forEach((node) => node.disconnect());
    });
    this.voices.clear();
  }
  resetRun() {
    this.stopVoices();
    this.lastCue.clear();
    this.nextToll = -1;
    this.rhythm.observe(0, false);
    this.setPaused(false);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.samples?.dispose();
    this.music?.dispose();
    this.stopVoices();
    this.sources.forEach((s) => {
      try {
        s.stop();
      } catch {
        /* Already stopped. */
      }
    });
    void this.context?.close().catch(() => {});
  }
}
