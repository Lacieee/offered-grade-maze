/**
 * @ogm/generator — deterministic, server-only level generator.
 *
 * Never imported by the client. Integer maths only; all randomness comes from `rngFor`.
 */
export * from './prng/index.js';
export * from './types.js';
export * from './difficulty/table.js';
export { generateLevel, runAttempt, topologyLabel } from './generate.js';
export type { AttemptReport, GenerateOptions } from './generate.js';
export { validateLevel } from './validate/validate.js';
export { checkDepthInvariants } from './validate/invariants.js';
export { computeMetrics, type MetricsInput } from './metrics/metrics.js';
export { canonicalJson, levelHash, type HashedLevel, type Json } from './hash/canonical.js';
export { sha256Hex, utf8 } from './hash/sha256.js';
