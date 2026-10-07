/** UI state shared by the React overlay components. The engine itself never imports this. */
import type { RoomId } from '@ogm/shared';
import { create } from 'zustand';
import type { Engine } from '../engine/Engine.js';

export type AppStatus = 'booting' | 'home' | 'running' | 'unsupported' | 'error';

export interface UiState {
  status: AppStatus;
  /** Error text when `status` is `error`. */
  error: string | null;
  engine: Engine | null;
  room: RoomId | null;
  pointerLocked: boolean;
  setStatus(status: AppStatus, error?: string): void;
  setEngine(engine: Engine | null): void;
  setRoom(room: RoomId): void;
  setPointerLocked(locked: boolean): void;
}

export const useUiStore = create<UiState>()((set) => ({
  status: 'booting',
  error: null,
  engine: null,
  room: null,
  pointerLocked: false,
  setStatus: (status, error) => {
    set({ status, error: error ?? null });
  },
  setEngine: (engine) => {
    set({ engine });
  },
  setRoom: (room) => {
    set({ room });
  },
  setPointerLocked: (pointerLocked) => {
    set({ pointerLocked });
  },
}));
