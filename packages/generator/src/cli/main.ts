#!/usr/bin/env node
/**
 * `pnpm gen` — generator CLI (CP04 T9). Not generation logic: it may use Node crypto for
 * fresh seeds and performance timers for statistics (ESLint override, ADR-0005).
 *
 *   pnpm gen random --difficulty hard
 *   pnpm gen show <seed>
 *   pnpm gen validate <seed>
 *   pnpm gen dump <seed> --json out.json --svg out.svg
 *   pnpm gen sweep --difficulty <d> --count 10000 [--from 0]
 *   pnpm gen golden [--write]
 */
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { DIFFICULTIES, formatSeed, type Difficulty } from '@ogm/shared';
import { counterSeed, goldenSeeds } from './seeds.js';
import { generateLevel } from '../generate.js';
import {
  GENERATOR_VERSION,
  GenerationError,
  InvalidSeedError,
  type Level,
  type LevelMetrics,
} from '../types.js';
import { validateLevel } from '../validate/validate.js';
import { checkDepthInvariants } from '../validate/invariants.js';
import { histogram, issuesText, metricsLine, percentile, summary } from './report.js';
import { levelSvg } from './svg.js';

const USAGE = `Usage: pnpm gen <command> [options]

  random   --difficulty <easy|medium|hard>     new random seed and its summary
  show     <seed>                              summary: rooms, depths, links, metrics
  validate <seed>                              validator issues, or "valid"
  dump     <seed> [--json <file>] [--svg <file>]
  sweep    --difficulty <d> [--count 10000] [--from 0]
  golden   [--write]                           golden seeds and hashes (test/golden.json)`;

/** Paths are relative to where the user ran `pnpm gen`, not the repository root. */
function userPath(p: string): string {
  return resolve(process.env.INIT_CWD ?? process.cwd(), p);
}

function difficultyOf(value: string | undefined): Difficulty {
  const d = DIFFICULTIES.find((x) => x === value);
  if (d === undefined) throw new UsageError('--difficulty must be easy, medium or hard');
  return d;
}

class UsageError extends Error {}

/** Generates with timing. */
function timed(seed: string): { level: Level; ms: number } {
  const t0 = performance.now();
  const level = generateLevel(seed);
  return { level, ms: performance.now() - t0 };
}

