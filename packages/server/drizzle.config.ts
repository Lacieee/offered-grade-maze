import { defineConfig } from 'drizzle-kit';

/** `pnpm --filter @ogm/server db:generate` writes SQL migrations to `drizzle/`. */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
});
