/**
 * In-memory LRU of generated levels (CP07 T3), keyed by canonical seed code. A level is only
 * cached and served after it passed the validator.
 */
import { generateLevel, validateLevel, type Level } from '@ogm/generator';

/** A level and how it was obtained. */
export interface CachedLevel {
  level: Level;
  /** True when served from the cache. */
  hit: boolean;
  /** Generation time (ms); 0 on a hit. */
  generationMs: number;
}

/** Thrown when a generated level fails validation (it is never cached or served). */
export class InvalidLevelError extends Error {
  override readonly name = 'InvalidLevelError';
  constructor(
    readonly seed: string,
    readonly issues: readonly string[],
  ) {
    super(`Generated level for ${seed} failed validation: ${issues.join('; ')}`);
  }
}

export class LevelCache {
  private readonly levels = new Map<string, Level>();

  constructor(
    readonly capacity: number,
    private readonly generate: (seed: string) => Level = generateLevel,
    private readonly validate: (
      level: Level,
    ) => readonly { check: string; message: string }[] = validateLevel,
  ) {}

  /** Number of cached levels. */
  get size(): number {
    return this.levels.size;
  }

  /**
   * The level of a canonical seed code, generating and validating it on a miss.
   *
   * @throws InvalidSeedError / GenerationError from the generator, InvalidLevelError.
   */
  get(seed: string): CachedLevel {
    const cached = this.levels.get(seed);
    if (cached !== undefined) {
      // Refresh recency: Map iteration order is insertion order.
      this.levels.delete(seed);
      this.levels.set(seed, cached);
      return { level: cached, hit: true, generationMs: 0 };
    }
    const t0 = performance.now();
    const level = this.generate(seed);
    const issues = this.validate(level);
    if (issues.length > 0) {
      throw new InvalidLevelError(
        seed,
        issues.map((i) => `${i.check}: ${i.message}`),
      );
    }
    const generationMs = performance.now() - t0;
    this.levels.set(level.seed, level);
    while (this.levels.size > this.capacity) {
      const oldest = this.levels.keys().next();
      if (oldest.done === true) break;
      this.levels.delete(oldest.value);
    }
    return { level, hit: false, generationMs };
  }
}
