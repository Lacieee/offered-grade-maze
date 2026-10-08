/**
 * SVG picture of a level for `pnpm gen dump --svg` (not generation logic; see ADR-0005):
 * the link graph (rooms left → right by depth, the spine highlighted), then one floor plan
 * per room with doors, reserved zones and furniture (CP05 T8).
 */
import { GRID, PREFABS, doorFrame, rotatedFootprint, type RoomDTO } from '@ogm/shared';
import type { Level } from '../types.js';
import { zonesOf } from '../validate/furniture.js';

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
  const graphHeight = PAD * 2 + 30 + maxRows * ROW;
  const plans = [...level.rooms].sort(
    (a, b) => (depth[a.id] ?? 0) - (depth[b.id] ?? 0) || (a.id < b.id ? -1 : 1),
  );
  const planRows = Math.ceil(plans.length / PLANS_PER_ROW);
  const width = Math.max(PAD * 2 + maxDepth * COL + BOX_W, PAD * 2 + PLANS_PER_ROW * PLAN_W);
  const height = graphHeight + planRows * PLAN_H + PAD;

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
  plans.forEach((room, i) => {
    const x = PAD + (i % PLANS_PER_ROW) * PLAN_W;
    const y = graphHeight + Math.floor(i / PLANS_PER_ROW) * PLAN_H;
    out.push(floorPlan(room, x, y, room.id === level.startRoom, room.id === level.goalRoom));
  });
  out.push('</svg>');
  return out.join('\n');
}

const PLANS_PER_ROW = 6;
const PLAN_W = 400;
const PLAN_H = 440;
/** Pixels per metre in the floor plans (9 m → 360 px). */
const PX = 40;

/** One room's floor plan, top-left at (x, y): north is up. */
function floorPlan(room: RoomDTO, x: number, y: number, isStart: boolean, isGoal: boolean): string {
  const ox = x + 10;
  const oy = y + 34;
  const W = room.width * PX;
  const D = room.depth * PX;
  // Room coordinates (m) → SVG pixels.
  const px = (m: number): number => ox + (m + room.width / 2) * PX;
  const pz = (m: number): number => oy + (m + room.depth / 2) * PX;
  const out: string[] = [];
  const swatches = [room.palette.wall, room.palette.floor, room.palette.trim]
    .map(
      (c, i) =>
        `<rect x="${x + 300 + i * 18}" y="${y + 8}" width="14" height="14" fill="${c}" stroke="#555"/>`,
    )
    .join('');
  out.push(
    `<g><text x="${x + 10}" y="${y + 20}" font-weight="600">${room.id} · ${room.type} · ${room.width} × ${room.depth} m${isStart ? ' · START' : ''}${isGoal ? ' · GOAL' : ''}</text>${swatches}`,
  );
  out.push(
    `<rect x="${ox}" y="${oy}" width="${W}" height="${D}" fill="${room.palette.floor}" fill-opacity="0.25" stroke="#333" stroke-width="2"/>`,
  );
  // Reserved zones: cell boxes from the validator.
  for (const z of zonesOf(room, isStart, isGoal)) {
    out.push(
      `<rect x="${ox + z.x0 * GRID * PX}" y="${oy + z.z0 * GRID * PX}" width="${(z.x1 - z.x0) * GRID * PX}" height="${(z.z1 - z.z0) * GRID * PX}" fill="#4dabf7" fill-opacity="0.15" stroke="#4dabf7" stroke-dasharray="3 2"/>`,
    );
  }
  // Doors: a thick bar on the wall, orange when linked, grey when sealed.
  for (const door of room.doors) {
    const o = doorFrame(room, door).origin;
    const horizontal = door.wall === 'N' || door.wall === 'S';
    const cx = horizontal ? px(o.x) : door.wall === 'W' ? ox : ox + W;
    const cz = horizontal ? (door.wall === 'N' ? oy : oy + D) : pz(o.z);
    const half = (PX * 1.0) / 2;
    const [x1, y1, x2, y2] = horizontal
      ? [cx - half, cz, cx + half, cz]
      : [cx, cz - half, cx, cz + half];
    out.push(
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${door.link === null ? '#868e96' : '#d9480f'}" stroke-width="6"><title>${door.id}${door.link ? ` → ${door.link.room}.${door.link.door}` : ' sealed'}</title></line>`,
      `<text x="${cx}" y="${cz}" dy="${door.wall === 'N' ? -6 : door.wall === 'S' ? 14 : 4}" dx="${door.wall === 'W' ? -16 : door.wall === 'E' ? 6 : -6}" font-size="10" fill="#d9480f">${door.id}</text>`,
    );
  }
  // Furniture: rugs dashed, wall-hung items as thin bars, blocking items solid; the signature
  // in magenta. A short tick marks each item's front.
  const items = [...room.furniture].sort(
    (a, b) => Number(PREFABS[a.prefab].blocks) - Number(PREFABS[b.prefab].blocks),
  );
  for (const f of items) {
    const meta = PREFABS[f.prefab];
    const { w, d } = rotatedFootprint(
      f.prefab,
      f.variant < meta.footprint.length ? f.variant : 0,
      f.rot,
    );
    const rw = w * GRID * PX;
    const rd = d * GRID * PX;
    const rx = px(f.x) - rw / 2;
    const rz = pz(f.z) - rd / 2;
    const sig = f.signature === true;
    const hung = meta.mountY !== undefined;
    const stroke = sig ? '#c2255c' : hung ? '#5f3dc4' : '#343a40';
    const fill = sig
      ? '#f783ac'
      : hung
        ? '#d0bfff'
        : meta.blocks
          ? (f.colors[0] ?? '#adb5bd')
          : 'none';
    out.push(
      `<rect x="${rx}" y="${rz}" width="${rw}" height="${rd}" fill="${fill}" fill-opacity="${meta.blocks ? 0.75 : 0.5}" stroke="${stroke}" stroke-width="${sig ? 2 : 1}"${meta.blocks || hung ? '' : ' stroke-dasharray="4 3"'}><title>${f.id} ${f.prefab} v${f.variant} rot ${f.rot}</title></rect>`,
    );
    if (meta.blocks) {
      const fx = [0, 1, 0, -1][f.rot] ?? 0;
      const fz = [1, 0, -1, 0][f.rot] ?? 0;
      const cx = px(f.x);
      const cz = pz(f.z);
      out.push(
        `<line x1="${cx + (fx * rw) / 2}" y1="${cz + (fz * rd) / 2}" x2="${cx + (fx * rw) / 2 + fx * 6}" y2="${cz + (fz * rd) / 2 + fz * 6}" stroke="${stroke}" stroke-width="2"/>`,
      );
    }
    if (meta.blocks || sig) {
      const label = f.prefab.replace(/^sig_/, '★').replace(/_/g, ' ');
      out.push(
        `<text x="${px(f.x)}" y="${pz(f.z) + 3}" text-anchor="middle" font-size="9" fill="#212529">${esc(label)}</text>`,
      );
    }
  }
  out.push('</g>');
  return out.join('');
}
