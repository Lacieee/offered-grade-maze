/**
 * The autopilot's console API (CP10 A3). Dev and test builds expose it as part of
 * `window.__ogm`; release builds expose only this, and only with `?autopilot=1` (for live
 * demonstrations and the performance walk, CP10 B1).
 */
import {
  Autopilot,
  type AutopilotHost,
  type AutopilotResult,
} from '../engine/autopilot/Autopilot.js';
import type { GameController } from './game/controller.js';

export interface AutopilotApi {
  /** Walks to the goal along the debug view's path; see {@link Autopilot.followPath}. */
  followPath(from?: 'current' | 'start'): Promise<AutopilotResult>;
  stop(): void;
  /** Why the last walk ended (`completed`, or where and why it got stuck). */
  lastStop(): string;
}

/** The release build's `window.__ogm` with `?autopilot=1`. */
export interface ReleaseHook {
  autopilot: AutopilotApi;
}

/** An autopilot for this engine and game, as a console API. */
export function createAutopilotApi(engine: AutopilotHost, game: GameController): AutopilotApi {
  const pilot = new Autopilot(engine, () => game.debug());
  return {
    followPath: (from = 'current') => pilot.followPath(from),
    stop: () => {
      pilot.stop();
    },
    lastStop: () => pilot.lastStop,
  };
}
