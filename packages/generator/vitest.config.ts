import { defineConfig } from 'vitest/config';

/** Property-test run count: 1 000 on every commit, 10 000 with `pnpm test:prop`. */
export default defineConfig(({ mode }) => ({
  test: {
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
    provide: { propRuns: mode === 'prop' ? 10_000 : 1_000 },
    testTimeout: mode === 'prop' ? 300_000 : 60_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/__fixtures__/**', 'src/cli/**'],
      reporter: ['text', 'text-summary', 'html'],
      thresholds: { lines: 90 },
    },
  },
}));
