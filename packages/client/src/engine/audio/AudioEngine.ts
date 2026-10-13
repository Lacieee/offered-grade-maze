/**
 * The audio graph (CP09 T2). Everything is synthesised with the Web Audio API.
 *
 *   music bus ─┐
 *              ├─► master ─► compressor ─► destination
 *   sfx bus ───┘      ▲
 *   reverb send ─► convolver (1.8 s generated impulse response)
 */
import type * as THREE from 'three';

/** Gain for a 0–100 % volume slider (squared: perceptually even steps). */
export function volumeGain(percent: number): number {
  const p = Math.min(100, Math.max(0, percent)) / 100;
  return p * p;
}

/** Decibels to a gain factor. */
export function dbToGain(db: number): number {
  return 10 ** (db / 20);
}

/** Deterministic noise (mulberry32) so the impulse response is the same every time. */
export function noise(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stereo decaying-noise impulse response samples: `seconds` long, −60 dB at the end. */
export function impulseSamples(
  sampleRate: number,
  seconds = 1.8,
  seed = 7,
): [Float32Array, Float32Array] {
  const length = Math.max(1, Math.round(sampleRate * seconds));
  const channels: [Float32Array, Float32Array] = [
    new Float32Array(length),
    new Float32Array(length),
  ];
  channels.forEach((data, c) => {
    const rnd = noise(seed + c);
    for (let i = 0; i < length; i++) {
      // Exponential decay reaching 1/1000 (−60 dB) at the end; a short fade-in avoids a click.
      const decay = Math.exp((-6.9 * i) / length);
      const fadeIn = Math.min(1, i / (sampleRate * 0.004));
      data[i] = (rnd() * 2 - 1) * decay * fadeIn;
    }
  });
  return channels;
}

/** Volumes in percent (settings). */
export interface Volumes {
  master: number;
  music: number;
  sfx: number;
}

type AudioContextCtor = new () => AudioContext;

/** The browser's AudioContext constructor (Safari's prefixed one as a fallback). */
export function audioContextClass(): AudioContextCtor | null {
  const w = globalThis as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export class AudioEngine {
  readonly master: GainNode;
  readonly music: GainNode;
  readonly sfx: GainNode;
  /** Send here for reverb. */
  readonly reverbSend: GainNode;
  private readonly compressor: DynamicsCompressorNode;
  private readonly reverb: ConvolverNode;

  /**
   * Creates the graph on a new AudioContext and resumes it. Call inside the click that starts
   * the game: browsers block audio before a user gesture. Null without Web Audio.
   */
  static create(volumes: Volumes): AudioEngine | null {
    const Ctor = audioContextClass();
    if (!Ctor) return null;
    try {
      const engine = new AudioEngine(new Ctor(), volumes);
      void engine.ctx.resume().catch(() => undefined);
      return engine;
    } catch {
      return null;
    }
  }

  constructor(
    readonly ctx: AudioContext,
    volumes: Volumes,
  ) {
    this.compressor = ctx.createDynamicsCompressor();
    // Soft: catches peaks (stinger over music), never pumps.
    this.compressor.threshold.value = -14;
    this.compressor.knee.value = 12;
    this.compressor.ratio.value = 3;
    this.compressor.attack.value = 0.01;
    this.compressor.release.value = 0.25;
    this.compressor.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.connect(this.compressor);
    this.music = ctx.createGain();
    this.music.connect(this.master);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);

    this.reverb = ctx.createConvolver();
    const [left, right] = impulseSamples(ctx.sampleRate);
    const ir = ctx.createBuffer(2, left.length, ctx.sampleRate);
    ir.getChannelData(0).set(left);
    ir.getChannelData(1).set(right);
    this.reverb.buffer = ir;
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.6;
    this.reverbSend.connect(this.reverb);
    this.reverb.connect(this.master);

    this.setVolumes(volumes, 0);
  }

  /** Current audio time (s). */
  get now(): number {
    return this.ctx.currentTime;
  }

  /** Applies volumes (smoothly, so dragging a slider does not click). */
  setVolumes(v: Volumes, glide = 0.05): void {
    const t = this.ctx.currentTime;
    const set = (param: AudioParam, value: number) => {
      if (glide <= 0) param.value = value;
      else param.setTargetAtTime(value, t, glide);
    };
    set(this.master.gain, volumeGain(v.master));
    set(this.music.gain, volumeGain(v.music));
    set(this.sfx.gain, volumeGain(v.sfx));
  }

  /** The listener follows the camera (position and orientation), every frame. */
  updateListener(camera: THREE.Camera): void {
    const l = this.ctx.listener;
    const e = camera.matrixWorld.elements;
    const [px, py, pz] = [e[12], e[13], e[14]];
    // Forward is −Z of the camera, up is +Y.
    const [fx, fy, fz] = [-e[8], -e[9], -e[10]];
    const [ux, uy, uz] = [e[4], e[5], e[6]];
    if ('positionX' in l) {
      const t = this.ctx.currentTime;
      l.positionX.setValueAtTime(px, t);
      l.positionY.setValueAtTime(py, t);
      l.positionZ.setValueAtTime(pz, t);
      l.forwardX.setValueAtTime(fx, t);
      l.forwardY.setValueAtTime(fy, t);
      l.forwardZ.setValueAtTime(fz, t);
      l.upX.setValueAtTime(ux, t);
      l.upY.setValueAtTime(uy, t);
      l.upZ.setValueAtTime(uz, t);
    } else {
      // Older Safari.
      const legacy = l as unknown as {
        setPosition(x: number, y: number, z: number): void;
        setOrientation(...v: number[]): void;
      };
      legacy.setPosition(px, py, pz);
      legacy.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }

  /** A mono white-noise buffer (shared by voices). */
  noiseBuffer(seconds: number, seed: number): AudioBuffer {
    const length = Math.round(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    const rnd = noise(seed);
    for (let i = 0; i < length; i++) data[i] = rnd() * 2 - 1;
    return buffer;
  }

  /** Closes the context (end of a game). */
  close(): void {
    void this.ctx.close().catch(() => undefined);
  }
}
