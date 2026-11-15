import { defineConfig } from '@playwright/test';

/**
 * The CP10 B1 performance walk: `pnpm perf:walk` against the running product
 * (`pnpm start:local`, http://localhost:8080) in a real browser on the reference machine.
 *
 * - `PERF_URL` (default http://localhost:8080), `PERF_CHANNEL` (default `chrome`; `msedge`
 *   for Edge; empty for the bundled Chromium), `PERF_SECONDS` (default 180).
 * - Results are written to `e2e/perf-results/` and printed. Safari cannot be driven by
 *   Playwright: see docs/release/browser-checklist.md for the manual walk.
 */
const channel = process.env.PERF_CHANNEL ?? 'chrome';

export default defineConfig({
  testDir: './perf',
  workers: 1,
  retries: 0,
  timeout: 30 * 60_000,
  reporter: 'list',
  use: {
    baseURL: process.env.PERF_URL ?? 'http://localhost:8080',
    headless: process.env.PERF_HEADLESS === '1',
    viewport: null,
    ...(channel ? { channel } : {}),
    launchOptions: {
      args: [
        '--start-maximized',
        // Machines without a GPU (CI, the cloud sandbox): software WebGL. Not for real numbers.
        ...(process.env.PERF_SWIFTSHADER === '1'
          ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
          : []),
      ],
      ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}),
    },
  },
});
