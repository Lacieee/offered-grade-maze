import { defineConfig } from 'vitest/config';
import { sharedAlias } from './vite.config.js';

export default defineConfig({
  resolve: { alias: sharedAlias },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: true,
  },
});
