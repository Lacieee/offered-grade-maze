#!/usr/bin/env node
/**
 * Guards the generator determinism lint rule (CP01 acceptance): code that uses a banned
 * API inside packages/generator/src must fail `pnpm lint`. Each probe is linted as if it
 * were appended to a real generator source file; every probe must produce an error from
 * the expected rule. Exits non-zero if any probe slips through.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const root = fileURLToPath(new URL('..', import.meta.url));
const target = fileURLToPath(new URL('../packages/generator/src/index.ts', import.meta.url));
const base = readFileSync(target, 'utf8');

/** [description, appended code, expected rule] */
const probes = [
  ['Math.random()', 'export const r = Math.random();', 'no-restricted-properties'],
  ['Math.sqrt()', 'export const r = Math.sqrt(2);', 'no-restricted-properties'],
  ['Math.sin()', 'export const r = Math.sin(1);', 'no-restricted-properties'],
  ['Date.now()', 'export const r = Date.now();', 'no-restricted-globals'],
  ['new Date()', 'export const r = new Date();', 'no-restricted-globals'],
  ['performance.now()', 'export const r = performance.now();', 'no-restricted-globals'],
  [
    'crypto.getRandomValues()',
    'export const r = crypto.getRandomValues(new Uint8Array(4));',
    'no-restricted-properties',
  ],
  ['** operator', 'export const r = 2 ** 8;', 'no-restricted-syntax'],
  ["import 'node:crypto'", "export { randomBytes } from 'node:crypto';", 'no-restricted-imports'],
];

const eslint = new ESLint({ cwd: root });
let failed = 0;
for (const [name, code, rule] of probes) {
  const [result] = await eslint.lintText(`${base}\n${code}\n`, { filePath: target });
  const hit = result?.messages.some((m) => m.ruleId === rule && m.severity === 2) ?? false;
  if (!hit) {
    failed++;
    console.error(`✗ ${name} in packages/generator was NOT rejected by ${rule}`);
  }
}

if (failed > 0) {
  console.error(`Determinism lint guard: ${failed} of ${probes.length} probes slipped through.`);
  process.exit(1);
}
console.log(
  `Determinism lint guard: all ${probes.length} banned APIs rejected in packages/generator.`,
);
