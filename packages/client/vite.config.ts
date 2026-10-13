import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * `@ogm/shared` is resolved to its TypeScript source, so `pnpm --filter @ogm/client dev`
 * works without building `shared` first and edits to it hot-reload.
 */
export const sharedAlias = {
  '@ogm/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
};

export default defineConfig({
  plugins: [react()],
  resolve: { alias: sharedAlias },
  server: {
    port: 5173,
    strictPort: false,
    // The API (CP07) runs on :8080 (`pnpm --filter @ogm/server start` or `pnpm start:local`).
    proxy: { '/api': process.env.OGM_API_URL ?? 'http://localhost:8080' },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    // three.js alone is ~700 kB minified; the 600 kB gzipped budget is checked in CP10.
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      onwarn(warning, warn) {
        // zod ships comments Rollup cannot place; harmless, but noisy in every build.
        if (warning.code === 'INVALID_ANNOTATION' && warning.id?.includes('node_modules')) return;
        warn(warning);
      },
    },
  },
});
