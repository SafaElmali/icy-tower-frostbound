import type { ComboMilestone } from './combo-feedback';
import { FrenzyRhythm } from './frenzy-rhythm';

const COMBO_MELODIES: Record<ComboMilestone, readonly number[]> = {
  3: [293.66, 440],
  5: [440, 587.33, 659.25],
  10: [587.33, 739.99, 880],
  15: [739.99, 880, 1108.73, 1174.66],
};

/** Quiet synthesized wind, resonant crystal notes, and tactile movement sounds. */
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
  private init() {
    if (this.context) return this.context;
    const ctx = new AudioContext();
    this.context = ctx;
    const master = ctx.createGain();
    master.gain.value = this.enabled ? 0.65 : 0;
    master.connect(ctx.destination);
    this.master = master;
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
    filter.connect(ambience);
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
      gain.connect(ambience);
      gain.connect(reverb);
      osc.start();
      this.sources.push(osc);
    }
    return ctx;
  }
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.rhythm.observe(0, false);
    if (!this.context && enabled) this.init();
    if (this.context && this.master) {
      void this.context.resume().catch(() => {});
      this.master.gain.setTargetAtTime(
        enabled ? 0.65 : 0,
        this.context.currentTime,
        0.08,
      );
    }
  }
  setPaused(paused: boolean) {
    if (this.paused === paused) return;
    this.paused = paused;
    if (paused) this.rhythm.observe(0, false);
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
  }
  play(kind: string, comboMilestone: ComboMilestone = 3) {
    if (!this.enabled) return;
    try {
      const ctx = this.init();
      void ctx.resume().catch(() => {});
      const now = ctx.currentTime;
      const isRhythm = kind.startsWith('frenzy-beat-');
      const note = (
        frequency: number,
        end: number,
        duration: number,
        amplitude: number,
        delay = 0,
        type: OscillatorType = 'sine',
      ) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const time = now + delay;
        osc.type = type;
        osc.frequency.setValueAtTime(frequency, time);
        osc.frequency.exponentialRampToValueAtTime(end, time + duration);
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(amplitude, time + 0.009);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
        osc.connect(gain);
        if (isRhythm) gain.connect(this.rhythmGain!);
        else {
          gain.connect(this.master!);
          gain.connect(this.reverb!);
        }
        osc.start(time);
        osc.stop(time + duration + 0.03);
      };
      if (kind === 'gem') {
        note(1174, 1174, 0.65, 0.13);
        note(1760, 1760, 0.7, 0.065, 0.07);
        note(2349, 2349, 0.8, 0.035, 0.11);
      } else if (kind === 'combo') {
        const melody = COMBO_MELODIES[comboMilestone];
        melody.forEach((frequency, index) =>
          note(frequency, frequency, 0.24, 0.055, index * 0.055),
        );
        if (comboMilestone >= 10)
          note(melody[0] / 2, melody[0] / 2, 0.36, 0.025);
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
      } else if (kind === 'crumble') {
        note(900, 310, 0.06, 0.045, 0, 'triangle');
        note(670, 220, 0.065, 0.035, 0.055, 'triangle');
      } else if (kind === 'collapse') {
        note(420, 65, 0.15, 0.065, 0, 'triangle');
      } else if (kind === 'hurt') {
        note(190, 85, 0.19, 0.085, 0, 'triangle');
        note(270, 120, 0.15, 0.04, 0.04);
      } else if (kind === 'stomp') {
        note(146.83, 587.33, 0.2, 0.07, 0, 'triangle');
        note(880, 1174.66, 0.3, 0.06, 0.07);
      } else if (kind === 'dodge') {
        note(1174.66, 1568, 0.16, 0.035);
      } else if (kind === 'frenzy') {
        [587.33, 739.99, 880, 1174.66].forEach((frequency, i) =>
          note(frequency, frequency, 0.32, 0.065, i * 0.06),
        );
      } else if (kind === 'frenzy-end') {
        note(880, 587.33, 0.3, 0.045);
        note(440, 440, 0.4, 0.025, 0.06);
      } else if (kind === 'encounter') {
        note(293.66, 293.66, 0.2, 0.065, 0, 'triangle');
        note(440, 440, 0.3, 0.055, 0.14);
      } else if (isRhythm && !this.paused) {
        const beat = Number(kind.slice('frenzy-beat-'.length));
        const frequency = [
          293.66, 587.33, 440, 739.99, 293.66, 880, 440, 587.33,
        ][beat];
        if (frequency) {
          note(frequency, frequency, 0.13, 0.024, 0, 'triangle');
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
  dispose() {
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
