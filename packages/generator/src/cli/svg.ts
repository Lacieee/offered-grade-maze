/**
 * SVG picture of a level's link graph for `pnpm gen dump --svg`: rooms laid out left → right
 * by depth, the spine highlighted (not generation logic; see ADR-0005).
 */
import type { Level } from '../types.js';

const COL = 200;
const ROW = 84;
const BOX_W = 150;
const BOX_H = 46;
const PAD = 40;

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Where the ray from a box centre toward `toward` leaves the box (plus a 3 px gap). */
function edgePoint(
  centre: { x: number; y: number },
  toward: { x: number; y: number },
): { x: string; y: string } {
  const dx = toward.x - centre.x;
  const dy = toward.y - centre.y;
  const hw = BOX_W / 2 + 3;
  const hh = BOX_H / 2 + 3;
  const t = Math.min(
    dx === 0 ? Infinity : hw / Math.abs(dx),
    dy === 0 ? Infinity : hh / Math.abs(dy),
  );
  return { x: (centre.x + dx * t).toFixed(1), y: (centre.y + dy * t).toFixed(1) };
}

/** Renders the level as a standalone SVG document. */
export function levelSvg(level: Level): string {
  const { depth, spine, twinOf } = level.meta;
  const byDepth = new Map<number, string[]>();
  for (const r of level.rooms) {
    const d = depth[r.id] ?? 0;
    byDepth.set(d, [...(byDepth.get(d) ?? []), r.id]);
  }
  const pos = new Map<string, { x: number; y: number }>();
  let maxRows = 1;
  for (const [d, ids] of byDepth) {
    // Spine room first in each column, then by id.
    ids.sort((a, b) => Number(spine.includes(b)) - Number(spine.includes(a)) || (a < b ? -1 : 1));
    ids.forEach((id, i) => pos.set(id, { x: PAD + d * COL, y: PAD + 30 + i * ROW }));
    maxRows = Math.max(maxRows, ids.length);
  }
  const maxDepth = Math.max(...byDepth.keys());
  const width = PAD * 2 + maxDepth * COL + BOX_W;
  const height = PAD * 2 + 30 + maxRows * ROW;

  const spineEdge = new Set<string>();
  for (let i = 0; i + 1 < spine.length; i++) spineEdge.add(`${spine[i]}>${spine[i + 1]}`);

  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
      `viewBox="0 0 ${width} ${height}" font-family="system-ui, sans-serif" font-size="12">`,
  );
  out.push(
    '<defs>' +
      '<marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#777"/></marker>' +
      '<marker id="s" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#d9480f"/></marker>' +
      '</defs>',
  );
  out.push(`<rect width="100%" height="100%" fill="#fff"/>`);
  out.push(
    `<text x="${PAD}" y="${PAD - 12}" font-size="14" font-weight="600">${esc(level.seed)} · ` +
      `${level.difficulty} · shortest ${level.meta.metrics.shortest} · ` +
      `asymmetric ${(level.meta.metrics.asymmetricShare / 10).toFixed(1)} %</text>`,
  );
  for (let d = 0; d <= maxDepth; d++) {
    out.push(
      `<text x="${PAD + d * COL + BOX_W / 2}" y="${PAD + 14}" text-anchor="middle" fill="#888">depth ${d}</text>`,
    );
  }

  // Links: one path per directed link; reciprocal pairs bend apart slightly.
  for (const r of level.rooms) {
    const a = pos.get(r.id);
    if (a === undefined) continue;
    for (const door of r.doors) {
      if (door.link === null) continue;
      const b = pos.get(door.link.room);
      if (b === undefined) continue;
      const onSpine = spineEdge.has(`${r.id}>${door.link.room}`);
      const stroke = onSpine ? '#d9480f' : '#999';
      const widthPx = onSpine ? 2.5 : 1.2;
      const marker = onSpine ? 's' : 'a';
      if (door.link.room === r.id) {
        const x = a.x + BOX_W;
        const y = a.y + BOX_H / 2;
        out.push(
          `<path d="M${x} ${y - 8} c 28 -24 28 40 0 16" fill="none" stroke="${stroke}" stroke-width="${widthPx}" marker-end="url(#${marker})"><title>${r.id}.${door.id} → ${door.link.room}.${door.link.door}</title></path>`,
        );
        continue;
      }
      const c1 = { x: a.x + BOX_W / 2, y: a.y + BOX_H / 2 };
      const c2 = { x: b.x + BOX_W / 2, y: b.y + BOX_H / 2 };
      // Curve sideways in proportion to distance; direction keeps reciprocal pairs apart.
      const ctrl = {
        x: (c1.x + c2.x) / 2 + (c2.y - c1.y) * 0.15,
        y: (c1.y + c2.y) / 2 - (c2.x - c1.x) * 0.15,
      };
      const p1 = edgePoint(c1, ctrl);
      const p2 = edgePoint(c2, ctrl);
      out.push(
        `<path d="M${p1.x} ${p1.y} Q${ctrl.x.toFixed(1)} ${ctrl.y.toFixed(1)} ${p2.x} ${p2.y}" fill="none" stroke="${stroke}" stroke-width="${widthPx}" stroke-opacity="0.8" marker-end="url(#${marker})"><title>${r.id}.${door.id} → ${door.link.room}.${door.link.door}</title></path>`,
      );
    }
  }

  // Rooms on top of the links.
  for (const r of level.rooms) {
    const p = pos.get(r.id);
    if (p === undefined) continue;
    const isStart = r.id === level.startRoom;
    const isGoal = r.id === level.goalRoom;
    const fill = isGoal
      ? '#ffe8a3'
      : isStart
        ? '#d3f9d8'
        : spine.includes(r.id)
          ? '#fff4e6'
          : '#f1f3f5';
    const stroke = spine.includes(r.id) ? '#d9480f' : '#868e96';
    const sealed = r.doors.filter((d) => d.link === null).length;
    const twin = twinOf[r.id];
    out.push(
      `<g><rect x="${p.x}" y="${p.y}" width="${BOX_W}" height="${BOX_H}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>` +
        `<text x="${p.x + 8}" y="${p.y + 18}" font-weight="600">${r.id}${isStart ? ' START' : ''}${isGoal ? ' GOAL' : ''}</text>` +
        `<text x="${p.x + 8}" y="${p.y + 35}" fill="#495057">${r.type} · ${r.doors.length}d${sealed > 0 ? ` · ${sealed} sealed` : ''}${twin ? ` · ≈${twin}` : ''}</text></g>`,
    );
  }
  out.push('</svg>');
  return out.join('\n');
}
