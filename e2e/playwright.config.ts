import { defineConfig, devices } from '@playwright/test';

const PORT = 5174;
const CI = Boolean(process.env.CI);
/**
 * `E2E_API=1` also runs `api.spec.ts` against the real server (CP08): it starts the built
 * server on :8090 (needs `pnpm build` and PostgreSQL, `pnpm db:up`) and Vite proxies `/api`
 * to it.
 */
const API = process.env.E2E_API === '1';
const API_PORT = 8090;
const DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://ogm:ogm@localhost:5432/ogm';

/**
 * Playwright on the fixture house (CP03 T7). Chromium renders WebGL2 in software with
 * SwiftShader, so screenshots are deterministic but slow; tests run one at a time.
 *
 * Visual baselines are stored per platform (`-linux`, `-darwin`); a missing baseline is
 * written on the first run. `PW_CHROMIUM_PATH` points at a preinstalled Chromium if needed.
 */
export default defineConfig({
  testDir: './tests',
  testIgnore: API
    ? []
    : [
        '**/api.spec.ts',
        '**/playthrough.spec.ts',
        '**/seed-replay.spec.ts',
        '**/debug.spec.ts',
        '**/release.spec.ts',
      ],
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}-{platform}{ext}',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  forbidOnly: CI,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  updateSnapshots: 'missing',
  expect: {
    timeout: 15_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, threshold: 0.2, animations: 'disabled' },
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 960, height: 540 },
    deviceScaleFactor: 1,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 960, height: 540 },
        deviceScaleFactor: 1,
        launchOptions: {
          executablePath: process.env.PW_CHROMIUM_PATH,
          args: [
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
            '--ignore-gpu-blocklist',
          ],
        },
      },
    },
  ],
  webServer: [
    {
      command: `pnpm --filter @ogm/client exec vite --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}/`,
      reuseExistingServer: !CI,
      timeout: 120_000,
      env: { OGM_API_URL: `http://localhost:${API_PORT}` },
    },
    ...(API
      ? [
          {
            command: 'node ../packages/server/dist/main.js',
            url: `http://localhost:${API_PORT}/api/v1/health`,
            reuseExistingServer: !CI,
            timeout: 60_000,
            env: {
              PORT: String(API_PORT),
              DATABASE_URL,
              LOG_LEVEL: 'warn',
              RATE_LIMIT_ENABLED: 'false',
            },
          },
        ]
      : []),
  ],
});
