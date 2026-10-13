/**
 * Player settings (CP09 T7), persisted as versioned JSON in `localStorage` (`ogm.settings`);
 * defaults on any parse failure. The language lives in `ogm.lang` (CP08 T6).
 */
import { create } from 'zustand';
import type { QualityMode } from '../../engine/Engine.js';

export const SETTINGS_STORAGE_KEY = 'ogm.settings';
export const SETTINGS_VERSION = 1;

export interface Settings {
  /** Multiplier of the default mouse sensitivity, 0.5–2.0. */
  sensitivity: number;
  invertY: boolean;
  /** Vertical field of view, 60–90°. */
  fov: number;
  headBob: boolean;
  /** Volumes, 0–100 %. */
  master: number;
  music: number;
  sfx: number;
  quality: QualityMode;
}

export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 1,
  invertY: false,
  fov: 75,
  headBob: true,
  master: 80,
  music: 60,
  sfx: 80,
  quality: 'auto',
};

const clampNum = (v: unknown, min: number, max: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

/** Settings from stored JSON: unknown or invalid fields fall back to their defaults. */
export function parseSettings(json: string | null): Settings {
  let raw: unknown;
  try {
    raw = json === null ? null : JSON.parse(json);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_SETTINGS };
  const r = raw as Record<string, unknown>;
  if (r.version !== SETTINGS_VERSION) return { ...DEFAULT_SETTINGS };
  const d = DEFAULT_SETTINGS;
  return {
    sensitivity: clampNum(r.sensitivity, 0.5, 2, d.sensitivity),
    invertY: bool(r.invertY, d.invertY),
    fov: clampNum(r.fov, 60, 90, d.fov),
    headBob: bool(r.headBob, d.headBob),
    master: clampNum(r.master, 0, 100, d.master),
    music: clampNum(r.music, 0, 100, d.music),
    sfx: clampNum(r.sfx, 0, 100, d.sfx),
    quality:
      r.quality === 'high' || r.quality === 'low' || r.quality === 'auto' ? r.quality : d.quality,
  };
}

/** The JSON stored for `s`. */
export function serializeSettings(s: Settings): string {
  return JSON.stringify({ version: SETTINGS_VERSION, ...s });
}

function load(): Settings {
  try {
    return parseSettings(
      typeof localStorage === 'undefined' ? null : localStorage.getItem(SETTINGS_STORAGE_KEY),
    );
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

interface SettingsState {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
}

function save(s: Settings): void {
  try {
    if (typeof localStorage !== 'undefined')
      localStorage.setItem(SETTINGS_STORAGE_KEY, serializeSettings(s));
  } catch {
    // Private mode: settings last for this page only.
  }
}

export const useSettings = create<SettingsState>()((set, get) => ({
  settings: load(),
  update: (patch) => {
    const settings = parseSettings(serializeSettings({ ...get().settings, ...patch }));
    save(settings);
    set({ settings });
  },
  reset: () => {
    save(DEFAULT_SETTINGS);
    set({ settings: { ...DEFAULT_SETTINGS } });
  },
}));
