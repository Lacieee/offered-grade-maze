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
import { useGame } from './game/store.js';

export interface AutopilotApi {
  /** Walks to the goal along the debug view's path; see {@link Autopilot.followPath}. */
  followPath(from?: 'current' | 'start'): Promise<AutopilotResult>;
  stop(): void;
  /** Why the last walk ended (`completed`, or where and why it got stuck). */
  lastStop(): string;
  /**
   * The performance walk (CP10 B1): plays `seed` with the autopilot again and again for
   * `seconds`, starting a new game of the same seed after each result. Resolves with the
   * number of completed games, or rejects if a walk gets stuck.
   */
  tour(seconds?: number, seed?: string): Promise<number>;
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
    tour: async (seconds = 180, seed = 'H1-7K2Q-X9MP') => {
      const until = performance.now() + seconds * 1000;
      const timeUp = () => performance.now() >= until;
      const timer = setTimeout(() => {
        pilot.stop();
      }, seconds * 1000);
      let completed = 0;
      try {
        while (!timeUp()) {
          if (useGame.getState().phase !== 'playing') {
            await game.newGame({ mode: 'seed', seed });
            if (useGame.getState().phase !== 'ready')
              throw new Error('tour: the game did not load');
            game.begin();
          }
          const result = await pilot.followPath();
          if (timeUp()) break;
          if (result !== 'completed') throw new Error(`tour: stuck (${pilot.lastStop})`);
          completed++;
          // Let the pickup and the result screen play.
          while (useGame.getState().phase === 'completing') {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        }
      } finally {
        clearTimeout(timer);
      }
      return completed;
    },
  };
}
