/**
 * Server configuration from the environment (CP07 T1), validated with Zod at start.
 */
import { z } from 'zod';

const bool = (fallback: boolean) =>
  z
    .enum(['true', 'false', '1', '0'])
    .default(fallback ? 'true' : 'false')
    .transform((v) => v === 'true' || v === '1');

const ConfigSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  /** Listen address; `0.0.0.0` inside Docker. */
  HOST: z.string().min(1).default('0.0.0.0'),
  DATABASE_URL: z.url().default('postgres://ogm:ogm@localhost:5432/ogm'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** PD6: the debug view stays enabled in release builds. */
  DEBUG_VIEW_ENABLED: bool(true),
  /** Door hops streamed ahead of the player. */
  PREFETCH_RADIUS: z.coerce.number().int().min(1).max(8).default(4),
  /** Levels kept in the LRU cache. */
  LEVEL_CACHE_SIZE: z.coerce.number().int().min(1).max(10_000).default(100),
  /** Can be disabled for local load tests. */
  RATE_LIMIT_ENABLED: bool(true),
  /**
   * Directory of the built client (`packages/client/dist`). Empty: resolved next to this
   * package; served only if it exists.
   */
  CLIENT_DIST: z.string().default(''),
});

/** Validated server configuration. */
export type Config = z.infer<typeof ConfigSchema>;

/** Thrown when an environment variable is invalid; the message lists every problem. */
export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

/**
 * Reads the configuration from `env` (default `process.env`).
 *
 * @throws ConfigError if a variable is invalid.
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new ConfigError(`Invalid configuration: ${problems.join('; ')}`);
  }
  return parsed.data;
}
