import { defineConfig, devices } from '@playwright/test';

const PORT = 5174;
const CI = Boolean(process.env.CI);

/**
 * Playwright on the fixture house (CP03 T7). Chromium renders WebGL2 in software with
 * SwiftShader, so screenshots are deterministic but slow; tests run one at a time.
 *
 * Visual baselines are stored per platform (`-linux`, `-darwin`); a missing baseline is
 * written on the first run. `PW_CHROMIUM_PATH` points at a preinstalled Chromium if needed.
 */
export default defineConfig({
  testDir: './tests',
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
  webServer: {
    command: `pnpm --filter @ogm/client exec vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !CI,
    timeout: 120_000,
  },
});
