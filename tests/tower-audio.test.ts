import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TowerAudio } from '../lib/tower-audio.ts';
import { MUSIC_TRACK, TowerMusic } from '../lib/tower-music.ts';
import {
  SAMPLE_URLS,
  SOUND_SAMPLES,
  TowerSampleBank,
} from '../lib/tower-samples.ts';

class Param {
  value = 1;
  targets: { value: number; time: number }[] = [];
  cancelScheduledValues() {
    this.targets = [];
  }
  setValueAtTime(value: number) {
    this.value = value;
  }
  linearRampToValueAtTime(value: number) {
    this.value = value;
  }
  exponentialRampToValueAtTime(value: number) {
    this.value = value;
  }
  setTargetAtTime(value: number, time = 0) {
    this.value = value;
    this.targets.push({ value, time });
  }
}

class AudioNodeStub {
  gain = new Param();
  frequency = new Param();
  playbackRate = new Param();
  threshold = new Param();
  knee = new Param();
  ratio = new Param();
  attack = new Param();
  release = new Param();
  loop = false;
  buffer?: AudioBuffer;
  onended?: () => void;
  started = false;
  stopAt = Infinity;
  disconnected = false;
  connect() {}
  disconnect() {
    this.disconnected = true;
  }
  start() {
    this.started = true;
  }
  stop(at = 0) {
    this.stopAt = at;
  }
}

class ContextStub {
  currentTime = 0;
  sampleRate = 24000;
  state = 'running';
  destination = new AudioNodeStub();
  sources: AudioNodeStub[] = [];
  oscillators: AudioNodeStub[] = [];
  mediaSources: AudioNodeStub[] = [];
  gains: AudioNodeStub[] = [];
  createGain() {
    const gain = new AudioNodeStub();
    this.gains.push(gain);
    return gain;
  }
  createMediaElementSource() {
    const source = new AudioNodeStub();
    this.mediaSources.push(source);
    return source;
  }
  createDynamicsCompressor() {
    return new AudioNodeStub();
  }
  createConvolver() {
    return new AudioNodeStub();
  }
  createBiquadFilter() {
    return new AudioNodeStub();
  }
  createBuffer(_channels: number, length: number) {
    return { getChannelData: () => new Float32Array(length) };
  }
  createBufferSource() {
    const node = new AudioNodeStub();
    this.sources.push(node);
    return node;
  }
  createOscillator() {
    const node = new AudioNodeStub();
    this.oscillators.push(node);
    return node;
  }
  async decodeAudioData(data: ArrayBuffer) {
    return { duration: 0.3, data } as unknown as AudioBuffer;
  }
  async resume() {}
  async close() {
    this.state = 'closed';
  }
}

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

function mockMedia(t: TestContext) {
  const instances: MediaStub[] = [];
  class MediaStub {
    paused = true;
    loop = false;
    src = '';
    preload = '';
    currentTime = 0;
    playCalls = 0;
    constructor() {
      instances.push(this);
    }
    async play() {
      this.paused = false;
      this.playCalls++;
    }
    pause() {
      this.paused = true;
    }
    removeAttribute() {
      this.src = '';
    }
    load() {}
  }
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'Audio');
  Object.defineProperty(globalThis, 'Audio', {
    configurable: true,
    value: MediaStub,
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'Audio', previous);
    else Reflect.deleteProperty(globalThis, 'Audio');
  });
  return instances;
}

void test('music starts lazily, loops, keeps its position, and releases its stream', async (t) => {
  const instances = mockMedia(t);
  const context = new ContextStub();
  const music = new TowerMusic(
    context as unknown as AudioContext,
    context.destination as unknown as AudioNode,
  );
  music.setPlaying(false);
  assert.equal(instances.length, 0, 'muted music does not download');
  music.setPlaying(true);
  const track = instances[0];
  assert.equal(track.src, MUSIC_TRACK.url);
  assert.equal(track.loop, true);
  assert.equal(track.preload, 'none');
  track.currentTime = 28;
  music.setPlaying(true);
  assert.equal(
    track.playCalls,
    1,
    'gameplay events do not restart a running track',
  );
  music.setPlaying(false);
  assert.equal(track.paused, true);
  music.setPlaying(true);
  assert.equal(track.currentTime, 28);
  assert.equal(context.mediaSources.length, 1);
  context.currentTime = 10;
  music.duck(6);
  context.currentTime = 11;
  music.duck(0.65);
  assert.equal(
    context.gains[0].gain.targets.at(-1)?.time,
    16,
    'a shorter warning cannot cancel the frenzy volume dip',
  );
  music.dispose();
  await settle();
  assert.equal(track.paused, true);
  assert.equal(track.src, '');
  assert.equal(context.mediaSources[0].disconnected, true);
  music.setPlaying(true);
  assert.equal(instances.length, 1, 'disposal cannot resurrect the stream');
});

