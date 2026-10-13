import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { dbToGain, impulseSamples, listenerPose, volumeGain } from './AudioEngine.js';
import { CHIME_SCALE, FLOORS, STINGER_NOTES, chimeDelay } from './voices.js';

describe('audio building blocks (CP09 T2–T6)', () => {
  it('volume sliders map 0–100 % to gain 0–1, perceptually (squared)', () => {
    expect(volumeGain(0)).toBe(0);
    expect(volumeGain(100)).toBe(1);
    expect(volumeGain(50)).toBeCloseTo(0.25);
    expect(volumeGain(150)).toBe(1);
    expect(dbToGain(-24)).toBeCloseTo(0.063, 3);
    expect(dbToGain(-12)).toBeCloseTo(0.251, 3);
  });

  it('listener pose from the camera; null for a non-finite matrix (Web Audio throws on NaN)', () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(1, 1.6, -2);
    camera.rotation.set(0, Math.PI / 2, 0); // facing −X
    camera.updateMatrixWorld();
    const pose = listenerPose(camera.matrixWorld);
    expect(pose?.position).toEqual([1, 1.6, -2]);
    expect(pose?.forward[0]).toBeCloseTo(-1, 9);
    expect(pose?.up[1]).toBeCloseTo(1, 9);
    camera.position.x = Number.NaN;
    camera.updateMatrixWorld();
    expect(listenerPose(camera.matrixWorld)).toBeNull();
  });

  it('reverb impulse: 1.8 s stereo decaying noise, about −60 dB at the end, deterministic', () => {
    const [l, r] = impulseSamples(8000);
    expect(l.length).toBe(14400);
    expect(r.length).toBe(14400);
    const rms = (a: Float32Array, from: number, to: number) => {
      let s = 0;
      for (let i = from; i < to; i++) s += (a[i] ?? 0) ** 2;
      return Math.sqrt(s / (to - from));
    };
    const head = rms(l, 100, 900);
    const tail = rms(l, 13500, 14400);
    expect(20 * Math.log10(tail / head)).toBeLessThan(-45);
    expect(Math.abs(l[0] ?? 1)).toBe(0); // fades in, no click
    expect(impulseSamples(8000)[0]).toEqual(l);
    expect(l).not.toEqual(r);
  });

  it('floors sound different: wood band-pass 450 Hz, tile 1.8 kHz brighter, carpet low-pass 600 Hz 6 dB quieter', () => {
    expect(FLOORS.wood).toMatchObject({ filter: 'bandpass', freq: 450, q: 1.2, db: 0 });
    expect(FLOORS.tile).toMatchObject({ filter: 'bandpass', freq: 1800 });
    expect(FLOORS.tile.attack).toBeLessThan(FLOORS.wood.attack);
    expect(FLOORS.carpet).toMatchObject({ filter: 'lowpass', freq: 600, db: -6 });
    expect(FLOORS.carpet.decay).toBeGreaterThan(FLOORS.wood.decay);
    for (const f of Object.values(FLOORS)) {
      expect(f.decay).toBeGreaterThanOrEqual(0.06);
      expect(f.decay).toBeLessThanOrEqual(0.12);
    }
  });

  it('chimes every 6–14 s from a whole-tone scale; stinger: major triad plus octave', () => {
    expect(chimeDelay(() => 0)).toBe(6);
    expect(chimeDelay(() => 0.999999)).toBeCloseTo(14, 3);
    for (let i = 1; i < CHIME_SCALE.length; i++) {
      const ratio = (CHIME_SCALE[i] ?? 0) / (CHIME_SCALE[i - 1] ?? 1);
      expect(12 * Math.log2(ratio)).toBeCloseTo(2, 1); // whole tones
    }
    const [root = 1, third = 0, fifth = 0, octave = 0] = STINGER_NOTES;
    expect(12 * Math.log2(third / root)).toBeCloseTo(4, 1);
    expect(12 * Math.log2(fifth / root)).toBeCloseTo(7, 1);
    expect(octave / root).toBeCloseTo(2, 3);
  });
});
