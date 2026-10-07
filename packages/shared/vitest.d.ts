import 'vitest';

declare module 'vitest' {
  /** Values provided by `vitest.config.ts` (`test.provide`). */
  export interface ProvidedContext {
    /** Number of runs for each property test (1 000 per commit, 10 000 nightly). */
    propRuns: number;
  }
}