void test('delayed or rejected music playback cannot defeat pause', async (t) => {
  const instances = mockMedia(t);
  const context = new ContextStub();
  const music = new TowerMusic(
    context as unknown as AudioContext,
    context.destination as unknown as AudioNode,
  );
  music.setPlaying(true);
  await settle();
  music.setPlaying(false);
  const track = instances[0];
  let finish!: () => void;
  t.mock.method(
    track,
    'play',
    () =>
      new Promise<void>((resolve) => {
        finish = () => {
          track.paused = false;
          resolve();
        };
      }),
  );
  music.setPlaying(true);
  music.setPlaying(false);
  finish();
  await settle();
  assert.equal(track.paused, true);
  t.mock.method(track, 'play', () =>
    Promise.reject(new Error('Autoplay blocked')),
  );
  assert.doesNotThrow(() => music.setPlaying(true));
  await settle();
  music.dispose();
});

void test('every bundled effect has provenance, a clean PCM envelope and mix headroom', () => {
  const sources = JSON.parse(
    readFileSync(
      new URL('../public/audio/sources.json', import.meta.url),
      'utf8',
    ),
  ) as Record<string, unknown>;
  let bytes = 0;
  for (const url of SAMPLE_URLS) {
    const clip = readFileSync(new URL(`../public${url}`, import.meta.url));
    bytes += clip.length;
    assert.ok(sources[url.split('/').at(-1)!], `${url} needs provenance`);
    if (!url.endsWith('.wav')) continue;
    assert.equal(clip.toString('ascii', 0, 4), 'RIFF');
    assert.equal(clip.toString('ascii', 8, 12), 'WAVE');
    assert.equal(clip.readUInt16LE(20), 1); // PCM
    assert.equal(clip.readUInt16LE(22), 1); // mono
    assert.equal(clip.readUInt32LE(24), 24000);
    assert.equal(clip.readUInt16LE(34), 16);
    assert.equal(clip.readInt16LE(44), 0, `${url} starts cleanly`);
    assert.equal(clip.readInt16LE(clip.length - 2), 0, `${url} ends cleanly`);
    let peak = 0,
      energy = 0;
    for (let i = 44; i < clip.length; i += 2) {
      const sample = clip.readInt16LE(i) / 32768;
      peak = Math.max(peak, Math.abs(sample));
      energy += sample * sample;
    }
    assert.ok(peak > 0.1 && peak < 0.73, `${url} has signal and headroom`);
    assert.ok(
      Math.sqrt(energy / ((clip.length - 44) / 2)) > 0.005,
      `${url} is audible`,
    );
  }
  // Effects decode in the background and never delay play; the wind loop is ~400 KiB of this.
  assert.ok(bytes < 1100 * 1024, 'audio download stays small');
});

void test('samples decode once, rotate variants, and survive individual failed downloads', async (t) => {
  const requests: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    requests.push(url);
    if (url.endsWith('collapse.wav'))
      return new Response(null, { status: 404 });
    if (url.endsWith('hurt.wav')) throw new Error('Offline');
    return new Response(new Uint8Array([requests.length]));
  });
  const bank = new TowerSampleBank(
    new ContextStub() as unknown as AudioContext,
  );
  let wind = 0;
  assert.equal(bank.take('jump'), null, 'loading does not queue a cue');
  await Promise.all([bank.preload(() => wind++), bank.preload(() => wind++)]);
  assert.equal(requests.length, SAMPLE_URLS.length);
  assert.equal(new Set(requests).size, requests.length);
  assert.equal(wind, 1);
  assert.equal(bank.take('collapse'), null);
  assert.equal(bank.take('hurt'), null);
  const variants = Array.from({ length: 4 }, () => bank.take('jump')!);
  assert.notEqual(variants[0].buffer, variants[1].buffer);
  assert.notEqual(variants[1].buffer, variants[2].buffer);
  assert.equal(variants[0].buffer, variants[3].buffer);
  for (const cue of variants) assert.ok(cue.rate >= 0.975 && cue.rate <= 1.025);
  assert.equal(bank.take('gem')!.rate, 1, 'musical pickups stay in tune');
  bank.dispose();
  assert.equal(bank.take('jump'), null);
});

void test('disposing while decoding cannot resurrect buffers or start wind', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response(new Uint8Array([1])),
  );
  const context = new ContextStub();
  let finishDecode!: () => void;
  const gate = new Promise<void>((resolve) => {
    finishDecode = resolve;
  });
  t.mock.method(context, 'decodeAudioData', async () => {
    await gate;
    return { duration: 0.3 } as AudioBuffer;
  });
  const bank = new TowerSampleBank(context as unknown as AudioContext);
  let wind = 0;
  const pending = bank.preload(() => wind++);
  await settle();
  bank.dispose();
  finishDecode();
  await pending;
  assert.equal(bank.take('jump'), null);
  assert.equal(wind, 0);
});

