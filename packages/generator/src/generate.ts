/**
 * `generateLevel(seedCode)`: deterministic, seed-reproducible house topology (CP04).
 */
import { parseSeed, type Difficulty } from '@ogm/shared';
import { rngFor } from './prng/index.js';
import { finalise } from './topology/finalise.js';
import { AttemptFailed } from './topology/model.js';
import { buildTopology } from './topology/steps.js';
import {
  GenerationError,
  InvalidSeedError,
  MAX_ATTEMPTS,
  type Level,
  type ValidationIssue,
} from './types.js';
import { validateLevel } from './validate/validate.js';

/** PRNG label of one step of one attempt. */
export function topologyLabel(attempt: number, step: number): string {
  return `topology#${attempt}/${step}`;
}

/** Outcome of one attempt, reported to {@link GenerateOptions.onAttempt}. */
export interface AttemptReport {
  attempt: number;
  ok: boolean;
  /** Why the attempt failed (empty when ok). */
  reason: string;
}

/** Options for {@link generateLevel}. */
export interface GenerateOptions {
  /** Called after each attempt (the CLI uses it for timing and retry statistics). */
  onAttempt?: (report: AttemptReport) => void;
}

/** Runs one attempt: build, finalise, validate. Returns the level or the failure reason. */
export function runAttempt(
  seed: string,
  difficulty: Difficulty,
  attempt: number,
): { level: Level; issues: ValidationIssue[] } | { level: null; reason: string } {
  try {
    const draft = buildTopology(difficulty, (step) => rngFor(seed, topologyLabel(attempt, step)));
    const level = finalise(
      rngFor(seed, topologyLabel(attempt, 12)),
      draft,
      seed,
      difficulty,
      attempt,
    );
    return { level, issues: validateLevel(level) };
  } catch (e) {
    if (e instanceof AttemptFailed) return { level: null, reason: e.message };
    throw e;
  }
}

/**
 * Generates the level for a seed code. Typed seeds are accepted (see `parseSeed`); the level
 * carries the canonical form. Retries with the next attempt label up to 64 times.
 *
 * @throws InvalidSeedError if the seed cannot be parsed or its version is unsupported.
 * @throws GenerationError if all 64 attempts fail.
 */
export function generateLevel(seedCode: string, options: GenerateOptions = {}): Level {
  const parsed = parseSeed(seedCode);
  if (!parsed.ok) throw new InvalidSeedError(seedCode, parsed.error);
  const { canonical, difficulty } = parsed.seed;

  const failures: string[] = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = runAttempt(canonical, difficulty, attempt);
    let reason: string;
    if (result.level === null) reason = result.reason;
    else if (result.issues.length > 0) {
      reason = result.issues.map((i) => `${i.check}: ${i.message}`).join('; ');
    } else {
      options.onAttempt?.({ attempt, ok: true, reason: '' });
      return result.level;
    }
    failures.push(reason);
    options.onAttempt?.({ attempt, ok: false, reason });
  }
  throw new GenerationError(canonical, failures);
}
