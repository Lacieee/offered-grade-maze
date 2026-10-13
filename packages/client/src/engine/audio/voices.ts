/**
 * The game's sounds (CP09 T3–T6), synthesised. The interfaces let recorded samples replace
 * any of them later.
 */
import type { FloorKind } from '@ogm/shared';
import type * as THREE from 'three';
import { dbToGain, type AudioEngine } from './AudioEngine.js';
import type { Side } from './footsteps.js';

export interface FootstepVoice {
  step(floor: FloorKind, side: Side): void;
}
export interface MusicBed {
  start(): void;
  stop(): void;
  duck(db: number, seconds: number): void;
}
export interface GoalVoice {
  setSource(position: THREE.Vector3 | null, attenuationDb: number): void;
  start(): void;
  stop(): void;
}
export interface Stinger {
  play(): void;
}

/** A value randomised by ±`spread` (fraction), e.g. ±6 % pitch. */
const vary = (value: number, spread: number, rnd: () => number): number =>
  value * (1 + (rnd() * 2 - 1) * spread);

/** Floor timbres (CP09 T3.2). */
export const FLOORS: Record<
  FloorKind,
  { filter: BiquadFilterType; freq: number; q: number; attack: number; decay: number; db: number }
> = {
  wood: { filter: 'bandpass', freq: 450, q: 1.2, attack: 0.002, decay: 0.09, db: 0 },
  tile: { filter: 'bandpass', freq: 1800, q: 1.6, attack: 0.001, decay: 0.06, db: 0 },
  carpet: { filter: 'lowpass', freq: 600, q: 0.7, attack: 0.004, decay: 0.12, db: -6 },
};

/** Footsteps: a filtered noise burst plus a low thump, different per floor (CP09 T3). */
export class FootstepSynth implements FootstepVoice {
  private readonly noise: AudioBuffer;

  constructor(
    private readonly audio: AudioEngine,
    private readonly rnd: () => number = Math.random,
  ) {
    this.noise = audio.noiseBuffer(0.5, 11);
  }

  step(floor: FloorKind, side: Side): void {
    const { ctx, sfx } = this.audio;
    const f = FLOORS[floor];
    const t = ctx.currentTime + 0.005;
    const level = 0.5 * dbToGain(f.db + (this.rnd() * 2 - 1) * 2); // ±2 dB
    const pitch = vary(1, 0.06, this.rnd); // ±6 %
    const decay = f.decay * vary(1, 0.15, this.rnd);

    const pan = ctx.createStereoPanner();
    pan.pan.value = side === 'L' ? -0.15 : 0.15;
    pan.connect(sfx);

    // Noise burst.
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = pitch;
    const filter = ctx.createBiquadFilter();
    filter.type = f.filter;
    filter.frequency.value = vary(f.freq, 0.1, this.rnd) * pitch; // ±10 %
    filter.Q.value = f.q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(level, t + f.attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + f.attack + decay);
    src.connect(filter).connect(env).connect(pan);
    src.start(t, this.rnd() * 0.3);
    src.stop(t + f.attack + decay + 0.05);

    // Wood: a faint hollow resonance.
    if (floor === 'wood') {
      const body = ctx.createBiquadFilter();
      body.type = 'bandpass';
      body.frequency.value = 210 * pitch;
      body.Q.value = 9;
      const bodyGain = ctx.createGain();
      bodyGain.gain.value = 0.35;
      filter.connect(body).connect(bodyGain).connect(env);
    }

    // Low thump: 80–120 Hz, 50 ms.
    const thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(vary(100, 0.2, this.rnd) * pitch, t);
    thump.frequency.exponentialRampToValueAtTime(60, t + 0.05);
    const thumpEnv = ctx.createGain();
    thumpEnv.gain.setValueAtTime(0, t);
    thumpEnv.gain.linearRampToValueAtTime(level * 0.8, t + 0.003);
    thumpEnv.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    thump.connect(thumpEnv).connect(pan);
    thump.start(t);
    thump.stop(t + 0.07);
  }
}

/** Whole-tone chime pitches (Hz). */
export const CHIME_SCALE = [392, 440, 493.88, 554.37, 622.25, 698.46, 784];
/** Seconds between chimes: 6–14 s. */
export function chimeDelay(rnd: () => number): number {
  return 6 + rnd() * 8;
}
/** The bed sits about 24 dB below full scale. */
export const BED_DB = -24;

