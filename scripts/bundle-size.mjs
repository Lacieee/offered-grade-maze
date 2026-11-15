#!/usr/bin/env node
/**
 * `pnpm size` (CP10 B1): the client's JavaScript, gzipped, must stay at or below 600 kB.
 * Run after `pnpm build`. Prints every chunk and the total; exits 1 above the budget.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const BUDGET_KB = 600;
const dir = fileURLToPath(new URL('../packages/client/dist/assets', import.meta.url));

let files;
try {
  files = readdirSync(dir).filter((f) => f.endsWith('.js'));
} catch {
  console.error(`pnpm size: ${dir} not found. Run \`pnpm build\` first.`);
  process.exit(1);
}

let total = 0;
for (const f of files.sort()) {
  const bytes = gzipSync(readFileSync(join(dir, f)), { level: 9 }).length;
  total += bytes;
  console.log(`${(bytes / 1000).toFixed(1).padStart(8)} kB  ${f}`);
}
const kb = total / 1000;
console.log(`${kb.toFixed(1).padStart(8)} kB  total (gzip), budget ${String(BUDGET_KB)} kB`);
if (kb > BUDGET_KB) {
  console.error(
    `pnpm size: the JavaScript bundle is over budget by ${(kb - BUDGET_KB).toFixed(1)} kB.`,
  );
  process.exit(1);
}