function sweep(d: Difficulty, count: number, from: number): number {
  const levelMs: number[] = [];
  const attemptMs: number[] = [];
  const reasons = new Map<string, number>();
  const metrics = new Map<string, number[]>();
  let invalid = 0;
  let retried = 0;
  let attempts = 0;
  let errors = 0;
  for (let n = from; n < from + count; n++) {
    const seed = counterSeed(d, n);
    let last = performance.now();
    const t0 = last;
    try {
      const level = generateLevel(seed, {
        onAttempt: (r) => {
          const now = performance.now();
          attemptMs.push(now - last);
          last = now;
          attempts++;
          if (!r.ok) {
            const key = r.reason.replace(/\d+/g, '#').slice(0, 90);
            reasons.set(key, (reasons.get(key) ?? 0) + 1);
          }
        },
      });
      levelMs.push(performance.now() - t0);
      if (level.meta.attempts > 1) retried++;
      if (validateLevel(level).length > 0 || checkDepthInvariants(level).length > 0) invalid++;
      const m = level.meta.metrics;
      for (const k of Object.keys(m) as (keyof LevelMetrics)[]) {
        const list = metrics.get(k) ?? [];
        list.push(m[k]);
        metrics.set(k, list);
      }
    } catch (e) {
      if (!(e instanceof GenerationError)) throw e;
      errors++;
      console.error(`GenerationError ${seed}`);
    }
  }
  levelMs.sort((a, b) => a - b);
  attemptMs.sort((a, b) => a - b);
  const pct = (x: number): string => `${((100 * x) / count).toFixed(2)} %`;
  console.log(`sweep ${d}: ${count} seeds from ${counterSeed(d, from)}`);
  console.log(`  invalid levels     ${invalid}`);
  console.log(`  generation errors  ${errors}`);
  console.log(`  retried levels     ${retried} (${pct(retried)})  attempts ${attempts}`);
  console.log(
    `  ms per level       p50 ${percentile(levelMs, 50).toFixed(2)}  p95 ${percentile(levelMs, 95).toFixed(2)}  max ${(levelMs.at(-1) ?? 0).toFixed(2)}`,
  );
  console.log(
    `  ms per attempt     p50 ${percentile(attemptMs, 50).toFixed(2)}  p95 ${percentile(attemptMs, 95).toFixed(2)}`,
  );
  if (reasons.size > 0) {
    console.log('  failed attempts:');
    for (const [k, v] of [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
      console.log(`    ${String(v).padStart(6)}  ${k}`);
    }
  }
  console.log('  metric distributions (value:count):');
  for (const [k, values] of [...metrics.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (k === 'asymmetricShare') {
      const buckets = values.map((v) => Math.floor(v / 50) * 50);
      console.log(`    ${k.padEnd(16)} (‰, 50-wide buckets) ${histogram(buckets)}`);
    } else {
      console.log(`    ${k.padEnd(16)} ${histogram(values)}`);
    }
  }
  return invalid + errors > 0 ? 1 : 0;
}

/** test/golden.json, next to src/ (works from src/cli and dist/cli). */
const GOLDEN = fileURLToPath(new URL('../../test/golden.json', import.meta.url));

function main(argv: string[]): number {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        difficulty: { type: 'string', short: 'd' },
        count: { type: 'string', short: 'n' },
        from: { type: 'string' },
        json: { type: 'string' },
        svg: { type: 'string' },
        write: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (e) {
    throw new UsageError(e instanceof Error ? e.message : String(e));
  }
  const { values, positionals } = parsed;
  const [command, seedArg] = positionals;
  if (values.help === true || command === undefined) {
    console.log(USAGE);
    return command === undefined && values.help !== true ? 1 : 0;
  }
  const needSeed = (): string => {
    if (seedArg === undefined) throw new UsageError(`${command} needs a seed code`);
    return seedArg;
  };

  switch (command) {
    case 'random': {
      const seed = formatSeed(difficultyOf(values.difficulty), GENERATOR_VERSION, randomBytes(5));
      const { level, ms } = timed(seed);
      console.log(summary(level, ms));
      return 0;
    }
    case 'show': {
      const { level, ms } = timed(needSeed());
      console.log(summary(level, ms));
      return 0;
    }
    case 'validate': {
      const { level } = timed(needSeed());
      const again = generateLevel(level.seed);
      const issues = validateLevel(level);
      if (again.meta.levelHash !== level.meta.levelHash) {
        issues.push({ check: 'V10', message: 'generating the seed twice gave different hashes' });
      }
      console.log(issuesText(issues));
      return issues.length === 0 ? 0 : 1;
    }
    case 'dump': {
      const { level } = timed(needSeed());
      if (values.json === undefined && values.svg === undefined) {
        console.log(JSON.stringify(level, null, 2));
      }
      if (values.json !== undefined) {
        writeFileSync(userPath(values.json), `${JSON.stringify(level, null, 2)}\n`);
        console.log(`wrote ${userPath(values.json)}`);
      }
      if (values.svg !== undefined) {
        writeFileSync(userPath(values.svg), levelSvg(level));
        console.log(`wrote ${userPath(values.svg)}`);
      }
      return 0;
    }
    case 'sweep': {
      const count = Number(values.count ?? '10000');
      const from = Number(values.from ?? '0');
      if (!Number.isSafeInteger(count) || count < 1 || !Number.isSafeInteger(from) || from < 0) {
        throw new UsageError('--count and --from must be non-negative integers');
      }
      return sweep(difficultyOf(values.difficulty), count, from);
    }
    case 'golden': {
      const entries = goldenSeeds().map((seed) => {
        const level = generateLevel(seed);
        console.log(`${seed}  ${level.meta.levelHash}  ${metricsLine(level.meta.metrics)}`);
        return { seed, levelHash: level.meta.levelHash };
      });
      if (values.write === true) {
        const doc = { generatorVersion: GENERATOR_VERSION, seeds: entries };
        mkdirSync(dirname(GOLDEN), { recursive: true });
        writeFileSync(GOLDEN, `${JSON.stringify(doc, null, 2)}\n`);
        console.log(`wrote ${GOLDEN}`);
      } else {
        const current = JSON.parse(readFileSync(GOLDEN, 'utf8')) as {
          seeds: { seed: string; levelHash: string }[];
        };
        const changed = entries.filter(
          (e, i) => current.seeds[i]?.seed !== e.seed || current.seeds[i].levelHash !== e.levelHash,
        );
        console.log(
          changed.length === 0 ? 'golden: unchanged' : `golden: ${changed.length} changed`,
        );
        return changed.length === 0 ? 0 : 1;
      }
      return 0;
    }
    default:
      throw new UsageError(`unknown command '${command}'`);
  }
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  if (e instanceof UsageError || e instanceof InvalidSeedError) {
    console.error(`${e.message}\n\n${USAGE}`);
    process.exitCode = 2;
  } else if (e instanceof GenerationError) {
    console.error(e.message);
    process.exitCode = 1;
  } else {
    throw e;
  }
}