void test('playback falls back immediately, coalesces bursts, and cancels voices on pause, mute and retry', async (t) => {
  const music = mockMedia(t);
  const context = new ContextStub();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  Object.defineProperty(globalThis, 'AudioContext', {
    configurable: true,
    value: class {
      constructor() {
        return context;
      }
    },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'AudioContext', previous);
    else Reflect.deleteProperty(globalThis, 'AudioContext');
  });
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response(new Uint8Array([1])),
  );
  const audio = new TowerAudio();
  audio.play('jump');
  assert.equal(music[0].paused, false);
  assert.equal(
    context.oscillators.length,
    5,
    'three ambient tones plus immediate jump fallback',
  );
  await settle();
  context.currentTime = 1;
  audio.play('jump');
  const jump = context.sources.at(-1)!;
  assert.ok(
    jump.buffer && !jump.loop && jump.started,
    'loaded jump uses a sample',
  );
  const count = context.sources.length;
  audio.play('jump');
  assert.equal(
    context.sources.length,
    count,
    'same-step duplicates do not pile up',
  );
  audio.setPaused(true);
  assert.equal(music[0].paused, true);
  assert.equal(jump.stopAt, 0);
  assert.equal(jump.disconnected, true);
  const oscillators = context.oscillators.length;
  audio.updateAction(1.2, 5, false);
  assert.equal(
    context.oscillators.length,
    oscillators,
    'paused frenzy does not beat',
  );
  audio.resetRun();
  assert.equal(music[0].paused, false);
  audio.play('jump');
  assert.equal(
    context.sources.length,
    count + 1,
    'retry clears the old cooldown',
  );
  audio.setEnabled(false);
  assert.equal(music[0].paused, true);
  assert.equal(context.sources.at(-1)!.stopAt, 0);
  audio.play('gem');
  assert.equal(context.sources.length, count + 1, 'muted events stay silent');
  audio.setEnabled(true);
  assert.equal(music[0].paused, false);
  audio.setMusicEnabled(false);
  assert.equal(
    music[0].paused,
    true,
    'music can be muted without muting effects',
  );
  assert.equal(
    context.sources.length,
    count + 1,
    'unmute does not replay old events',
  );
  for (const kind of Object.keys(SOUND_SAMPLES)) {
    context.currentTime += 1;
    assert.doesNotThrow(() => audio.play(kind));
  }
  assert.ok(
    context.sources.length > count + 1,
    'effects still play with music off',
  );
  audio.dispose();
  audio.dispose();
  assert.equal(context.state, 'closed');
  const afterDispose = context.sources.length;
  audio.play('jump');
  audio.setEnabled(true);
  assert.equal(context.sources.length, afterDispose);
});

void test('unavailable audio devices never break settings or gameplay', () => {
  const audio = new TowerAudio();
  assert.doesNotThrow(() => audio.setEnabled(true));
  assert.doesNotThrow(() => audio.play('jump'));
  assert.doesNotThrow(() => audio.dispose());
});

void test('chime melodies, stereo placement and section ambience use loaded samples', async (t) => {
  mockMedia(t);
  type PannerStub = AudioNodeStub & { pan: Param };
  const context = new ContextStub() as ContextStub & { panners: PannerStub[]; createStereoPanner: () => PannerStub };
  context.panners = [];
  context.createStereoPanner = () => {
    const node = Object.assign(new AudioNodeStub(), { pan: new Param() });
    context.panners.push(node);
    return node;
  };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: class { constructor() { return context; } } });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'AudioContext', previous);
    else Reflect.deleteProperty(globalThis, 'AudioContext');
  });
  t.mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array([1])));
  const audio = new TowerAudio();
  audio.play('jump');
  await settle();
  const oscillators = context.oscillators.length, sources = context.sources.length;
  context.currentTime = 1;
  audio.play('combo', 5);
  assert.equal(context.oscillators.length, oscillators, 'a loaded chime replaces sine notes');
  const notes = context.sources.slice(sources);
  assert.equal(notes.length, 3);
  assert.deepEqual(notes.map(note => Math.round(note.playbackRate.value * 880)), [440, 587, 659], 'notes are pitched from the 880 Hz chime');
  context.currentTime = 2;
  audio.play('crumble', 3, { pan: -0.5, rate: 1.1 });
  assert.equal(context.panners.at(-1)?.pan.value, -0.5);
  assert.ok(Math.abs(context.sources.at(-1)!.playbackRate.value / 1.1 - 1) < 0.031, 'rate multiplies sample variation');
  audio.setSection('frozen-belfry');
  const before = context.sources.length;
  audio.updateAction(10, 0, true);
  audio.updateAction(30, 0, true);
  assert.equal(context.sources.length, before + 1, 'the Belfry tolls once the bell is due');
  audio.setSection('forgotten-hall');
  audio.updateAction(60, 0, true);
  assert.equal(context.sources.length, before + 1, 'other sections stay quiet');
  audio.dispose();
});
