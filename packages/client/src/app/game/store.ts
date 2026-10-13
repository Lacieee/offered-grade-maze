/**
 * Game UI state (CP08 T5, T6). The controller writes it; screens read it. Per-frame values
 * (the timer) are not stored here, so nothing re-renders every frame.
 */
import type { Difficulty, ResultDTO } from '@ogm/shared';
import { create } from 'zustand';
import type { MessageKey } from '../i18n/index.js';

export type GamePhase =
  | 'title'
  | 'newGame'
  | 'loading'
  | 'ready'
  | 'playing'
  | 'completing'
  | 'result'
  | 'error'
  | 'unsupported';

export type NewGameTab = 'random' | 'seed';

export interface GameErrorInfo {
  key: MessageKey;
  /** Extra detail (server message), shown small. */
  detail?: string;
  /** What Retry does; null hides the button. */
  retry: (() => void) | null;
}

export interface GameState {
  phase: GamePhase;
  /** New game screen: active tab and the seed to prefill (`/?seed=`). */
  newGameTab: NewGameTab;
  seedInput: string;
  /** The current game. */
  gameId: string | null;
  seed: string | null;
  difficulty: Difficulty | null;
  /** `performance.now()` when the clock started (Ready click); null before. */
  startedAt: number | null;
  /** `performance.now()` at the pickup: the timer stops there. */
  stoppedAt: number | null;
  result: ResultDTO | null;
  error: GameErrorInfo | null;
  /** Transition requests have been failing for > 3 s. */
  reconnecting: boolean;
  /** The completion request failed at least once and is being retried. */
  savingRetry: boolean;
  /** The server rejected a crossing (the result is flagged). */
  desync: boolean;
  /** The debug view was opened in this game (CP10). */
  debugUsed: boolean;
  /** The settings screen is open over the current screen (CP09 T7). */
  settingsOpen: boolean;
}

export const INITIAL_GAME_STATE: GameState = {
  phase: 'title',
  newGameTab: 'random',
  seedInput: '',
  gameId: null,
  seed: null,
  difficulty: null,
  startedAt: null,
  stoppedAt: null,
  result: null,
  error: null,
  reconnecting: false,
  savingRetry: false,
  desync: false,
  debugUsed: false,
  settingsOpen: false,
};

export const useGame = create<GameState>()(() => ({ ...INITIAL_GAME_STATE }));

/** `mm:ss` (HUD). */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** `mm:ss.cc` (result screen). */
export function formatResultTime(ms: number): string {
  const cs = Math.floor(Math.max(0, ms) / 10) % 100;
  return `${formatClock(ms)}.${String(cs).padStart(2, '0')}`;
}
