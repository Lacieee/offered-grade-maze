#!/usr/bin/env node
/**
 * `pnpm gen …`: builds @ogm/generator (Turborepo, cached) and runs its CLI with the given
 * arguments. Build output is shown only when the build fails, so a broken or out-of-date
 * checkout never fails silently.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

// The generator depends on @ogm/shared (since CP04). If its workspace link is missing, the
// install is older than the lockfile.
if (!existsSync(join(root, 'packages/generator/node_modules/@ogm/shared'))) {
  console.error(
    'pnpm gen: dependencies are out of date (packages/generator has no @ogm/shared link).\n' +
      'Run `pnpm install` in the repository root, then try again.',
  );
  process.exit(1);
}

const build = spawnSync(
  join(root, 'node_modules/.bin/turbo'),
  ['run', 'build', '--filter=@ogm/generator', '--output-logs=errors-only'],
  { cwd: root, encoding: 'utf8' },
);
if (build.status !== 0) {
  process.stderr.write(build.stdout ?? '');
  process.stderr.write(build.stderr ?? '');
  if (build.error) console.error(build.error.message);
  console.error('pnpm gen: building @ogm/generator failed (see above).');
  process.exit(build.status ?? 1);
}

const cli = spawnSync(
  process.execPath,
  [join(root, 'packages/generator/dist/cli/main.js'), ...process.argv.slice(2)],
  { stdio: 'inherit' },
);
process.exit(cli.status ?? 1);
