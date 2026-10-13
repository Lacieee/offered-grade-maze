import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings, serializeSettings } from './settings.js';

describe('settings (CP09 T7)', () => {
  it('defaults: 1.0× sensitivity, no invert, 75° FOV, head bob on, 80/60/80 %, auto quality', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      sensitivity: 1,
      invertY: false,
      fov: 75,
      headBob: true,
      master: 80,
      music: 60,
      sfx: 80,
      quality: 'auto',
    });
  });

  it('round-trips through versioned JSON', () => {
    const s = { ...DEFAULT_SETTINGS, fov: 88, invertY: true, music: 12, quality: 'low' as const };
    const json = serializeSettings(s);
    expect(JSON.parse(json)).toMatchObject({ version: 1 });
    expect(parseSettings(json)).toEqual(s);
  });

  it('falls back to defaults on bad JSON, another version, or invalid fields', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{not json')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('[]')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(JSON.stringify({ version: 99, fov: 80 }))).toEqual(DEFAULT_SETTINGS);
    const s = parseSettings(
      JSON.stringify({
        version: 1,
        fov: 200,
        sensitivity: 0.1,
        master: -5,
        headBob: 'yes',
        quality: 'ultra',
      }),
    );
    expect(s).toMatchObject({
      fov: 90,
      sensitivity: 0.5,
      master: 0,
      headBob: true,
      quality: 'auto',
    });
  });
});
