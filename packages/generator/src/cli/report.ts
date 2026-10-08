/**
 * Text output of the `pnpm gen` CLI (not generation logic; see ADR-0005).
 */
import type { Level, LevelMetrics, ValidationIssue } from '../types.js';

/** Multi-line summary of a level: rooms by depth, links, metrics. */
export function summary(level: Level, ms: number): string {
  const { meta } = level;
  const spine = new Set(meta.spine);
  const lines: string[] = [];
  lines.push(
    `${level.seed}  ${level.difficulty}  generator v${level.generatorVersion}  ` +
      `attempts ${meta.attempts}  ${ms.toFixed(1)} ms`,
  );
  lines.push(`start ${level.startRoom}  goal ${level.goalRoom}  spine ${meta.spine.join(' → ')}`);
  lines.push(`hash ${meta.levelHash}`);
  lines.push('');
  const rooms = [...level.rooms].sort(
    (a, b) => (meta.depth[a.id] ?? 0) - (meta.depth[b.id] ?? 0) || (a.id < b.id ? -1 : 1),
  );
  for (const r of rooms) {
    const tags = [
      r.id === level.startRoom ? 'START' : '',
      r.id === level.goalRoom ? 'GOAL' : '',
      spine.has(r.id) ? 'spine' : '',
      meta.twinOf[r.id] ? `twin of ${String(meta.twinOf[r.id])}` : '',
    ].filter((t) => t !== '');
    lines.push(
      `${r.id}  depth ${String(meta.depth[r.id] ?? '?').padStart(2)}  ${r.type.padEnd(8)} ` +
        `${r.width}×${r.depth} m  ${tags.join(', ')}`,
    );
    for (const d of r.doors) {
      const to = d.link === null ? 'sealed' : `→ ${d.link.room}.${d.link.door}`;
      lines.push(`    ${d.id} ${d.wall} ${String(d.offset).padStart(5)}  ${to}`);
    }
    const items = r.furniture.map((f) => (f.signature === true ? `★${f.prefab}` : f.prefab));
    lines.push(`    furniture: ${items.join(', ')}`);
  }
  lines.push('');
  lines.push(metricsLine(meta.metrics));
  return lines.join('\n');
}

/** One line of metrics. */
export function metricsLine(m: LevelMetrics): string {
  return (
    `rooms ${m.rooms}  doors ${m.doors}  links ${m.links}  shortest ${m.shortest}  ` +
    `asymmetric ${(m.asymmetricShare / 10).toFixed(1)} %  self ${m.selfLinks}  ` +
    `sealed ${m.sealedDoors}  longBack ${m.longBackLinks}  twins ${m.twins}  ` +
    `misleading ${m.misleadingDoors}  missingRequired ${m.missingRequired}`
  );
}

/** Validator issues as lines, or "valid". */
export function issuesText(issues: readonly ValidationIssue[]): string {
  if (issues.length === 0) return 'valid';
  return issues.map((i) => `${i.check}  ${i.message}`).join('\n');
}

/** p-th percentile (0–100) of an ascending array, nearest rank. */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[rank] ?? 0;
}

/** Histogram line: `value:count value:count …`, values ascending. */
export function histogram(values: readonly number[]): string {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([v, c]) => `${v}:${c}`)
    .join(' ');
}
