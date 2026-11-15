/**
 * The game's sound (CP09 T2–T6): one audio engine per game, created in the click that starts
 * play, driven by engine events every frame.
 */
import type * as THREE from 'three';
import type { EngineEvents, Unsubscribe } from '../../engine/Engine.js';
import { AudioEngine, type Volumes } from '../../engine/audio/AudioEngine.js';
import type { GoalSource } from '../../engine/audio/goalSource.js';
import {
  AmbientBed,
  CompletionStinger,
  FootstepSynth,
  GoalHum,
} from '../../engine/audio/voices.js';

/** What the sound needs from the engine. */
export interface AudioHost {
  on<K extends keyof EngineEvents>(event: K, cb: (payload: EngineEvents[K]) => void): Unsubscribe;
  getCamera(): THREE.Camera | null;
  getGoalSource(): GoalSource | null;
}

/** What the controller needs from the game sound. */
export interface GameSound {
  /** The pickup: completion stinger (once). */
  pickup(): void;
  /** Result screen: the music fades out over 2 s. */
  finish(): void;
  setVolumes(v: Volumes): void;
  dispose(): void;
}

declare global {
  interface Window {
    /** Dev only: sound state (e2e). */
    __ogmAudio?: {
      state(): string;
      footsteps(): number;
      stingers(): number;
      humAudible(): boolean;
    };
  }
}

export class GameAudio implements GameSound {
  private readonly offs: Unsubscribe[] = [];
  private readonly bed: AmbientBed;
  private readonly hum: GoalHum;
  private readonly steps: FootstepSynth;
  private readonly stinger: CompletionStinger;
  private footstepCount = 0;
  private humOn = false;

  /** Creates and starts the sound; null without Web Audio. Call inside the start click. */
  static start(host: AudioHost, volumes: Volumes): GameAudio | null {
    const audio = AudioEngine.create(volumes);
    return audio ? new GameAudio(host, audio) : null;
  }

  private constructor(
    host: AudioHost,
    private readonly audio: AudioEngine,
  ) {
    this.bed = new AmbientBed(audio);
    this.hum = new GoalHum(audio);
    this.steps = new FootstepSynth(audio);
    this.stinger = new CompletionStinger(audio, this.bed);
    this.bed.start();
    this.hum.start();
    this.offs.push(
      host.on('frame', () => {
        const camera = host.getCamera();
        if (camera) audio.updateListener(camera);
        const source = host.getGoalSource();
        this.hum.setSource(source?.position ?? null, source?.attenuationDb ?? 0);
        this.humOn = source !== null;
      }),
      host.on('footstep', ({ side, floor }) => {
        this.footstepCount++;
        this.steps.step(floor, side);
      }),
    );
    if (import.meta.env.DEV) {
      window.__ogmAudio = {
        state: () => audio.ctx.state,
        footsteps: () => this.footstepCount,
        stingers: () => (this.stinger.hasPlayed ? 1 : 0),
        humAudible: () => this.humOn,
      };
    }
  }

  pickup(): void {
    this.stinger.play();
    this.hum.stop();
  }

  finish(): void {
    this.bed.stop(2);
  }

  setVolumes(v: Volumes): void {
    this.audio.setVolumes(v);
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
    this.bed.stop(0.2);
    this.hum.stop();
    // Let the fades finish before closing the context.
    setTimeout(() => {
      this.audio.close();
    }, 400);
  }
}