/** Uncanny ambient bed: detuned drone, room tone and sparse chimes (CP09 T4). */
export class AmbientBed implements MusicBed {
  private readonly out: GainNode;
  private nodes: AudioScheduledSourceNode[] = [];
  private chimeTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(
    private readonly audio: AudioEngine,
    private readonly rnd: () => number = Math.random,
  ) {
    this.out = audio.ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(audio.music);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const { ctx } = this.audio;
    const t = ctx.currentTime;
    this.out.gain.setValueAtTime(0, t);
    this.out.gain.linearRampToValueAtTime(dbToGain(BED_DB), t + 3);

    // Drone: two detuned triangles through a slowly breathing low-pass.
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 240;
    lowpass.Q.value = 0.8;
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.7;
    lowpass.connect(droneGain).connect(this.out);
    for (const f of [55, 55.4]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      o.connect(lowpass);
      o.start(t);
      this.nodes.push(o);
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 140;
    lfo.connect(lfoDepth).connect(lowpass.frequency);
    lfo.start(t);
    this.nodes.push(lfo);

    // Room tone: quiet filtered pink noise.
    const tone = ctx.createBufferSource();
    tone.buffer = pinkNoise(this.audio, 4);
    tone.loop = true;
    const toneFilter = ctx.createBiquadFilter();
    toneFilter.type = 'lowpass';
    toneFilter.frequency.value = 700;
    const toneGain = ctx.createGain();
    toneGain.gain.value = 0.22;
    tone.connect(toneFilter).connect(toneGain).connect(this.out);
    tone.start(t);
    this.nodes.push(tone);

    this.scheduleChime();
  }

  private scheduleChime(): void {
    if (!this.running) return;
    this.chimeTimer = setTimeout(
      () => {
        this.chime();
        this.scheduleChime();
      },
      chimeDelay(this.rnd) * 1000,
    );
  }

  private chime(): void {
    if (!this.running) return;
    const { ctx, reverbSend } = this.audio;
    const t = ctx.currentTime + 0.01;
    const f = CHIME_SCALE[Math.floor(this.rnd() * CHIME_SCALE.length)] ?? 440;
    const carrier = ctx.createOscillator();
    carrier.frequency.value = f;
    const mod = ctx.createOscillator();
    mod.frequency.value = f * 2.01;
    const modDepth = ctx.createGain();
    modDepth.gain.setValueAtTime(f * 0.6, t);
    modDepth.gain.exponentialRampToValueAtTime(1, t + 1.5);
    mod.connect(modDepth).connect(carrier.frequency);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.35, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 3);
    carrier.connect(env);
    env.connect(this.out);
    env.connect(reverbSend);
    carrier.start(t);
    mod.start(t);
    carrier.stop(t + 3.1);
    mod.stop(t + 3.1);
  }

  stop(fadeSeconds = 2): void {
    if (!this.running) return;
    this.running = false;
    if (this.chimeTimer !== null) clearTimeout(this.chimeTimer);
    const t = this.audio.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.out.gain.value, t);
    this.out.gain.linearRampToValueAtTime(0, t + fadeSeconds);
    for (const n of this.nodes) n.stop(t + fadeSeconds + 0.05);
    this.nodes = [];
  }

  duck(db: number, seconds: number): void {
    const g = this.out.gain;
    const t = this.audio.ctx.currentTime;
    const level = dbToGain(BED_DB);
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(level * dbToGain(db), t + 0.15);
    g.setValueAtTime(level * dbToGain(db), t + seconds);
    g.linearRampToValueAtTime(this.running ? level : 0, t + seconds + 0.8);
  }
}

/** Pink noise (Paul Kellet's filter) as a mono buffer. */
function pinkNoise(audio: AudioEngine, seconds: number): AudioBuffer {
  const white = audio.noiseBuffer(seconds, 23).getChannelData(0);
  const buffer = audio.ctx.createBuffer(1, white.length, audio.ctx.sampleRate);
  const out = buffer.getChannelData(0);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < white.length; i++) {
    const w = white[i] ?? 0;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    out[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
  }
  // Fade the loop seam (the buffer loops).
  const fade = Math.min(out.length, Math.round(audio.ctx.sampleRate * 0.05));
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    const end = out.length - fade + i;
    out[end] = (out[end] ?? 0) * (1 - k) + (out[i] ?? 0) * k;
  }
  return buffer;
}

