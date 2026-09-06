/** Quiet synthesized wind, resonant crystal notes, and tactile movement sounds. */
export class TowerAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private ambience?: GainNode;
  private reverb?: ConvolverNode;
  private enabled = true;
  private sources: AudioScheduledSourceNode[] = [];
  private init() {
    if (this.context) return this.context;
    const ctx = new AudioContext(); this.context = ctx;
    const master = ctx.createGain(); master.gain.value = this.enabled ? .65 : 0; master.connect(ctx.destination); this.master = master;
    const reverb = ctx.createConvolver();
    const impulse = ctx.createBuffer(2, ctx.sampleRate * 2.2, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) { const data = impulse.getChannelData(channel); for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3.2) * .55; }
    reverb.buffer = impulse; const wet = ctx.createGain(); wet.gain.value = .26; reverb.connect(wet); wet.connect(master); this.reverb = reverb;
    const ambience = ctx.createGain(); ambience.gain.value = .23; ambience.connect(master); this.ambience = ambience;
    const noise = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate); const data = noise.getChannelData(0); let brown = 0;
    for (let i = 0; i < data.length; i++) { brown = (brown + (Math.random() * 2 - 1) * .018) / 1.025; data[i] = brown * 2.8; }
    const wind = ctx.createBufferSource(); wind.buffer = noise; wind.loop = true;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 750; wind.connect(filter); filter.connect(ambience); wind.start(); this.sources.push(wind);
    // A subtle open fifth: atmosphere without a repetitive music loop.
    for (const frequency of [73.416, 110, 146.83]) {
      const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = frequency;
      const gain = ctx.createGain(); gain.gain.value = .021; osc.connect(gain); gain.connect(ambience); gain.connect(reverb); osc.start(); this.sources.push(osc);
    }
    return ctx;
  }
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!this.context && enabled) this.init();
    if (this.context && this.master) { void this.context.resume().catch(() => {}); this.master.gain.setTargetAtTime(enabled ? .65 : 0, this.context.currentTime, .08); }
  }
  setPaused(paused: boolean) {
    if (this.context && this.ambience) this.ambience.gain.setTargetAtTime(paused ? .08 : .23, this.context.currentTime, .25);
  }
  play(kind: string) {
    if (!this.enabled) return;
    try {
      const ctx = this.init(); void ctx.resume().catch(() => {});
      const now = ctx.currentTime;
      const note = (frequency: number, end: number, duration: number, amplitude: number, delay = 0, type: OscillatorType = 'sine') => {
        const osc = ctx.createOscillator(); const gain = ctx.createGain(); const time = now + delay;
        osc.type = type; osc.frequency.setValueAtTime(frequency, time); osc.frequency.exponentialRampToValueAtTime(end, time + duration);
        gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(amplitude, time + .009); gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
        osc.connect(gain); gain.connect(this.master!); gain.connect(this.reverb!); osc.start(time); osc.stop(time + duration + .03);
      };
      if (kind === 'gem') { note(1174, 1174, .65, .13); note(1760, 1760, .7, .065, .07); note(2349, 2349, .8, .035, .11); }
      else if (kind === 'combo') { note(587, 587, .35, .035); note(880, 880, .45, .032, .06); }
      else if (kind === 'land') { note(135, 43, .14, .2, 0, 'triangle'); note(680, 290, .07, .018); }
      else if (kind === 'jump') { note(185, 570, .2, .065); note(100, 250, .15, .035, 0, 'triangle'); }
      else if (kind === 'wall') { note(250, 70, .17, .09, 0, 'triangle'); }
      else if (kind === 'over') { note(293.66, 146.83, 1.4, .11); note(220, 110, 1.6, .07, .12); }
    } catch { /* A blocked audio device must never interrupt gameplay. */ }
  }
  dispose() { this.sources.forEach(s => { try { s.stop(); } catch { /* Already stopped. */ } }); void this.context?.close().catch(() => {}); }
}
