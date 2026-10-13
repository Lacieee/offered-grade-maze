import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';

describe('loadConfig (CP07 T1)', () => {
  it('uses the documented defaults', () => {
    expect(loadConfig({})).toEqual({
      PORT: 8080,
      HOST: '0.0.0.0',
      DATABASE_URL: 'postgres://ogm:ogm@localhost:5432/ogm',
      LOG_LEVEL: 'info',
      DEBUG_VIEW_ENABLED: true,
      PREFETCH_RADIUS: 4,
      LEVEL_CACHE_SIZE: 100,
      RATE_LIMIT_ENABLED: true,
      CLIENT_DIST: '',
    });
  });

  it('parses numbers and booleans', () => {
    const c = loadConfig({ PORT: '9000', DEBUG_VIEW_ENABLED: 'false', RATE_LIMIT_ENABLED: '0' });
    expect(c.PORT).toBe(9000);
    expect(c.DEBUG_VIEW_ENABLED).toBe(false);
    expect(c.RATE_LIMIT_ENABLED).toBe(false);
  });

  it('rejects invalid values with every problem listed', () => {
    expect(() => loadConfig({ PORT: 'x', LOG_LEVEL: 'loud' })).toThrow(ConfigError);
    expect(() => loadConfig({ PORT: 'x', LOG_LEVEL: 'loud' })).toThrow(/PORT.*LOG_LEVEL/);
    expect(() => loadConfig({ DEBUG_VIEW_ENABLED: 'yes' })).toThrow(/DEBUG_VIEW_ENABLED/);
  });
});