/** Hum level at full strength. */
const HUM_LEVEL = 0.22;

/** The goal's spatial hum (CP09 T5). */
export class GoalHum implements GoalVoice {
  private readonly panner: PannerNode;
  private readonly level: GainNode;
  private nodes: AudioScheduledSourceNode[] = [];
  private audible = false;

  constructor(private readonly audio: AudioEngine) {
    const { ctx } = audio;
    this.panner = ctx.createPanner();
    this.panner.panningModel = 'HRTF';
    this.panner.distanceModel = 'inverse';
    this.panner.refDistance = 1;
    this.panner.rolloffFactor = 1.2;
    this.level = ctx.createGain();
    this.level.gain.value = 0;
    this.level.connect(this.panner).connect(audio.sfx);
  }

  start(): void {
    if (this.nodes.length > 0) return;
    const { ctx } = this.audio;
    const t = ctx.currentTime;
    const tremolo = ctx.createGain();
    tremolo.gain.value = 0.75;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.3;
    const depth = ctx.createGain();
    depth.gain.value = 0.25;
    lfo.connect(depth).connect(tremolo.gain);
    tremolo.connect(this.level);
    for (const [f, g] of [
      [220, 0.6],
      [330, 0.35],
    ] as const) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const gain = ctx.createGain();
      gain.gain.value = g;
      o.connect(gain).connect(tremolo);
      o.start(t);
      this.nodes.push(o);
    }
    lfo.start(t);
    this.nodes.push(lfo);
  }

  setSource(position: THREE.Vector3 | null, attenuationDb: number): void {
    const { ctx } = this.audio;
    const t = ctx.currentTime;
    if (position !== null && ![position.x, position.y, position.z].every(Number.isFinite)) {
      position = null; // Web Audio throws on NaN; treat a bad frame as "not seen".
    }
    if (position === null) {
      if (this.audible) this.level.gain.setTargetAtTime(0, t, 0.5 / 3); // ~0.5 s to silence
      this.audible = false;
      return;
    }
    // Positions jump with the listener at a door crossing, so they are set, not glided.
    const p = this.panner;
    if ('positionX' in p) {
      p.positionX.setValueAtTime(position.x, t);
      p.positionY.setValueAtTime(position.y, t);
      p.positionZ.setValueAtTime(position.z, t);
    } else {
      (p as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(
        position.x,
        position.y,
        position.z,
      );
    }
    this.level.gain.setTargetAtTime(HUM_LEVEL * dbToGain(attenuationDb), t, 0.08);
    this.audible = true;
  }

  stop(): void {
    const t = this.audio.ctx.currentTime;
    this.level.gain.setTargetAtTime(0, t, 0.15);
    for (const n of this.nodes) n.stop(t + 1);
    this.nodes = [];
    this.audible = false;
  }
}

/** Arpeggio of the completion stinger: a major triad plus the octave (Hz). */
export const STINGER_NOTES = [523.25, 659.25, 783.99, 1046.5];

/** The completion stinger (CP09 T6): a rising FM bell arpeggio; plays once. */
export class CompletionStinger implements Stinger {
  private played = false;

  constructor(
    private readonly audio: AudioEngine,
    private readonly bed: MusicBed | null,
  ) {}

  play(): void {
    if (this.played) return;
    this.played = true;
    this.bed?.duck(-12, 3);
    const { ctx, sfx, reverbSend } = this.audio;
    const t0 = ctx.currentTime + 0.01;
    STINGER_NOTES.forEach((f, i) => {
      const t = t0 + i * 0.11;
      const carrier = ctx.createOscillator();
      carrier.frequency.value = f;
      const mod = ctx.createOscillator();
      mod.frequency.value = f * 3.5;
      const index = ctx.createGain();
      index.gain.setValueAtTime(f * 2.2, t);
      index.gain.exponentialRampToValueAtTime(f * 0.05, t + 1.2);
      mod.connect(index).connect(carrier.frequency);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.3, t + 0.005);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
      carrier.connect(env);
      env.connect(sfx);
      env.connect(reverbSend);
      carrier.start(t);
      mod.start(t);
      carrier.stop(t + 2.3);
      mod.stop(t + 2.3);
    });
  }

  /** True once played (tests). */
  get hasPlayed(): boolean {
    return this.played;
  }
}
